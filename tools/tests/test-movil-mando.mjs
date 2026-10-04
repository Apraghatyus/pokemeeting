// En movil, los botones tienen que verse y poder pulsarse. Siempre.
//
// Tres cosas que se vieron jugando desde el telefono:
//
//   - La barra de arriba se comia el sitio y el mando salia cortado por abajo.
//   - Pantalla completa dejaba el juego SIN botones. La causa: se pedia sobre
//     la pantalla sola, y el navegador en pantalla completa pinta unicamente el
//     elemento que se le pide, asi que el mando -que esta fuera- desaparecia.
//   - Girando el telefono la partida se quedaba en un cuarto del alto.
//
// Uso: node tools/tests/test-movil-mando.mjs <rom.gba>
import { chromium, devices } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-movil-mando.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

const abrir = async (opciones) => {
  const page = await (await navegador.newContext(opciones)).newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, { timeout: 30_000 });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3500);
  return page;
};

/** ¿Entra entero en la ventana, sin tener que bajar? */
const cabeEntero = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const c = el.getBoundingClientRect();
    return { visible: c.bottom <= innerHeight + 1 && c.top >= -1, abajo: Math.round(c.bottom), alto: innerHeight };
  }, selector);

// ------------------------------------------------------------- vertical
const movil = await abrir({ ...devices['Pixel 5'] });

const mando = await cabeEntero(movil, '.pad');
check('en vertical el mando entra entero en la pantalla', mando?.visible,
  `acaba en ${mando?.abajo} de ${mando?.alto}`);

// La barra se encoge mientras se juega: era lo que empujaba el mando hacia abajo.
const barra = await movil.evaluate(() => Math.round(document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0));
check('la barra se aprieta mientras juegas', barra <= 60, `${barra}px`);

// Y los botones de abajo del todo se pueden pulsar de verdad.
const start = movil.locator('.pad__menu button', { hasText: 'Start' });
const cajaStart = await start.boundingBox();
check('el boton de abajo del todo es alcanzable',
  cajaStart !== null && cajaStart.y + cajaStart.height <= 727,
  cajaStart ? `acaba en ${Math.round(cajaStart.y + cajaStart.height)}` : 'no se ve');

// ------------------------------------------------- pantalla completa
await movil.locator('.pantalla__boton--completa').click();
await movil.waitForTimeout(900);

const enCompleta = await movil.evaluate(() => document.fullscreenElement?.className ?? null);
check('la pantalla completa se pide sobre el marco que lleva el mando',
  enCompleta !== null && enCompleta.includes('juego'), enCompleta ?? 'no entro');

const mandoEnCompleta = await movil.evaluate(() => {
  const pad = document.querySelector('.pad');
  if (!pad) return { hay: false };
  const c = pad.getBoundingClientRect();
  return { hay: true, ancho: Math.round(c.width), alto: Math.round(c.height), dentro: document.fullscreenElement?.contains(pad) ?? false };
});
check('en pantalla completa el mando SIGUE ahi', mandoEnCompleta.hay && mandoEnCompleta.alto > 0,
  mandoEnCompleta.hay ? `${mandoEnCompleta.ancho}x${mandoEnCompleta.alto}` : 'ha desaparecido');
check('y cuelga del elemento que esta a pantalla completa', mandoEnCompleta.dentro);

// Lo que de verdad importa: que se pueda jugar.
const antes = await movil.locator('canvas').screenshot();
await movil.locator('.pad__menu button', { hasText: 'Start' }).tap();
await movil.waitForTimeout(1200);
check('y se puede pulsar un boton estando en pantalla completa',
  Buffer.compare(antes, await movil.locator('canvas').screenshot()) !== 0);

// El equipo tiene que seguir viendose: en un Soul Link es lo que se consulta
// entre combate y combate, y salir de pantalla completa para mirarlo rompe la
// partida mas de lo que arregla ganar unos pixeles.
const equipoEnCompleta = await movil.evaluate(() => {
  const eq = document.querySelector('.equipo');
  if (!eq) return { hay: false };
  const c = eq.getBoundingClientRect();
  return {
    hay: true,
    alto: Math.round(c.height),
    dentro: document.fullscreenElement?.contains(eq) ?? false,
  };
});
check('en pantalla completa el equipo sigue a la vista',
  equipoEnCompleta.hay && equipoEnCompleta.alto > 0 && equipoEnCompleta.dentro,
  equipoEnCompleta.hay ? `${equipoEnCompleta.alto}px de alto` : 'no esta');

await movil.locator('.pantalla__boton--completa').click();
await movil.waitForTimeout(600);

// --------------------------------------------- la ficha, con un Pokemon
// Se inyecta el mismo marcado que produce EquipoPanel: lo que se comprueba son
// las reglas de estilo, y con el equipo vacio no se veria ninguna.
const ficha = await movil.evaluate(() => {
  const lista = document.querySelector('.equipo__lista');
  if (!lista) return null;
  lista.innerHTML = `<li class="ficha">
    <span class="ficha__sprite ficha__sprite--imagen"></span>
    <span class="ficha__datos">
      <strong class="ficha__nombre">ZAPDOS</strong>
      <span class="ficha__linea"><span class="ficha__nivel">Nv.5</span></span>
      <span class="ficha__linea"><span class="tipo">ELECTRICO</span><span class="tipo">VOLADOR</span></span>
    </span></li>`;
  const chips = [...lista.querySelectorAll('.tipo')];
  const nivel = lista.querySelector('.ficha__nivel').getBoundingClientRect();
  const pad = document.querySelector('.pad').getBoundingClientRect();
  return {
    visibles: chips.filter((c) => getComputedStyle(c).display !== 'none').length,
    // Si el tipo esta a la altura del nivel, no le cuesta alto a la ficha.
    alLado: Math.abs(chips[0].getBoundingClientRect().top - nivel.top) < 14,
    padAbajo: Math.round(pad.bottom),
    ventana: innerHeight,
  };
});

check('se ven los dos tipos del Pokemon', ficha?.visibles === 2, `${ficha?.visibles} de 2`);
check('y van al lado del nivel, sin gastar otra linea', ficha?.alLado);
check('con un Pokemon en el equipo, el mando sigue cabiendo',
  ficha !== null && ficha.padAbajo <= ficha.ventana,
  `acaba en ${ficha?.padAbajo} de ${ficha?.ventana}`);

// ------------------------------------------------------------ horizontal
const tumbado = await abrir({ ...devices['Pixel 5 landscape'] });

const medidas = await tumbado.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const c = el.getBoundingClientRect();
    return { w: Math.round(c.width), h: Math.round(c.height), x: Math.round(c.x), y: Math.round(c.y) };
  };
  return {
    ventana: { w: innerWidth, h: innerHeight },
    pantalla: r('.pantalla--grande'),
    dpad: r('.dpad'),
    cara: r('.pad__face'),
    barra: r('.topbar'),
  };
});

check('tumbado, la partida usa casi todo el alto',
  medidas.pantalla.h >= medidas.ventana.h * 0.85,
  `${medidas.pantalla.h} de ${medidas.ventana.h}`);
check('y la barra no ocupa sitio', (medidas.barra?.h ?? 0) === 0, `${medidas.barra?.h ?? 0}px`);

// Repartidos a los lados, como en cualquier emulador de movil.
check('la cruceta queda a la izquierda', medidas.dpad.x < medidas.ventana.w * 0.3,
  `x=${medidas.dpad.x}`);
check('y A y B a la derecha', medidas.cara.x > medidas.ventana.w * 0.6,
  `x=${medidas.cara.x}`);
const centrado = await tumbado.evaluate(() => {
  const p = document.querySelector('.pantalla--grande').getBoundingClientRect();
  return { izq: Math.round(p.x), der: Math.round(innerWidth - p.right) };
});
check('la partida queda centrada, no pegada a un lado',
  Math.abs(centrado.izq - centrado.der) <= 4,
  `${centrado.izq}px a la izquierda, ${centrado.der}px a la derecha`);

check('los dos abajo, donde caen los pulgares',
  medidas.dpad.y > medidas.ventana.h * 0.3 && medidas.cara.y > medidas.ventana.h * 0.3,
  `cruceta y=${medidas.dpad.y}, cara y=${medidas.cara.y}`);

await navegador.close();
console.log(fallos === 0 ? '\nEL MANDO SE VE Y SE PULSA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

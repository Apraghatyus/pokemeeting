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

await movil.locator('.pantalla__boton--completa').click();
await movil.waitForTimeout(600);

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
check('los dos abajo, donde caen los pulgares',
  medidas.dpad.y > medidas.ventana.h * 0.3 && medidas.cara.y > medidas.ventana.h * 0.3,
  `cruceta y=${medidas.dpad.y}, cara y=${medidas.cara.y}`);

await navegador.close();
console.log(fallos === 0 ? '\nEL MANDO SE VE Y SE PULSA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

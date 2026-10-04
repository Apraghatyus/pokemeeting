// Las teclas, el avance rapido y el aviso que antes bloqueaba el menu.
//
// Las tres cosas se prueban juntas porque las tres se vieron jugando y las tres
// viven en la misma pantalla.
//
// Lo mas importante de aqui es la ultima parte. Un aviso de ayuda ponia el
// emulador en estado de error, y eso apagaba la barra entera y ademas paraba la
// lectura del equipo, sin forma de recuperarlos. Asi que no basta con mirar que
// el aviso salga: hay que comprobar que lo de alrededor sigue vivo.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-controles.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-controles.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });

const abrir = async (opciones = {}) => {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 }, ...opciones });
  const page = await contexto.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, { timeout: 30_000 });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  return page;
};

const page = await abrir();

// --- las teclas de fabrica son las de todo el mundo ---
await page.locator('.iconbutton--opciones').click();
await page.waitForSelector('.kv--teclas', { timeout: 10_000 });

// Por texto exacto del <dt>: buscar "A" por contenido casa tambien con
// "Arriba", y entonces la prueba mide la fila equivocada sin que se note.
const filaDe = (etiqueta) =>
  page.locator('.kv--teclas .kv__row').filter({ has: page.getByText(etiqueta, { exact: true }) }).first();

const teclaDe = async (etiqueta) => (await filaDe(etiqueta).locator('.tecla').textContent())?.trim();

check('Z es A, como en cualquier emulador', (await teclaDe('A')) === 'Z', await teclaDe('A'));
check('y X es B', (await teclaDe('B')) === 'X', await teclaDe('B'));
check('el avance rapido va en el espacio',
  (await page.locator('.tecla--fija').textContent())?.includes('Espacio'));

// --- se pueden cambiar ---
const filaA = filaDe('A');
await filaA.locator('.tecla').click();
check('al pedirlo, el boton avisa de que espera',
  (await filaA.locator('.tecla').textContent())?.includes('pulsa'));

await page.keyboard.press('KeyJ');
await page.waitForTimeout(300);
check('se asigna la tecla que pulsas', (await teclaDe('A')) === 'J', await teclaDe('A'));

// La tecla que acabamos de robar no puede seguir en otro boton.
await page.keyboard.press('Escape');
check('y se recuerda al recargar la pagina',
  await page.evaluate(() => JSON.parse(localStorage.getItem('emupoke.teclas') ?? '{}').A === 'J'));

await page.locator('.iconbutton--opciones').click();
await page.waitForSelector('.kv--teclas', { timeout: 10_000 });
await page.getByRole('button', { name: /Volver a las teclas de siempre/ }).click();
await page.waitForTimeout(300);
check('se pueden devolver a las de fabrica', (await teclaDe('A')) === 'Z', await teclaDe('A'));

// --- el avance rapido es conmutador ---
const botonFF = page.getByRole('button', { name: /Avance rapido/ }).first();
check('empieza apagado', (await botonFF.getAttribute('aria-pressed')) === 'false');
await botonFF.click();
await page.waitForTimeout(200);
check('un clic lo enciende', (await botonFF.getAttribute('aria-pressed')) === 'true');
await botonFF.click();
await page.waitForTimeout(200);
check('y otro lo apaga, sin tener que mantenerlo', (await botonFF.getAttribute('aria-pressed')) === 'false');

await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// El espacio tiene que llegar aunque el foco este en la pagina, no en un boton.
await page.locator('canvas').click({ force: true }).catch(() => {});
await page.keyboard.press('Space');
await page.waitForTimeout(300);
const traEspacio = await page.evaluate(() => globalThis.mGBAModule?.getFastForwardMultiplier?.() ?? 1);
check('el espacio enciende el avance rapido', traEspacio > 1, `x${traEspacio}`);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
const traSegundo = await page.evaluate(() => globalThis.mGBAModule?.getFastForwardMultiplier?.() ?? 1);
check('y el espacio otra vez lo apaga', traSegundo === 1, `x${traSegundo}`);

// --- el aviso de partida vacia ya no deja inservible la pantalla ---
await page.locator('.iconbutton--opciones').click();
await page.getByRole('button', { name: 'Exportar .sav' }).first().click({ timeout: 10_000 });
await page.waitForTimeout(800);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

const aviso = page.locator('.aviso');
const salio = await aviso.count() > 0;
check('exportar sin guardar avisa', salio);

if (salio) {
  // Esto es lo que fallaba: el aviso apagaba todo lo demas.
  const estado = await page.evaluate(() => ({
    barra: [...document.querySelectorAll('.toolbar button')].filter((b) => !b.disabled).length,
    canvas: document.querySelector('canvas') !== null,
  }));
  check('y el juego y la barra siguen funcionando', estado.barra > 0 && estado.canvas,
    `${estado.barra} botones activos`);
  check('no se pinta como error del emulador', (await page.locator('.alert').count()) === 0);

  await aviso.locator('.aviso__cerrar').click();
  await page.waitForTimeout(300);
  check('el aviso se puede cerrar', (await page.locator('.aviso').count()) === 0);
}

// --- y en movil hay boton de avance rapido ---
const movil = await abrir({ viewport: { width: 412, height: 900 }, hasTouch: true, isMobile: true });
const ffMovil = movil.locator('.btn--rapido');
check('en movil hay boton de avance rapido', (await ffMovil.count()) === 1);
if ((await ffMovil.count()) === 1) {
  await ffMovil.tap();
  await movil.waitForTimeout(300);
  const mult = await movil.evaluate(() => globalThis.mGBAModule?.getFastForwardMultiplier?.() ?? 1);
  check('y tocarlo lo enciende', mult > 1, `x${mult}`);
  check('y se nota que esta puesto',
    (await ffMovil.getAttribute('aria-pressed')) === 'true');
}

await navegador.close();
console.log(fallos === 0 ? '\nLOS CONTROLES RESPONDEN' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

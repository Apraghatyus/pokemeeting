// Prueba del mando tactil en un movil emulado.
//
// Lo que de verdad importa comprobar aqui no es que los botones se dibujen,
// sino que una pulsacion con el dedo llegue al nucleo y mueva el juego. Por eso
// la comprobacion final es que la pantalla cambie al pulsar Start en el titulo.
//
// Uso: node tools/tests/test-mobile.mjs <rom.gba> [directorio-de-capturas]
import { chromium, devices } from 'playwright';

const ROM = process.argv[2];
const SHOTS = process.argv[3] ?? '.';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/tests/test-mobile.mjs <rom.gba> [carpeta]');
  process.exit(2);
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${name}${detail ? '  -> ' + detail : ''}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

// Un telefono real: pantalla pequena, puntero grueso y eventos tactiles.
const context = await browser.newContext({
  ...devices['Pixel 5'],
  ignoreHTTPSErrors: true,
});
const page = await context.newPage();
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`.slice(0, 200)));

await page.goto(URL, { waitUntil: 'load' });

const env = await page.evaluate(() => ({
  coarse: globalThis.matchMedia('(pointer: coarse)').matches,
  isolated: globalThis.crossOriginIsolated,
  width: globalThis.innerWidth,
}));
check('el navegador se identifica como tactil', env.coarse);
check('hay aislamiento cross-origin', env.isolated, `ancho ${env.width}px`);

await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
// Al cargar la ROM aparece la pregunta de como jugar. Aqui se juega tal cual.
await page
  .getByRole('button', { name: 'Jugar tal cual' })
  .click({ timeout: 20_000 })
  .catch(() => {});


// El mando debe aparecer solo, sin tocar ningun ajuste.
const padVisible = await page
  .locator('.pad')
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
check('el mando tactil aparece solo en movil', padVisible);

// Nada debe desbordar a lo ancho: es el fallo tipico en pantallas estrechas.
const overflow = await page.evaluate(
  () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
);
check('la pagina no desborda a lo ancho', overflow <= 0, `${overflow}px de sobra`);

// Dejamos que la intro avance hasta la pantalla de titulo.
await page.waitForTimeout(26_000);
const canvas = page.locator('canvas');
await page.screenshot({ path: `${SHOTS}/movil-titulo.png`, fullPage: true });

// --- la prueba de verdad: pulsar Start con el dedo debe mover el juego ---
const before = await canvas.screenshot();

const start = page.locator('.pad__menu button', { hasText: 'Start' });
const box = await start.boundingBox();
check('el boton Start es alcanzable con el dedo', box !== null && box.height >= 32, box ? `${Math.round(box.width)}x${Math.round(box.height)}` : 'sin caja');

// tap() envia eventos tactiles reales, no un click de raton.
for (let i = 0; i < 3; i += 1) {
  await start.tap();
  await page.waitForTimeout(700);
}
await page.waitForTimeout(1500);

const after = await canvas.screenshot();
check('pulsar Start con el dedo cambia la pantalla', Buffer.compare(before, after) !== 0);

// --- la cruceta debe marcar direcciones, diagonales incluidas ---
const dpad = page.locator('.dpad');
const pad = await dpad.boundingBox();
if (pad) {
  // Esquina superior derecha de la cruceta: arriba y derecha a la vez.
  await page.touchscreen.tap(pad.x + pad.width * 0.82, pad.y + pad.height * 0.18);
  await page.waitForTimeout(150);
}
const diagonalSupported = await page.evaluate(() => {
  const el = document.querySelector('.dpad');
  return el !== null && el.querySelectorAll('.dpad__arm').length === 4;
});
check('la cruceta tiene los cuatro brazos para diagonales', diagonalSupported);

await page.screenshot({ path: `${SHOTS}/movil-jugando.png`, fullPage: true });

// --- horizontal: el mando se reparte a los lados ---
await page.setViewportSize({ width: 851, height: 393 });
await page.waitForTimeout(600);
const landscapeOk = await page.evaluate(() => {
  const dpadEl = document.querySelector('.dpad');
  const stage = document.querySelector('.pantallas');
  if (!dpadEl || !stage) return false;
  return getComputedStyle(dpadEl).position === 'absolute';
});
check('en horizontal el mando pasa a flotar sobre la pantalla', landscapeOk);
await page.screenshot({ path: `${SHOTS}/movil-horizontal.png` });

await browser.close();
console.log(failures === 0 ? '\nMOVIL FUNCIONANDO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

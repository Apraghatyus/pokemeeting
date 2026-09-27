// Prueba de humo del emulador en un navegador real.
//
// Comprueba lo que no se puede comprobar con tipos: que el nucleo wasm arranca
// con aislamiento cross-origin, que carga una ROM y que el canvas acaba
// dibujando algo distinto de negro. Sin esto, "compila" no significa "emula".
//
// Uso: node tools/smoke.mjs <ruta-a-rom.gba> [salida.png]
import { chromium } from 'playwright';

const rom = process.argv[2];
const out = process.argv[3] ?? 'smoke.png';
const url = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!rom) {
  console.error('Falta la ruta de la ROM.\nUso: node tools/smoke.mjs <rom.gba> [salida.png]');
  process.exit(2);
}

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

const noise = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => noise.push(`[pageerror] ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400) noise.push(`[http ${r.status()}] ${r.url()}`);
});

await page.goto(url, { waitUntil: 'load' });

const env = await page.evaluate(() => ({
  isolated: globalThis.crossOriginIsolated,
  sab: typeof SharedArrayBuffer !== 'undefined',
}));
console.log(`crossOriginIsolated=${env.isolated}  SharedArrayBuffer=${env.sab}`);

await page.getByRole('button', { name: 'Elegir fichero' }).waitFor({ state: 'visible' });
const booted = await page
  .waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  })
  .then(() => true)
  .catch(() => false);
console.log(`nucleo listo=${booted}  mensaje="${await page.locator('.dropzone__hint').textContent()}"`);

await page.setInputFiles('input[type=file][accept*=".gba"]', rom);

// La intro de FireRed tarda unos segundos en llegar a dibujar algo reconocible.
// La comprobacion que importa.
//
// No sirve leer el canvas con drawImage/getImageData: mGBA dibuja con WebGL2 sin
// preserveDrawingBuffer, asi que una lectura directa devuelve negro aunque este
// emulando. Lo que si es fiable es la captura compuesta por el navegador: si la
// imagen cambia entre muestras, hay emulacion de verdad.
const canvas = page.locator('canvas');
await canvas.click(); // el canvas necesita el foco para recibir teclado

const frames = [];
for (let i = 0; i < 24; i += 1) {
  await page.waitForTimeout(1000);
  frames.push(await canvas.screenshot());
  // Pulsamos Start/A periodicamente para atravesar la intro hasta el titulo.
  if (i >= 6 && i % 2 === 0) await page.keyboard.press(i % 4 === 0 ? 'Enter' : 'x');
}
const changed = frames.filter((f, i) => i > 0 && Buffer.compare(frames[i - 1], f) !== 0).length;
// El tamano del PNG es un buen indicador de cuanto detalle hay en pantalla:
// un fundido a negro comprime a ~3 KB, una pantalla de titulo a ~27 KB.
const richest = Math.max(...frames.map((f) => f.length));
const romTitle = await page
  .locator('.panel', { hasText: 'ROM cargada' })
  .locator('dd')
  .first()
  .textContent()
  .catch(() => null);
console.log(`ficha de ROM: ${romTitle ?? 'NO VISIBLE'}`);
console.log(`fotogramas distintos: ${changed}/${frames.length - 1}   detalle maximo: ${richest} bytes`);

await page.screenshot({ path: out, fullPage: true });
console.log(`captura en ${out}`);
if (noise.length) console.log('--- consola del navegador ---\n' + noise.slice(0, 15).join('\n'));

await browser.close();

// Exigimos ambas cosas: que la imagen se mueva y que en algun momento haya
// una pantalla con contenido real, no solo parpadeos de fundido.
const emulating = changed >= 5 && richest > 15_000;
console.log(emulating ? 'RESULTADO: el emulador esta dibujando el juego' : 'RESULTADO: no parece estar emulando');
process.exit(emulating ? 0 : 1);

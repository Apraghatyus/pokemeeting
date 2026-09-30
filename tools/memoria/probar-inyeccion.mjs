// Carga un estado modificado en el emulador y navega hasta el menu del equipo.
//
// Es la unica prueba que vale de verdad: que los bytes cuadren no significa
// que el juego los acepte. Si aparece en el menu, el intercambio funciona.
//
// Uso: node tools/memoria/probar-inyeccion.mjs <rom.gba> <estado.bin> <carpeta>
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [, , ROM, ESTADO, SHOTS] = process.argv;
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on('pageerror', (e) => {
  if (!/unwind/.test(e.message)) console.log(`[pageerror] ${e.message}`.slice(0, 160));
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, { timeout: 30_000 });
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(6000);

// Se mete el estado modificado en el sistema de ficheros del nucleo y se carga.
const estado = [...new Uint8Array(readFileSync(ESTADO))];
const cargado = await page.evaluate(async (bytes) => {
  const m = globalThis.mGBAModule;
  const base = m.gameName.split('/').pop().replace(/\.gba$/i, '');
  const ruta = `${m.filePaths().saveStatePath}/${base}.ss3`;
  m.FS.writeFile(ruta, new Uint8Array(bytes));
  await new Promise((r) => setTimeout(r, 200));
  return m.loadStateSlot(3, 0);
}, estado);
console.log('estado cargado:', cargado);

await page.waitForTimeout(3000);
const canvas = page.locator('canvas');
await canvas.click();
await canvas.screenshot({ path: `${SHOTS}/inyeccion-1-cargado.png` });

/**
 * Pulsa una tecla manteniendola un momento.
 *
 * Una pulsacion instantanea puede caer entre dos fotogramas y el juego no
 * llega a verla: hay que sostenerla unos milisegundos.
 */
const pulsar = async (tecla, ms = 160) => {
  await page.keyboard.down(tecla);
  await page.waitForTimeout(ms);
  await page.keyboard.up(tecla);
  await page.waitForTimeout(700);
};

// Start abre el menu del juego.
await pulsar('Enter');
await canvas.screenshot({ path: `${SHOTS}/inyeccion-2-menu.png` });

// POKEMON es la primera entrada del menu, asi que basta con aceptar.
// En este teclado la A del mando es la tecla X.
await pulsar('x', 200);
// El menu del equipo entra con animacion: hay que dejarla terminar antes de
// mirar, o los datos de las ranuras aun no estan dibujados.
await page.waitForTimeout(4000);
await canvas.screenshot({ path: `${SHOTS}/inyeccion-3-equipo.png` });

// Y se baja el cursor al Pokemon recien llegado para ver su ficha.
await pulsar('ArrowDown');
await page.waitForTimeout(1500);
await canvas.screenshot({ path: `${SHOTS}/inyeccion-4-elegido.png` });
console.log('capturas guardadas');
await browser.close();

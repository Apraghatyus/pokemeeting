// Carga en el emulador las dos partidas de un intercambio, cada una con su ROM.
//
// Que los bytes cuadren y el checksum sea correcto no prueba nada: lo que hay
// que ver es el Pokemon recibido dentro del menu del equipo, en la copia
// aleatorizada del que lo recibe. Si aparece ahi, el intercambio funciona.
//
// Uso: node tools/memoria/probar-intercambio.mjs <romA> <estadoA> <romB> <estadoB> <carpeta>
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [, , ROM_A, ESTADO_A, ROM_B, ESTADO_B, SHOTS] = process.argv;
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
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});

/** Una pulsacion instantanea puede caer entre dos fotogramas y el juego no la ve. */
const pulsar = async (tecla, ms = 180) => {
  await page.keyboard.down(tecla);
  await page.waitForTimeout(ms);
  await page.keyboard.up(tecla);
  await page.waitForTimeout(700);
};

const mirarEquipo = async (etiqueta, rom, estadoRuta) => {
  // Se recarga la pagina entre los dos jugadores: con una partida en marcha ya
  // no hay selector de fichero, porque la zona de carga desaparece.
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  console.log(`\n--- ${etiqueta}: ${rom.split(/[\/]/).pop()} ---`);
  await page.setInputFiles('input[type=file][accept*=".gba"]', rom);
  await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 });
  await page.waitForTimeout(6000);

  const estado = [...new Uint8Array(readFileSync(estadoRuta))];
  const cargado = await page.evaluate(async (bytes) => {
    const m = globalThis.mGBAModule;
    const base = m.gameName.split('/').pop().replace(/\.gba$/i, '');
    m.FS.writeFile(`${m.filePaths().saveStatePath}/${base}.ss3`, new Uint8Array(bytes));
    await new Promise((r) => setTimeout(r, 200));
    return m.loadStateSlot(3, 0);
  }, estado);
  console.log(`estado cargado: ${cargado}`);
  if (!cargado) return false;

  await page.waitForTimeout(2500);
  const canvas = page.locator('canvas').first();
  await canvas.click();
  // Start abre el menu, y POKEMON es la primera entrada: basta con aceptar.
  // En este teclado la A del mando es la tecla X.
  await pulsar('Enter');
  await pulsar('x', 220);
  // El menu del equipo entra con animacion; si se mira antes, las ranuras
  // todavia no estan dibujadas y la captura engana.
  await page.waitForTimeout(4000);
  await canvas.screenshot({ path: `${SHOTS}/intercambio-${etiqueta}.png` });
  console.log(`captura: intercambio-${etiqueta}.png`);
  return true;
};

const okA = await mirarEquipo('A', ROM_A, ESTADO_A);
const okB = await mirarEquipo('B', ROM_B, ESTADO_B);
await browser.close();
process.exitCode = okA && okB ? 0 : 1;

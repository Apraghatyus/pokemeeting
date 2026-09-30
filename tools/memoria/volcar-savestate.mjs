// Genera un savestate real y lo vuelca a disco para poder estudiarlo.
//
// Es el primer paso hacia los intercambios: mGBA-wasm no expone lectura de
// memoria, pero un savestate de GBA contiene la EWRAM entera, y el equipo
// Pokemon vive ahi. Hay que averiguar en que desplazamiento empieza.
//
// Uso: node tools/memoria/volcar-savestate.mjs <rom.gba> <salida.bin> [segundos]
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ROM = process.argv[2];
const SALIDA = process.argv[3];
const SEGUNDOS = Number(process.argv[4] ?? 30);
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM || !SALIDA) {
  console.error('Uso: node tools/memoria/volcar-savestate.mjs <rom.gba> <salida.bin> [segundos]');
  process.exit(2);
}

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
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page
  .getByRole('button', { name: 'Jugar tal cual' })
  .click({ timeout: 20_000 })
  .catch(() => {});

console.log(`dejando correr el juego ${SEGUNDOS} s...`);
await page.waitForTimeout(SEGUNDOS * 1000);

// Se prueban varias combinaciones de banderas: interesa la mas pequena que
// siga trayendo la memoria, sin la captura de pantalla que engorda el fichero.
const resultados = await page.evaluate(async () => {
  const m = globalThis.mGBAModule;
  const salida = [];
  for (const flags of [0, 16, 31]) {
    const ok = m.saveStateSlot(1, flags);
    await new Promise((r) => setTimeout(r, 300));
    const ruta = `${m.filePaths().saveStatePath}/${m.gameName.split('/').pop().replace(/\.gba$/i, '')}.ss1`;
    let bytes = null;
    try {
      bytes = ok && m.FS.analyzePath(ruta).exists ? m.FS.readFile(ruta) : null;
    } catch {
      bytes = null;
    }
    salida.push({ flags, ok, ruta, tamano: bytes?.length ?? 0, datos: bytes ? [...bytes] : null });
  }
  return salida;
});

for (const r of resultados) {
  console.log(`  flags=${String(r.flags).padStart(2)}  guardado=${r.ok}  ${r.tamano} bytes  ${r.ruta.split('/').pop()}`);
}

const elegido = resultados.find((r) => r.datos && r.flags === 0) ?? resultados.find((r) => r.datos);
if (!elegido) {
  console.error('No se pudo leer ningun savestate.');
  await browser.close();
  process.exit(1);
}

writeFileSync(SALIDA, Buffer.from(elegido.datos));
console.log(`\nvolcado ${elegido.tamano} bytes (flags=${elegido.flags}) en ${SALIDA}`);
await browser.close();

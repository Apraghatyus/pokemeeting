// Prueba del ciclo completo de una partida aleatorizada sin descargarla.
//
// Lo que se comprueba es justo lo que preocupaba: que una partida se pueda
// recuperar al dia siguiente sin haber guardado la ROM en ningun sitio.
//
//   1. Se aleatoriza: arranca sola y da una semilla, sin boton de descarga.
//   2. Se recarga la pagina y se vuelve a cargar la ROM original: la partida
//      aparece en la lista y se continua con un clic.
//   3. Se borra la copia del navegador, como si el navegador la hubiera
//      tirado, y la partida se rehace desde su semilla: la ROM que sale es la
//      misma, byte a byte.
//
// Uso: node tools/tests/test-semilla.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/tests/test-semilla.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => {
  if (!/unwind/.test(e.message)) console.log(`[pageerror] ${e.message}`.slice(0, 160));
});

const esperarZona = async () => {
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
};

/** Huella de la ROM que corre ahora mismo, leida del nucleo. */
const huellaEnMarcha = () =>
  page.evaluate(async () => {
    const m = globalThis.mGBAModule;
    const bytes = m.FS.readFile(m.gameName);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return {
      nombre: m.gameName.split('/').pop(),
      hash: [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16),
    };
  });

await page.goto(URL, { waitUntil: 'load' });
await esperarZona();

// --- 1. aleatorizar ---
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Aleatorizar y jugar' }).click({ timeout: 20_000 });
await page.waitForSelector('.modal__title:text-is("Partida aleatorizada")', { timeout: 300_000 });

const hayDescarga = await page.getByRole('button', { name: /Descargar la ROM/ }).count();
check('ya no ofrece descargar la ROM', hayDescarga === 0);

const semilla = (await page.locator('.hecha__codigo').textContent())?.trim() ?? '';
check('da una semilla para rehacerla', semilla.startsWith('EMUPOKE1.'), semilla.slice(0, 32) + '...');

await page.getByRole('button', { name: 'Empezar a jugar' }).click();
await page.waitForTimeout(4000);
const original = await huellaEnMarcha();
check('y la partida aleatorizada esta corriendo', original.nombre.includes('-aleatoria-'), original.nombre);

// --- 2. volver al dia siguiente: recargar y cargar la ROM original ---
await page.reload({ waitUntil: 'load' });
await esperarZona();
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.waitForSelector('.hueco--partida', { timeout: 20_000 });
const guardada = page.locator('.hueco__abrir').first();
check('la partida sigue ahi al volver', (await guardada.count()) === 1);
check('y no dice que haya que rehacerla',
  !((await guardada.textContent()) ?? '').includes('rehacerla'));

await guardada.click();
await page.waitForTimeout(4000);
const continuada = await huellaEnMarcha();
check('se continua con un clic, sin volver a aleatorizar', continuada.hash === original.hash,
  `${original.hash} vs ${continuada.hash}`);

// --- 3. el navegador tira la copia: se rehace desde la semilla ---
// Borrarlo del sistema de ficheros en memoria no basta: si no se sincroniza,
// IndexedDB lo devuelve intacto al recargar y no se estaria probando nada.
const borrada = await page.evaluate(async (nombre) => {
  const m = globalThis.mGBAModule;
  const ruta = `${m.filePaths().gamePath}/${nombre}`;
  m.FS.unlink(ruta);
  await m.FSSync();
  return !m.FS.analyzePath(ruta).exists;
}, original.nombre);
check('la copia se borra del navegador', borrada);

await page.reload({ waitUntil: 'load' });
await esperarZona();
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.waitForSelector('.hueco--partida', { timeout: 20_000 });
const perdida = page.locator('.hueco__abrir').first();
// El aviso salio de la linea -era jerga nuestra y asustaba sin aportar, porque
// al pulsar se rehace sola- y vive en el titulo emergente.
check('sin su copia, se explica al pasar por encima que se volvera a generar',
  ((await perdida.getAttribute('title')) ?? '').includes('vuelve a generar'),
  (await perdida.getAttribute('title')) ?? 'sin titulo');

await perdida.click();
await page.waitForTimeout(6000);
await page.waitForFunction(() => globalThis.mGBAModule?.gameName?.includes('-aleatoria-'), null, {
  timeout: 300_000,
});
const rehecha = await huellaEnMarcha();
check('rehecha desde la semilla, sale la MISMA ROM', rehecha.hash === original.hash,
  `${original.hash} vs ${rehecha.hash}`);
check('y con el mismo nombre, para no perder el guardado', rehecha.nombre === original.nombre);

await browser.close();
console.log(fallos === 0 ? '\nLA PARTIDA SE RECUPERA SIN DESCARGAR NADA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

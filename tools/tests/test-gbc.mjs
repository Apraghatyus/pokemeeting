// Comprueba que el emulador corre Game Boy Color, no solo Game Boy Advance.
//
// Que el nucleo traiga el codigo de Game Boy dentro no significa que nuestra
// aplicacion sepa cargar una: entre medias estan la deteccion de plataforma,
// la cabecera, el selector de ficheros y el propio arranque del nucleo. Esto
// lo recorre entero.
//
// La ROM se fabrica al vuelo (rom-gbc-de-prueba.mjs): un programa de
// veinticuatro bytes que hace parpadear el fondo. Si el canvas cambia entre
// fotogramas, el nucleo esta ejecutando codigo de Game Boy de verdad.
//
// Uso: node tools/tests/test-gbc.mjs [carpeta-de-capturas]
import { chromium } from 'playwright';
import { construirRomGbc } from './rom-gbc-de-prueba.mjs';

const SHOTS = process.argv[2] ?? '.';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => {
  if (!/unwind/.test(e.message)) console.log(`[pageerror] ${e.message}`.slice(0, 160));
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});

// El selector tiene que admitir la extension, o el fichero ni se puede elegir.
const accept = await page.getAttribute('input[type=file]', 'accept');
check('el selector de ficheros admite .gbc', (accept ?? '').includes('.gbc'), accept ?? '');

const rom = construirRomGbc({ titulo: 'PRUEBA', codigo: 'AAAS' });
await page.setInputFiles('input[type=file]', {
  name: 'prueba-parpadeo.gbc',
  mimeType: 'application/octet-stream',
  buffer: Buffer.from(rom),
});

// Una ROM de Game Boy no es de Rojo Fuego ni de Verde Hoja, asi que el modal
// de aleatorizacion ofrece jugarla tal cual.
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(5000);

const estado = await page.evaluate(() => {
  const m = globalThis.mGBAModule;
  return { nombre: m?.gameName?.split('/').pop() ?? null };
});
check('el nucleo tiene cargada la ROM de Game Boy Color', estado.nombre === 'prueba-parpadeo.gbc',
  estado.nombre ?? 'ninguna');

// La ficha de la ROM tiene que decir de que consola es, deducido de su
// cabecera y no de la extension. Vive en el cajon de opciones, que hay que
// abrir: con una partida en marcha la pantalla se deja para el juego.
await page.click('.iconbutton--opciones');
await page.waitForSelector('.panel .kv', { timeout: 10_000 });
const ficha = ((await page.locator('.panel .kv').first().textContent()) ?? '').replace(/\s+/g, ' ');
check('la interfaz la reconoce como Game Boy Color', /Game Boy Color/.test(ficha), ficha.slice(0, 90));

/**
 * Dos capturas del canvas, separadas en el tiempo.
 *
 * Se comparan las imagenes compuestas y no los pixeles del contexto WebGL:
 * ese contexto no conserva el contenido entre fotogramas y leerlo devuelve
 * negro aunque en pantalla se vea el juego.
 */
const canvas = page.locator('canvas').first();
const primera = await canvas.screenshot();
await page.waitForTimeout(700);
const segunda = await canvas.screenshot();

let distintos = 0;
const largo = Math.min(primera.length, segunda.length);
for (let i = 0; i < largo; i += 1) if (primera[i] !== segunda[i]) distintos += 1;

check('el canvas cambia entre fotogramas: esta ejecutando el programa',
  distintos > 0, `${distintos} bytes distintos de ${largo}`);

await canvas.screenshot({ path: `${SHOTS}/gbc.png` });
console.log(`captura en ${SHOTS}/gbc.png`);

await browser.close();
console.log(fallos === 0 ? '\nGAME BOY COLOR FUNCIONA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

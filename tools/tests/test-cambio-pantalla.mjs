// En movil se ve una pantalla a la vez y se cambia con un boton.
//
// Lo que de verdad hay que comprobar aqui no es que el boton cambie la vista,
// sino que al dejar de verse TU pantalla el companero te siga viendo en
// movimiento. Un canvas que el navegador deja de componer puede dejar de
// producir fotogramas, y el sintoma seria horrible: a ti todo normal, y al
// otro tu partida congelada sin que nadie sepa por que.
//
// Necesita el servidor de salas y la aplicacion levantados (npm run dev:all).
//
// Uso: node tools/tests/test-cambio-pantalla.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-cambio-pantalla.mjs <rom.gba>');
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
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
});

/** El movil es quien cambia de pantalla; el otro mira desde un escritorio. */
const abrir = async (ancho, alto) => {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto } });
  const page = await contexto.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  return page;
};

const movil = await abrir(412, 900);
const escritorio = await abrir(1280, 860);

await movil.locator('.roomchip').click();
await movil.locator('.tabs button', { hasText: 'Crear sala' }).click();
await movil.locator('.form input[type=password]').fill('cambio');
await movil.locator('.form button[type=submit]').click();
await movil.waitForSelector('.room-code', { timeout: 20_000 });
const codigo = ((await movil.locator('.room-code').textContent()) ?? '').trim();
await movil.keyboard.press('Escape');

await escritorio.locator('.roomchip').click();
await escritorio.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await escritorio.locator('.form input.input--code').fill(codigo);
await escritorio.locator('.form input[type=password]').fill('cambio');
await escritorio.locator('.form button[type=submit]').click();
await escritorio.keyboard.press('Escape');

await movil.waitForSelector('.pantalla--pequena', { timeout: 45_000 });
await movil.waitForTimeout(5000);

// --- en el movil solo se ve una ---
const visible = () =>
  movil.evaluate(() => {
    const grande = document.querySelector('.pantalla--grande');
    const pequena = document.querySelector('.pantalla--pequena');
    const caja = pequena.getBoundingClientRect();
    return {
      // Quien manda la pantalla grande: tu canvas o el video del companero.
      mia: grande.querySelector('canvas') !== null,
      // La otra no se ve, pero sigue existiendo y pintandose.
      pequenaOculta: caja.width <= 4 && caja.height <= 4,
      pequenaSigueEnPie: getComputedStyle(pequena).display !== 'none',
    };
  });

const antes = await visible();
check('en movil solo se ve una pantalla', antes.pequenaOculta);
check('y la que no se ve sigue viva, no quitada', antes.pequenaSigueEnPie);
check('al principio se ve la tuya', antes.mia);

const hayBoton = await movil.locator('.pantalla--grande .pantalla__boton--intercambiar').isVisible();
check('hay boton para cambiar de pantalla', hayBoton);

/** Cuantos fotogramas por segundo le llegan al otro de MI partida. */
const fpsQueLlegan = async (segundos) =>
  escritorio.evaluate(async (s) => {
    const video = document.querySelector('video');
    const antes = video.getVideoPlaybackQuality().totalVideoFrames;
    await new Promise((sigue) => setTimeout(sigue, s * 1000));
    return (video.getVideoPlaybackQuality().totalVideoFrames - antes) / s;
  }, segundos);

const conMiPantallaVisible = await fpsQueLlegan(5);
check('mientras se ve tu partida, al otro le llega fluida',
  conMiPantallaVisible >= 50, `${conMiPantallaVisible.toFixed(1)} fps`);

// --- se cambia de pantalla: ahora la tuya es la que no se ve ---
await movil.locator('.pantalla--grande .pantalla__boton--intercambiar').click();
await movil.waitForTimeout(2500);

const despues = await visible();
check('al pulsar el boton se ve la del companero', !despues.mia);

const conMiPantallaOculta = await fpsQueLlegan(6);
check('y aun asi al otro le sigue llegando la tuya en movimiento',
  conMiPantallaOculta >= 50,
  `${conMiPantallaOculta.toFixed(1)} fps con tu pantalla escondida`);

await navegador.close();
console.log(fallos === 0 ? '\nEL CAMBIO DE PANTALLA NO CORTA LA TRANSMISION' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

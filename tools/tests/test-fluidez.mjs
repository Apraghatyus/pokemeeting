// Mide a cuantos fotogramas por segundo le llega a uno la partida del otro.
//
// "No se ve fluido" no se puede arreglar a ojo: hay que ponerle un numero. Esto
// conecta dos navegadores de verdad, deja correr el juego y pregunta al video
// cuantos fotogramas ha recibido, que es lo unico que importa al final.
//
// Se mide tambien lo que se descarta por el camino: un numero alto de
// descartados con fotogramas de sobra significa que el problema no es la
// captura sino la red o el decodificador.
//
// Necesita el servidor de salas y la aplicacion levantados (npm run dev:all).
//
// Uso: node tools/tests/test-fluidez.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
/** Cuanto se mira. Corto engaña: el codificador tarda en estabilizarse. */
const SEGUNDOS = 8;

if (!ROM) {
  console.error('Uso: node tools/tests/test-fluidez.mjs <rom.gba>');
  process.exit(2);
}

// El umbral es 45 y no 60 a proposito. El fallo que esto vigila daba 29
// fotogramas por segundo de forma consistente -se capturaba a 30 mientras el
// juego corre a 60- asi que 45 lo separa de sobra. Pedir mas convierte la
// prueba en un medidor de lo ocupada que este la maquina: en la misma sesion
// se han visto 57 y 40 sin tocar nada.
const FLUIDO = 45;

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

const abrir = async () => {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 860 } });
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

const anfitrion = await abrir();
const invitado = await abrir();

await anfitrion.locator('.roomchip').click();
await anfitrion.locator('.tabs button', { hasText: 'Crear sala' }).click();
await anfitrion.locator('.form input[type=password]').fill('fluidez');
await anfitrion.locator('.form button[type=submit]').click();
await anfitrion.waitForSelector('.room-code', { timeout: 20_000 });
const codigo = ((await anfitrion.locator('.room-code').textContent()) ?? '').trim();
await anfitrion.keyboard.press('Escape');

await invitado.locator('.roomchip').click();
await invitado.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await invitado.locator('.form input.input--code').fill(codigo);
await invitado.locator('.form input[type=password]').fill('fluidez');
await invitado.locator('.form button[type=submit]').click();
await invitado.keyboard.press('Escape');

await invitado.waitForSelector('video', { timeout: 45_000 });
// Que el codificador se asiente antes de contar.
await invitado.waitForTimeout(6000);

/** Cuenta fotogramas del video del companero durante un rato. */
const medir = async (page) =>
  page.evaluate(async (segundos) => {
    const video = document.querySelector('video');
    if (!video) return null;

    const leer = () => {
      // getVideoPlaybackQuality cuenta lo que ha llegado y lo que se ha caido.
      const q = video.getVideoPlaybackQuality?.();
      return q
        ? { total: q.totalVideoFrames, caidos: q.droppedVideoFrames }
        : { total: video.webkitDecodedFrameCount ?? 0, caidos: 0 };
    };

    const antes = leer();
    await new Promise((sigue) => setTimeout(sigue, segundos * 1000));
    const despues = leer();

    return {
      fps: (despues.total - antes.total) / segundos,
      caidos: despues.caidos - antes.caidos,
      tamano: `${video.videoWidth}x${video.videoHeight}`,
      parado: video.paused,
    };
  }, SEGUNDOS);

const recibido = await medir(invitado);
check('llega video del companero', recibido !== null && !recibido.parado);

if (recibido) {
  console.log(
    `\n   ${recibido.fps.toFixed(1)} fotogramas por segundo, ` +
      `${recibido.caidos} descartados, a ${recibido.tamano}\n`,
  );

  // El juego corre a 60. Por debajo de 50 se nota a simple vista, que es de lo
  // que se quejaba quien lo estaba jugando.
  check('se recibe a un ritmo fluido', recibido.fps >= FLUIDO, `${recibido.fps.toFixed(1)} fps`);
  check('sin descartar fotogramas a puñados', recibido.caidos < SEGUNDOS * 5,
    `${recibido.caidos} descartados`);
  check('y a la resolucion nativa de la consola', recibido.tamano === '240x160', recibido.tamano);
}

await navegador.close();
console.log(fallos === 0 ? '\nLA TRANSMISION VA FLUIDA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

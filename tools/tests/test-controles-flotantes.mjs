// Los controles que flotan sobre la partida se esconden solos.
//
// Silenciar y el volumen flotan encima del juego, y ahi estorban: en un movil
// acaban justo sobre lo que hay que mirar -el teclado para poner un mote, por
// ejemplo-. Pero no pueden desaparecer del todo o no habria forma de silenciar.
//
// Asi que se comportan como los mandos de un video: aparecen al pulsar sobre la
// partida y se van solos a los cinco segundos. En movil y en escritorio, que se
// pidio para los dos.
//
// Se mira lo que CALCULA el navegador y no si existe el elemento: siguen en el
// documento todo el rato, lo que cambia es si se ven y si se pueden pulsar.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-controles-flotantes.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-controles-flotantes.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });

const probar = async (etiqueta, ancho, alto, tactil) => {
  const contexto = await navegador.newContext({
    viewport: { width: ancho, height: alto },
    isMobile: tactil,
    hasTouch: tactil,
    deviceScaleFactor: tactil ? 2 : 1,
  });
  const page = await contexto.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3500);

  /** Si se ven de verdad, no si estan en el documento. */
  const seVen = () =>
    page.evaluate(() => {
      const caja = document.querySelector('.pantalla__controles');
      if (!caja) return null;
      const estilo = getComputedStyle(caja);
      return estilo.visibility === 'visible' && Number(estilo.opacity) > 0.5;
    });

  const tocarLaPartida = async () => {
    await page.locator('.pantalla__media').first().click({ position: { x: 30, y: 30 } });
    await page.waitForTimeout(400);
  };

  check(`${etiqueta} al cargar no estorban`, (await seVen()) === false);

  await tocarLaPartida();
  check(`${etiqueta} al pulsar la partida aparecen`, (await seVen()) === true);

  await page.waitForTimeout(2500);
  check(`${etiqueta} y siguen ahi a los tres segundos`, (await seVen()) === true);

  await page.waitForTimeout(3500);
  check(`${etiqueta} pero a los seis ya se han ido`, (await seVen()) === false);

  // Y lo que no puede pasar: que se escondan mientras los estas usando. Pulsar
  // uno cuenta como tocar la partida, asi que el reloj vuelve a empezar.
  //
  // Los botones de voz solo existen con alguien al otro lado, asi que jugando
  // solo no hay nada que pulsar y esto se dice en vez de darlo por bueno.
  await tocarLaPartida();
  await page.waitForTimeout(3000);
  const botones = page.locator('.pantalla__controles button');
  if ((await botones.count()) === 0) {
    console.log(`SALTO  ${etiqueta} usarlos los mantiene a la vista: sin companero no hay botones`);
  } else {
    await botones.first().click();
    await page.waitForTimeout(3000);
    check(`${etiqueta} usarlos los mantiene a la vista`, (await seVen()) === true);
  }

  await contexto.close();
};

await probar('[escritorio]', 1280, 860, false);
await probar('[movil]     ', 412, 915, true);

await navegador.close();
console.log(
  fallos === 0 ? '\nLOS CONTROLES NO ESTORBAN Y SIGUEN AHI' : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

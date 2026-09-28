// Prueba del sonido del juego.
//
// No se puede "escuchar" en una prueba automatica, pero si se puede mirar lo
// que el nucleo esta a punto de reproducir: mGBA expone su bufer de salida en
// SDL2.audio.currentOutputBuffer. Si ahi hay muestras distintas de cero, hay
// sonido; y si al bajar el volumen esas muestras encogen, el control funciona.
//
// Esta prueba nace de un fallo concreto: se le pasaba a setVolume el porcentaje
// (70) cuando espera un multiplicador (0.7), o sea un 7000%. El sonido salia
// roto y ninguna prueba lo veia.
//
// Uso: node tools/test-audio.mjs <rom.gba> [carpeta-de-capturas]
import { chromium } from 'playwright';

const ROM = process.argv[2];
const SHOTS = process.argv[3] ?? '.';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/test-audio.mjs <rom.gba> [carpeta]');
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
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, ignoreHTTPSErrors: true });
page.on('pageerror', (e) => {
  if (!/unwind/.test(e.message)) console.log(`[pageerror] ${e.message}`.slice(0, 180));
});

// Se empieza sin nada guardado: arrancar por primera vez es justo el caso
// donde la aplicacion se quedaba muda.
await page.goto(URL, { waitUntil: 'load' });
await page.evaluate(() => {
  try {
    localStorage.removeItem('emupoke.volumen');
  } catch {
    /* sin almacenamiento no hay nada que limpiar */
  }
});
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page
  .getByRole('button', { name: 'Jugar tal cual' })
  .click({ timeout: 20_000 })
  .catch(() => {});

// --- el control debe estar a la vista, sin abrir menus ---
const enBarra = await page
  .locator('.topbar .volumen input[type=range]')
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
check('el volumen esta en la barra superior', enBarra);

// El fallo que motivo todo esto: arrancaba a 0 y parecia que no habia sonido.
const inicial = await page.locator('.topbar .volumen input[type=range]').inputValue();
check('arranca con un volumen audible', Number(inicial) > 0, `${inicial}%`);

/**
 * Engancha la medicion al propio callback de audio.
 *
 * Leer `currentOutputBuffer` desde fuera no vale: ese bufer solo es valido
 * mientras corre la llamada que lo rellena, y muestrearlo con un temporizador
 * devuelve datos viejos o ceros. Medir dentro del callback, justo despues de
 * que el nucleo escriba, si da las muestras que van a sonar.
 */
const instalarMedidor = (page) =>
  page.evaluate(() => {
    const nodo = globalThis.mGBAModule?.SDL2?.audio?.scriptProcessorNode;
    if (!nodo) return false;
    const original = nodo.onaudioprocess;
    globalThis.__pico = 0;
    nodo.onaudioprocess = function (evento) {
      // Primero que el nucleo rellene el bufer; luego se mide lo que quedo.
      original?.call(this, evento);
      const bufer = evento.outputBuffer;
      for (let canal = 0; canal < bufer.numberOfChannels; canal += 1) {
        const datos = bufer.getChannelData(canal);
        for (let i = 0; i < datos.length; i += 8) {
          const valor = Math.abs(datos[i]);
          if (valor > globalThis.__pico) globalThis.__pico = valor;
        }
      }
    };
    return true;
  });

/**
 * Cuanto hay que esperar tras cambiar el volumen antes de medir.
 *
 * El audio ya encolado sigue sonando un par de segundos con el valor viejo.
 * Midiendo enseguida se lee la cola del nivel anterior, y el resultado parece
 * invertido: fue exactamente lo que despisto al escribir esta prueba.
 */
const REPOSO_MS = 3000;

/** Mayor amplitud observada durante una ventana, tras dejar reposar la cola. */
const medirPico = async (page, segundos) => {
  await page.waitForTimeout(REPOSO_MS);
  await page.evaluate(() => {
    globalThis.__pico = 0;
  });
  await page.waitForTimeout(segundos * 1000);
  return page.evaluate(() => globalThis.__pico ?? 0);
};

const contexto = await page.evaluate(
  () => globalThis.mGBAModule?.SDL2?.audioContext?.state ?? 'sin contexto',
);
check('el contexto de audio esta activo', contexto === 'running', contexto);

// La intro de FireRed tarda un poco en empezar a sonar.
await page.waitForTimeout(8000);
check('se puede medir la salida de audio', await instalarMedidor(page));

const picoAlto = await medirPico(page, 4);
check('con el volumen normal hay sonido', picoAlto > 0.001, `pico ${picoAlto.toFixed(4)}`);

// --- silenciar debe callar el juego ---
await page.locator('.topbar .volumen .iconbutton').click();
const picoSilencio = await medirPico(page, 4);
check('silenciar deja el sonido a cero', picoSilencio < 0.0005,
  `pico ${picoSilencio.toFixed(4)}`);

// --- y quitar el silencio devolverlo ---
await page.locator('.topbar .volumen .iconbutton').click();
const picoVuelta = await medirPico(page, 5);
check('quitar el silencio devuelve el sonido', picoVuelta > 0.001, `pico ${picoVuelta.toFixed(4)}`);

// --- bajar el volumen debe reducir la amplitud, no solo el numero ---
await page.locator('.topbar .volumen input[type=range]').fill('20');
const picoBajo = await medirPico(page, 5);
check(
  'bajar el volumen reduce la amplitud de verdad',
  picoBajo < picoVuelta * 0.7,
  `${picoVuelta.toFixed(4)} -> ${picoBajo.toFixed(4)}`,
);

// --- el nivel sobrevive a recargar ---
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
const recordado = await page.locator('.topbar .volumen input[type=range]').inputValue();
check('el volumen elegido se recuerda al recargar', recordado === '20', `${recordado}%`);

await page.screenshot({ path: `${SHOTS}/ui-volumen.png` });
await browser.close();
console.log(failures === 0 ? '\nSONIDO FUNCIONANDO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

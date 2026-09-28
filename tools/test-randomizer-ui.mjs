// Prueba de la aleatorizacion desde la interfaz.
//
// La prueba del servicio ya comprueba que sale una ROM valida. Esta comprueba
// lo otro, que es lo que le importa al jugador: que despues de aleatorizar el
// juego sigue corriendo, ahora con la copia nueva.
//
// Uso: node tools/test-randomizer-ui.mjs <rom.gba> [ajustes.rnqs] [carpeta]
import { chromium } from 'playwright';

const ROM = process.argv[2];
const SETTINGS = process.argv[3] ?? 'tools/randomizer/ejemplo.rnqs';
const SHOTS = process.argv[4] ?? '.';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/test-randomizer-ui.mjs <rom.gba> [ajustes] [carpeta]');
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
const page = await browser.newPage({
  viewport: { width: 1360, height: 950 },
  ignoreHTTPSErrors: true,
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`.slice(0, 200)));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.waitForTimeout(4000);

const canvas = page.locator('canvas');
const antes = await canvas.screenshot();

// El panel vive en el menu de opciones.
await page.locator('.iconbutton').click();
const panel = page.locator('.panel', { hasText: 'Aleatorizar' });
await panel.waitFor({ timeout: 10_000 });

// Se espera: la comprobacion del servicio es asincrona y leer el panel justo
// despues de que aparezca mide la carrera, no el comportamiento.
const settingsButton = panel.getByRole('button', { name: /Elegir ajustes/ });
const detected = await settingsButton
  .waitFor({ timeout: 15_000 })
  .then(() => true)
  .catch(() => false);
check(
  'el panel detecta el servicio y ofrece elegir ajustes',
  detected,
  (await panel.textContent())?.replace(/\s+/g, ' ').slice(0, 150),
);
if (!detected) {
  await page.screenshot({ path: `${SHOTS}/ui-randomizer-error.png`, fullPage: true });
  await browser.close();
  console.log(`\n${failures + 1} COMPROBACIONES FALLIDAS`);
  process.exit(1);
}

await panel.locator('input[type=file][accept=".rnqs"]').setInputFiles(SETTINGS);
const chosen = await panel.getByRole('button', { name: /Ajustes:/ }).count();
check('los ajustes elegidos se reflejan en el boton', chosen === 1);

await panel.getByRole('button', { name: 'Aleatorizar y jugar' }).click();

// Aleatorizar tarda un par de segundos e incluye recargar el nucleo.
const done = await panel
  .locator('.note', { hasText: 'ya esta corriendo' })
  .waitFor({ timeout: 90_000 })
  .then(() => true)
  .catch(() => false);
check('la aleatorizacion termina y avisa', done);

const aviso = (await panel.textContent()) ?? '';
check('se informa de la semilla usada', /Semilla usada: \d+/.test(aviso),
  /Semilla usada: \d+/.exec(aviso)?.[0] ?? aviso.slice(0, 120));
check('se ofrece descargar la ROM resultante',
  (await panel.getByRole('button', { name: /Descargar/ }).count()) === 1);

// La comprobacion de fondo: el juego vuelve a dibujar con la copia nueva.
await page.locator('.iconbutton').click();
await page.waitForTimeout(6000);
const despues = await canvas.screenshot();
check('el emulador sigue dibujando tras cambiar de ROM', Buffer.compare(antes, despues) !== 0);

// Y la ficha de ROM debe mostrar ya el fichero aleatorizado.
await page.locator('.iconbutton').click();
const fichero = await page
  .locator('.panel', { hasText: 'ROM cargada' })
  .locator('dd')
  .first()
  .textContent();
check('la ficha muestra la ROM aleatorizada', /aleatorizada/.test(fichero ?? ''), fichero ?? '');

await page.screenshot({ path: `${SHOTS}/ui-randomizer.png`, fullPage: true });
await browser.close();
console.log(failures === 0 ? '\nALEATORIZACION DESDE LA INTERFAZ FUNCIONANDO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

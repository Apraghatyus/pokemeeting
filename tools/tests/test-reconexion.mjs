// Prueba de la reconexion automatica.
//
// Se simula lo que pasa de verdad: al jugador se le va la red un momento y
// vuelve, mientras el servidor sigue en pie con la sala guardada.
//
// Un primer intento de esta prueba mataba el servidor de salas, y estaba mal
// planteado: las salas viven en memoria, asi que al reiniciarlo desaparecen y
// volver a entrar con ese codigo es imposible por diseno. Eso no es un fallo
// de reconexion, es otra cosa distinta, y se comprueba aparte.
//
// Uso: node tools/tests/test-reconexion.mjs <rom.gba> [carpeta]
import { chromium } from 'playwright';

const ROM = process.argv[2];
const SHOTS = process.argv[3] ?? '.';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const PASSWORD = 'kanto26';

if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/tests/test-reconexion.mjs <rom.gba> [carpeta]');
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

const abrir = async (etiqueta) => {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    if (!/unwind/.test(e.message)) console.log(`[${etiqueta}] ${e.message}`.slice(0, 160));
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
  await page.waitForTimeout(2500);
  return page;
};

const host = await abrir('anfitrion');
const guest = await abrir('invitado');

// --- emparejar ---
await host.locator('.roomchip').click();
await host.locator('.form input[type=password]').fill(PASSWORD);
await host.locator('.form button[type=submit]').click();
await host.locator('.field__value.room-code').waitFor({ timeout: 10_000 });
const code = (await host.locator('.field__value.room-code').textContent())?.trim() ?? '';
await host.keyboard.press('Escape');

await guest.locator('.roomchip').click();
await guest.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await guest.locator('.form input.input--code').fill(code);
await guest.locator('.form input[type=password]').fill(PASSWORD);
await guest.locator('.form button[type=submit]').click();
await guest.keyboard.press('Escape');

const conectados = await Promise.all([
  host.locator('.slot--pip').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false),
  guest.locator('.slot--pip').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false),
]);
check('los dos jugadores se conectan', conectados.every(Boolean));

// --- al anfitrion se le va la red un momento ---
console.log('\ncortando la red del anfitrion...');
await host.context().setOffline(true);

const avisa = await host
  .locator('.status', { hasText: 'Reconectando' })
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
check('la barra avisa de que esta reconectando', avisa);

// Vuelve antes de agotar los tres intentos: debe reengancharse solo.
await new Promise((r) => setTimeout(r, 2500));
console.log('devolviendo la red...');
await host.context().setOffline(false);

const reenganchado = await host
  .locator('.slot--pip')
  .waitFor({ timeout: 60_000 })
  .then(() => true)
  .catch(() => false);
check('vuelve a ver a su companero sin tocar nada', reenganchado);

const videoVuelve = await host.evaluate(async () => {
  const v = document.querySelector('video.slot__media');
  for (let i = 0; i < 40 && (!v || v.videoWidth === 0); i += 1) {
    await new Promise((r) => setTimeout(r, 500));
  }
  return { width: v?.videoWidth ?? 0, playing: v ? !v.paused : false };
});
check('el video del companero vuelve', videoVuelve.width > 0, JSON.stringify(videoVuelve));
await host.screenshot({ path: `${SHOTS}/ui-reconectado.png`, fullPage: true });

// --- ahora la red no vuelve: deben agotarse los tres intentos ---
console.log('\ncortando la red y dejandola caida...');
await host.context().setOffline(true);

await host.locator('.roomchip').click();
const agotado = await host
  .getByRole('button', { name: 'Reintentar ahora' })
  .waitFor({ timeout: 90_000 })
  .then(() => true)
  .catch(() => false);
check('tras agotar los intentos aparece el boton de reintentar', agotado);
await host.screenshot({ path: `${SHOTS}/ui-reintentar.png` });

// --- y el boton funciona cuando la red vuelve ---
console.log('devolviendo la red para probar el boton...');
await host.context().setOffline(false);
await host.getByRole('button', { name: 'Reintentar ahora' }).click();

const reintentoOk = await host
  .locator('.slot--pip')
  .waitFor({ timeout: 60_000 })
  .then(() => true)
  .catch(() => false);
check('el boton reconecta cuando la red ha vuelto', reintentoOk);

await browser.close();
console.log(failures === 0 ? '\nRECONEXION FUNCIONANDO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

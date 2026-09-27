// Prueba de partida compartida: dos navegadores independientes cargan la misma
// ROM, uno crea la sala, el otro entra, y se comprueba que cada uno acaba
// viendo el video de la partida del otro.
//
// Uso: node tools/test-session.mjs <rom.gba> [directorio-de-capturas]
import { chromium } from 'playwright';

const ROM = process.argv[2];
const SHOTS = process.argv[3] ?? '.';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const PASSWORD = 'soullink';

if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/test-session.mjs <rom.gba> [carpeta]');
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

/** Abre una pestana con el emulador ya corriendo la ROM. */
const openPlayer = async (label) => {
  // Contextos separados: dos jugadores distintos, sin estado compartido.
  const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`[${label} pageerror] ${e.message}`.slice(0, 200)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  // Dejamos que el emulador dibuje: captureStream de un canvas en negro no
  // produce fotogramas y la conexion parecería fallar sin serlo.
  await page.waitForTimeout(3000);
  return { page, label };
};

const host = await openPlayer('anfitrion');
const guest = await openPlayer('invitado');

// --- el anfitrion crea la sala ---
await host.page.getByRole('button', { name: 'Crear sala' }).nth(0).click();
await host.page.locator('.form input[type=password]').fill(PASSWORD);
await host.page.locator('.form button[type=submit]').click();

await host.page.locator('.room-code').waitFor({ timeout: 10_000 });
const code = (await host.page.locator('.room-code').textContent())?.trim() ?? '';
check('el anfitrion obtiene un codigo de sala', /^[A-Z2-9]{6}$/.test(code), code);

// --- el invitado entra ---
await guest.page.getByRole('button', { name: 'Unirme' }).click();
await guest.page.locator('.form input.mono').fill(code);
await guest.page.locator('.form input[type=password]').fill(PASSWORD);
await guest.page.locator('.form button[type=submit]').click();

// --- esperamos a que WebRTC se establezca en ambos lados ---
const waitConnected = (p, label) =>
  p
    .locator('.kv__row', { hasText: 'Estado' })
    .locator('dd')
    .filter({ hasText: 'Conectados' })
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

const [hostOk, guestOk] = await Promise.all([
  waitConnected(host.page, 'anfitrion'),
  waitConnected(guest.page, 'invitado'),
]);
check('el anfitrion ve la sala conectada', hostOk);
check('el invitado ve la sala conectada', guestOk);

// --- el video del companero debe tener imagen de verdad ---
const videoOf = (p) =>
  p.evaluate(async () => {
    const v = document.querySelector('.partner__video');
    if (!v) return { found: false };
    for (let i = 0; i < 30 && v.videoWidth === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
    return {
      found: true,
      width: v.videoWidth,
      height: v.videoHeight,
      hasStream: Boolean(v.srcObject),
      playing: !v.paused,
    };
  });

const hostVideo = await videoOf(host.page);
const guestVideo = await videoOf(guest.page);
check('el anfitrion recibe el video del invitado', hostVideo.width > 0, JSON.stringify(hostVideo));
check('el invitado recibe el video del anfitrion', guestVideo.width > 0, JSON.stringify(guestVideo));

// --- la ROM del companero se muestra ---
const peerRom = await host.page.locator('.kv__row', { hasText: 'Su ROM' }).locator('dd').textContent().catch(() => null);
check('el anfitrion ve que ROM usa el companero', Boolean(peerRom), peerRom ?? '');

await host.page.screenshot({ path: `${SHOTS}/sesion-anfitrion.png`, fullPage: true });
await guest.page.screenshot({ path: `${SHOTS}/sesion-invitado.png`, fullPage: true });

// --- salida limpia ---
await guest.page.getByRole('button', { name: 'Salir de la sala' }).click();
const noticed = await host.page
  .locator('.kv__row', { hasText: 'Estado' })
  .locator('dd')
  .filter({ hasText: 'Esperando' })
  .waitFor({ timeout: 15_000 })
  .then(() => true)
  .catch(() => false);
check('el anfitrion se entera de que el companero se fue', noticed);

await browser.close();
console.log(failures === 0 ? '\nPARTIDA COMPARTIDA FUNCIONANDO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

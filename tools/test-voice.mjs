// Prueba de la llamada de voz entre los dos jugadores.
//
// Chromium se arranca con un microfono falso y el permiso ya concedido, que es
// la unica forma de automatizar esto. Lo que se comprueba no es que el boton
// cambie de color, sino que al otro lado llega una pista de audio y que deja
// de estar en silencio, que es la senal de que hay sonido circulando.
//
// Uso: node tools/test-voice.mjs <rom.gba> [carpeta-de-capturas]
import { chromium } from 'playwright';

const ROM = process.argv[2];
const SHOTS = process.argv[3] ?? '.';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const PASSWORD = 'kanto26';

if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/test-voice.mjs <rom.gba> [carpeta]');
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
  args: [
    '--autoplay-policy=no-user-gesture-required',
    // Microfono sintetico y permiso concedido sin dialogo.
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
});

const openPlayer = async (label) => {
  const context = await browser.newContext({
    viewport: { width: 1360, height: 950 },
    ignoreHTTPSErrors: true,
    permissions: ['microphone'],
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`[${label} pageerror] ${e.message}`.slice(0, 200)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  // Al cargar la ROM aparece la pregunta de como jugar. Aqui se juega tal cual.
  await page
    .getByRole('button', { name: 'Jugar tal cual' })
    .click({ timeout: 20_000 })
    .catch(() => {});

  await page.waitForTimeout(3000);
  return page;
};

const host = await openPlayer('anfitrion');
const guest = await openPlayer('invitado');

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

const connected = await Promise.all([
  host.locator('.voice').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false),
  guest.locator('.voice').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false),
]);
check('los controles de llamada aparecen al conectar', connected.every(Boolean));

// --- antes de hablar, la pista existe pero esta en silencio ---
//
// El hueco de voz se negocia al conectar, no al pulsar el boton: por eso la
// pista ya esta ahi, callada. Lo que distingue "no habla" de "habla" es la
// propiedad muted de la pista remota, no que exista.
const before = await guest.evaluate(() => {
  const track = document.querySelector('.voice audio')?.srcObject?.getAudioTracks?.()[0];
  return { hay: Boolean(track), muted: track?.muted ?? null };
});
check('antes de hablar la pista remota esta en silencio', before.hay && before.muted === true,
  JSON.stringify(before));

// --- el anfitrion abre el microfono ---
await host.getByRole('button', { name: /Hablar/ }).click();
const micOn = await host
  .locator('.voice__mic.is-on')
  .waitFor({ timeout: 15_000 })
  .then(() => true)
  .catch(() => false);
check('el microfono del anfitrion se abre', micOn,
  (await host.locator('.voice').textContent())?.replace(/\s+/g, ' ').slice(0, 90));

// --- y al invitado le llega sonido de verdad ---
//
// Una pista remota nace en silencio y deja de estarlo cuando empiezan a llegar
// paquetes: por eso se espera a que `muted` sea false en vez de conformarse con
// que la pista exista.
const audio = await guest.evaluate(async () => {
  const element = document.querySelector('.voice audio');
  if (!element) return { found: false };
  for (let i = 0; i < 40; i += 1) {
    const stream = element.srcObject;
    const track = stream?.getAudioTracks?.()[0];
    if (track && !track.muted && track.readyState === 'live') {
      return { found: true, live: true, muted: false };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const stream = element.srcObject;
  const track = stream?.getAudioTracks?.()[0];
  return {
    found: true,
    live: track?.readyState === 'live',
    muted: track?.muted ?? null,
    tracks: stream?.getAudioTracks?.().length ?? 0,
  };
});
check('al invitado le llega la voz del anfitrion', audio.found && audio.live && audio.muted === false,
  JSON.stringify(audio));

// --- silenciar al companero ---
await guest.locator('.voice__partner button').click();
const muted = await guest.evaluate(() => document.querySelector('.voice audio')?.muted ?? null);
check('silenciar al companero silencia su audio', muted === true);

// --- y volver a oirle ---
await guest.locator('.voice__partner button').click();
const unmuted = await guest.evaluate(() => document.querySelector('.voice audio')?.muted ?? null);
check('se le puede volver a oir', unmuted === false);

// --- bajarle el volumen ---
await guest.locator('.voice__partner input[type=range]').fill('25');
const volume = await guest.evaluate(() => document.querySelector('.voice audio')?.volume ?? null);
check('bajarle el volumen afecta al audio', Math.abs((volume ?? 0) - 0.25) < 0.01, String(volume));

// --- cerrar el microfono ---
await host.getByRole('button', { name: /Micro abierto/ }).click();
const micOff = await host
  .locator('.voice__mic.is-on')
  .waitFor({ state: 'detached', timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
check('el microfono se puede cerrar', micOff);

await host.screenshot({ path: `${SHOTS}/ui-voz.png`, fullPage: true });
await browser.close();
console.log(failures === 0 ? '\nLLAMADA DE VOZ FUNCIONANDO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

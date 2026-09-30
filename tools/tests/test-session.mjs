// Prueba de partida compartida: dos navegadores independientes cargan la misma
// ROM, uno crea la sala, el otro entra, y se comprueba que cada uno acaba
// viendo el video de la partida del otro en la ventana pequena.
//
// Comprueba ademas que se puede escribir en los campos mientras el juego corre.
// mGBA engancha el teclado a nivel de documento via SDL, asi que sin cederselo
// a la interfaz las pulsaciones no llegan a los campos.
//
// Uso: node tools/tests/test-session.mjs <rom.gba> [directorio-de-capturas]
import { chromium } from 'playwright';

// Se admiten dos ROMs distintas: el caso real es Rojo Fuego contra Verde Hoja.
const ROM_HOST = process.argv[2];
const ROM_GUEST = process.argv[3] && !process.argv[3].startsWith('-') && /\.gba$/i.test(process.argv[3])
  ? process.argv[3]
  : ROM_HOST;
const SHOTS = (/\.gba$/i.test(process.argv[3] ?? '') ? process.argv[4] : process.argv[3]) ?? '.';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const PASSWORD = 'kanto26';

if (!ROM_HOST) {
  console.error(
    'Falta la ROM.\nUso: node tools/tests/test-session.mjs <rom-anfitrion.gba> [rom-invitado.gba] [carpeta]',
  );
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
const openPlayer = async (label, romPath) => {
  // Contextos separados: dos jugadores distintos, sin estado compartido.
  const context = await browser.newContext({
    viewport: { width: 1360, height: 900 },
    // El modo HTTPS de desarrollo usa un certificado autofirmado.
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`[${label} pageerror] ${e.message}`.slice(0, 200)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', romPath);
  // Al cargar la ROM aparece la pregunta de como jugar. Aqui se juega tal cual.
  await page
    .getByRole('button', { name: 'Jugar tal cual' })
    .click({ timeout: 20_000 })
    .catch(() => {});

  // Dejamos que el emulador dibuje: captureStream de un canvas en negro no
  // produce fotogramas y la conexion pareceria fallar sin serlo.
  await page.waitForTimeout(3000);
  return { page, label };
};

const host = await openPlayer('anfitrion', ROM_HOST);
const guest = await openPlayer('invitado', ROM_GUEST);

// --- se puede escribir mientras el juego corre ---
//
// Esta es la comprobacion del fallo que hacia imposible teclear la sala.
check(
  'con el juego en marcha nada avisa de escritura',
  (await host.page.locator('.chip--interfaz').count()) === 0,
);

await host.page.locator('.roomchip').click();
await host.page.locator('.tabs button', { hasText: 'Entrar en una' }).click();
const codeField = host.page.locator('.form input.input--code');
await codeField.click();
// Se espera en vez de mirar al instante: React repinta de forma asincrona y
// una comprobacion inmediata mediria la carrera, no el comportamiento.
const sawTypingChip = await host.page
  .waitForFunction(() => document.querySelector('.chip--interfaz') !== null, null, { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
check('al enfocar un campo el juego suelta el teclado', sawTypingChip);

// Tecla a tecla, como una persona: si el juego se las quedara, el campo
// quedaria vacio o incompleto.
await host.page.keyboard.type('ABC123', { delay: 60 });
const typed = await codeField.inputValue();
check('lo tecleado llega al campo intacto', typed === 'ABC123', `campo = "${typed}"`);

// --- el anfitrion crea la sala ---
await host.page.locator('.tabs button', { hasText: 'Crear sala' }).click();
await host.page.locator('.form input[type=password]').fill(PASSWORD);
await host.page.locator('.form button[type=submit]').click();

await host.page.locator('.field__value.room-code').waitFor({ timeout: 10_000 });
const code = (await host.page.locator('.field__value.room-code').textContent())?.trim() ?? '';
check('el anfitrion obtiene un codigo de sala', /^[A-Z2-9]{6}$/.test(code), code);

const copyLabel = await host.page.getByRole('button', { name: /Copiar credenciales/ }).count();
check('el modal ofrece copiar las credenciales', copyLabel === 1);

await host.page.screenshot({ path: `${SHOTS}/ui-modal-sala.png` });
await host.page.keyboard.press('Escape');

const chipGone = await host.page
  .waitForFunction(() => document.querySelector('.chip--interfaz') === null, null, { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
check('al cerrar el modal el juego recupera el teclado', chipGone);
check(
  'el codigo queda visible en la barra superior',
  (await host.page.locator('.roomchip__code').textContent())?.trim() === code,
);

// --- el invitado entra ---
await guest.page.locator('.roomchip').click();
await guest.page.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await guest.page.locator('.form input.input--code').fill(code);
await guest.page.locator('.form input[type=password]').fill(PASSWORD);
await guest.page.locator('.form button[type=submit]').click();

// Con ediciones distintas la regla es rechazar, asi que la prueba termina aqui.
if (ROM_HOST !== ROM_GUEST) {
  const message = await guest.page
    .locator('.alert')
    .textContent({ timeout: 10_000 })
    .catch(() => null);
  check('una edicion distinta se rechaza al entrar', message !== null, (message ?? '').trim());
  check(
    'y el motivo se explica sin tecnicismos',
    /mismo juego|idiomas distintos|no es un juego/i.test(message ?? ''),
  );
  await guest.page.screenshot({ path: `${SHOTS}/ui-rechazo-edicion.png` });
  await browser.close();
  console.log(
    failures === 0 ? '\nREGLA DE EDICION CORRECTA' : `\n${failures} COMPROBACIONES FALLIDAS`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

await guest.page.keyboard.press('Escape');

// --- esperamos a que aparezca la ventana pequena en ambos lados ---
const waitPip = (p) =>
  p
    .locator('.slot--pip')
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

const [hostOk, guestOk] = await Promise.all([waitPip(host.page), waitPip(guest.page)]);
check('el anfitrion ve la ventana del companero', hostOk);
check('el invitado ve la ventana del companero', guestOk);

// --- el video debe tener imagen de verdad ---
const videoOf = (p) =>
  p.evaluate(async () => {
    const v = document.querySelector('video.slot__media');
    if (!v) return { found: false };
    for (let i = 0; i < 30 && v.videoWidth === 0; i += 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
    return { found: true, width: v.videoWidth, height: v.videoHeight, playing: !v.paused };
  });

const hostVideo = await videoOf(host.page);
const guestVideo = await videoOf(guest.page);
check('el anfitrion recibe el video del invitado', hostVideo.width > 0, JSON.stringify(hostVideo));
check('el invitado recibe el video del anfitrion', guestVideo.width > 0, JSON.stringify(guestVideo));

// --- intercambiar pantalla grande y pequena ---
await host.page.locator('.slot--pip .slot__action').click();
const swapped = await host.page.evaluate(
  () => document.querySelector('.slot--pip')?.querySelector('canvas') !== null,
);
check('el boton de intercambio pone tu partida en pequeno', swapped);
await host.page.screenshot({ path: `${SHOTS}/ui-juego-intercambiado.png` });
await host.page.locator('.slot--pip .slot__action').click();

await host.page.screenshot({ path: `${SHOTS}/ui-juego.png` });
await guest.page.screenshot({ path: `${SHOTS}/ui-juego-invitado.png` });

// --- salida limpia ---
await guest.page.locator('.roomchip').click();
await guest.page.getByRole('button', { name: 'Salir de la sala' }).click();
const noticed = await host.page
  .locator('.status', { hasText: 'Esperando' })
  .waitFor({ timeout: 15_000 })
  .then(() => true)
  .catch(() => false);
check('el anfitrion se entera de que el companero se fue', noticed);

await browser.close();
console.log(failures === 0 ? '\nPARTIDA COMPARTIDA FUNCIONANDO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

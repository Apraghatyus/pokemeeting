// Como se llama el que está al otro lado.
//
// Hasta ahora su ventana decia "Tu companero" y su columna, "Equipo de tu
// companero". Con dos partidas en pantalla y dos columnas de seis fichas
// parecidas, poner el nombre de quien juega contigo es de las cosas que mas
// rapido hacen que esto parezca una sala y no un panel.
//
// NO ES UNA CUENTA, y eso es lo que define que hay que probar: es un apodo que
// se escribe al entrar en la sala, viaja con ella y se queda ahi. No se
// registra, no es unico y no se guarda en ningun servidor.
//
// Lo que se comprueba:
//
//   1. Que cada uno ve el nombre del otro, no el suyo.
//   2. Que sin nombre se sigue pudiendo jugar y se vuelve a "tu companero".
//      Pedirlo como requisito seria un paso mas para entrar en una sala.
//   3. Que se recuerda, para no escribirlo cada vez.
//   4. Que quien abre un enlace de invitacion ve de quien es.
//
// Hace falta DOS navegadores: el nombre del otro no existe jugando solo.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-apodo.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const CLAVE = 'la del wifi';

if (!ROM) {
  console.error('Uso: node tools/tests/test-apodo.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });

const abrir = async () => {
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await contexto.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return page;
};

const escribirNombre = async (page, nombre) => {
  const campo = page.locator('.form input[placeholder="Como quieres que te llamen"]');
  if (nombre === null) return (await campo.count()) === 1;
  await campo.fill(nombre);
  return true;
};

const anfitrion = await abrir();
const invitado = await abrir();

// --- 1. cada uno ve el nombre del otro ---
await anfitrion.locator('.roomchip').click();
check('al crear una sala se puede poner nombre', await escribirNombre(anfitrion, 'Lucho'));
await anfitrion.locator('.form input[type=password]').fill(CLAVE);
await anfitrion.locator('.form button[type=submit]').click();
await anfitrion.locator('.field__value.room-code').waitFor({ timeout: 15_000 });
const sala = ((await anfitrion.locator('.field__value.room-code').textContent()) ?? '').trim();

await invitado.locator('.roomchip').click();
await invitado.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await invitado.locator('.form input.input--code').fill(sala);
await escribirNombre(invitado, 'Juan');
await invitado.locator('.form input[type=password]').fill(CLAVE);
await invitado.locator('.form button[type=submit]').click();

const conectados = await Promise.all(
  [anfitrion, invitado].map((p) =>
    p.locator('.pantalla--pequena').waitFor({ timeout: 60_000 }).then(() => true).catch(() => false),
  ),
);
check('los dos se conectan', conectados.every(Boolean), JSON.stringify(conectados));

for (const page of [anfitrion, invitado]) {
  await page.locator('.modal[open] .modal__close').first().click().catch(() => {});
  await page.waitForTimeout(400);
}

/** Lo que dice la pantalla sobre quien esta al otro lado. */
const comoLeLlama = (page) =>
  page.evaluate(() => ({
    ventana:
      [...document.querySelectorAll('.pantalla__etiqueta')]
        .map((e) => e.textContent?.trim() ?? '')
        .find((t) => t !== 'Tu partida') ?? null,
    columna:
      document.querySelector('.equipo--companero .equipo__titulo')?.textContent?.trim() ?? null,
  }));

const vistoPorElAnfitrion = await comoLeLlama(anfitrion);
check('el anfitrion ve el nombre del otro en su ventana',
  vistoPorElAnfitrion.ventana === 'Juan', String(vistoPorElAnfitrion.ventana));
check('y en su columna de equipo',
  vistoPorElAnfitrion.columna === 'Equipo de Juan', String(vistoPorElAnfitrion.columna));
// Lo que no puede pasar: verse a uno mismo al otro lado.
check('y no ve el suyo propio', vistoPorElAnfitrion.ventana !== 'Lucho');

const vistoPorElInvitado = await comoLeLlama(invitado);
check('y el invitado ve el del anfitrion', vistoPorElInvitado.ventana === 'Lucho',
  String(vistoPorElInvitado.ventana));

// --- 4. quien abre el enlace ve de quien es ---
const datos = `${sala}:${encodeURIComponent(CLAVE)}`;
const tercero = await (await navegador.newContext({ viewport: { width: 1100, height: 860 } })).newPage();
await tercero.goto(`${URL}#${datos}`, { waitUntil: 'load' });
await tercero.waitForTimeout(5000);
const titulo = ((await tercero.locator('.modal[open] .modal__title').textContent()) ?? '').trim();
check('la invitacion dice quien invita', titulo === 'Lucho te ha invitado a jugar', titulo);
await tercero.context().close();

// --- 3. se recuerda para la proxima ---
const recordado = await anfitrion.evaluate(() => globalThis.localStorage.getItem('emupoke.apodo'));
check('el nombre se recuerda en este navegador', recordado === 'Lucho', String(recordado));

// --- 2. sin nombre se sigue pudiendo jugar ---
//
// Pedirlo como requisito seria un paso mas para entrar en una sala, que es lo
// que se quiere que cueste poco. Sin el, se vuelve a lo de antes.
const mudo = await abrir();
const otraSala = await abrir();

await mudo.locator('.roomchip').click();
await mudo.locator('.form input[type=password]').fill(CLAVE);
await mudo.locator('.form button[type=submit]').click();
await mudo.locator('.field__value.room-code').waitFor({ timeout: 15_000 });
const sala2 = ((await mudo.locator('.field__value.room-code').textContent()) ?? '').trim();

await otraSala.locator('.roomchip').click();
await otraSala.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await otraSala.locator('.form input.input--code').fill(sala2);
await otraSala.locator('.form input[type=password]').fill(CLAVE);
await otraSala.locator('.form button[type=submit]').click();

const sinNombre = await Promise.all(
  [mudo, otraSala].map((p) =>
    p.locator('.pantalla--pequena').waitFor({ timeout: 60_000 }).then(() => true).catch(() => false),
  ),
);
check('sin nombre tambien se entra', sinNombre.every(Boolean), JSON.stringify(sinNombre));

await mudo.locator('.modal[open] .modal__close').first().click().catch(() => {});
await mudo.waitForTimeout(400);
const sinApodo = await comoLeLlama(mudo);
check('y entonces se le llama "Tu companero", como antes',
  sinApodo.ventana === 'Tu companero', String(sinApodo.ventana));

await navegador.close();
console.log(
  fallos === 0
    ? '\nCADA UNO VE EL NOMBRE DEL OTRO'
    : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

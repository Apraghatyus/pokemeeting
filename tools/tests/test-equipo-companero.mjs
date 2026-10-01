// Comprueba que al entrar en una sala se ve el equipo del que ya estaba.
//
// Reproduce un fallo que aparecio jugando: el equipo solo se enviaba cuando
// cambiaba, asi que quien llevaba un rato jugando no le mandaba nada al que
// acababa de entrar. Al recien llegado le aparecia la columna vacia hasta que
// al otro le pasara algo en su partida.
//
// Necesita el servidor de salas y la aplicacion levantados (npm run dev:all).
//
// Uso: node tools/tests/test-equipo-companero.mjs <rom.gba> <estado.bin>
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [, , ROM, ESTADO] = process.argv;
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const PASSWORD = 'prueba-equipo';

if (!ROM || !ESTADO) {
  console.error('Uso: node tools/tests/test-equipo-companero.mjs <rom.gba> <estado.bin>');
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

const abrir = async () => {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await contexto.newPage();
  page.on('pageerror', (e) => {
    if (!/unwind/.test(e.message)) console.log(`[pageerror] ${e.message}`.slice(0, 140));
  });
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

// --- el anfitrion ya lleva un rato jugando y tiene equipo ---
await anfitrion.evaluate(async (bytes) => {
  const m = globalThis.mGBAModule;
  const base = m.gameName.split('/').pop().replace(/\.[^.]+$/, '');
  m.FS.writeFile(`${m.filePaths().saveStatePath}/${base}.ss3`, new Uint8Array(bytes));
  await new Promise((r) => setTimeout(r, 200));
  return m.loadStateSlot(3, 0);
}, [...new Uint8Array(readFileSync(ESTADO))]);

const conEquipo = await anfitrion
  .waitForFunction(
    () =>
      [...document.querySelectorAll('.equipo--propio .ficha')].filter(
        (f) => !f.classList.contains('ficha--hueco'),
      ).length > 0,
    null,
    { timeout: 25_000 },
  )
  .then(() => true)
  .catch(() => false);
check('el anfitrion tiene equipo antes de que entre nadie', conEquipo);

// Se deja pasar mas de un ciclo de lectura para que su equipo deje de cambiar:
// asi, si al entrar el invitado no se reenvia, no se ve nada. Que es el fallo.
await anfitrion.waitForTimeout(7000);

// --- se crea la sala y entra el invitado ---
await anfitrion.locator('.roomchip').click();
await anfitrion.locator('.tabs button', { hasText: 'Crear sala' }).click();
await anfitrion.locator('.form input[type=password]').fill(PASSWORD);
await anfitrion.locator('.form button[type=submit]').click();
await anfitrion.waitForSelector('.room-code', { timeout: 20_000 });
const codigo = ((await anfitrion.locator('.room-code').textContent()) ?? '').trim();
check('se crea la sala', /^[A-Z2-9]{6}$/.test(codigo), codigo);

await invitado.locator('.roomchip').click();
await invitado.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await invitado.locator('.form input.input--code').fill(codigo);
await invitado.locator('.form input[type=password]').fill(PASSWORD);
await invitado.locator('.form button[type=submit]').click();

// --- lo que se estaba probando ---
const leLlego = await invitado
  .waitForFunction(
    () =>
      [...document.querySelectorAll('.equipo--companero .ficha')].filter(
        (f) => !f.classList.contains('ficha--hueco'),
      ).length > 0,
    null,
    { timeout: 45_000 },
  )
  .then(() => true)
  .catch(() => false);
check('al entrar, el invitado ve el equipo del que ya estaba', leLlego);

if (leLlego) {
  // Ojo con el orden: la columna del companero crece de abajo hacia arriba, asi
  // que la primera ficha del DOM es la ranura 6, que esta vacia.
  const texto = (
    (await invitado
      .locator('.equipo--companero .ficha:not(.ficha--hueco)')
      .first()
      .textContent()) ?? ''
  )
    .replace(/\s+/g, ' ')
    .trim();
  check('con su mote y su nivel', /CCC/.test(texto) && /Nv\./.test(texto), texto);
}

await navegador.close();
console.log(fallos === 0 ? '\nEL EQUIPO LLEGA AL ENTRAR' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

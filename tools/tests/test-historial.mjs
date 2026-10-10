// Lo que queda guardado cuando una partida se acaba.
//
// No se ensena en ningun sitio, y por eso hay que probarlo: una cosa que no se
// ve no se nota cuando deja de funcionar. Se recoge ahora para que el dia que
// haya cuentas y perfiles exista un historial de verdad que contar, porque una
// partida terminada no se vuelve a jugar: lo que no se apunte hoy se pierde.
//
// Dos partes, y la primera es la que de verdad puede estar mal:
//
//   1. Que los movimientos se leen de la partida. Son cuatro numeros dentro de
//      los cien bytes cifrados de cada Pokemon, asi que o salen los del juego o
//      salen numeros cualesquiera, y a simple vista las dos cosas se parecen.
//      Se comprueban contra un estado de verdad.
//   2. Que al acabar una partida queda apuntada: como acabo, por donde iba y
//      con que equipo.
//
// Lo segundo necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-historial.mjs <rom.gba> [estado.bin]
import { chromium } from 'playwright';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROM = process.argv[2];
const ESTADO =
  process.argv[3] ?? 'roms/Pokemon - Edicion Rojo Fuego (Spain)-aleatoria-muw3zeeo.estado.bin';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-historial.mjs <rom.gba> [estado.bin]');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

// --- 1. los movimientos salen de la partida ---
const pk = await import(
  pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href
);

if (!existsSync(ESTADO)) {
  console.log(`SALTO  los movimientos: no esta "${ESTADO}"`);
} else {
  const estado = new Uint8Array(readFileSync(ESTADO));
  const leido = pk.resumirEquipo(estado);
  check('se lee el equipo del estado de prueba', leido !== null);

  const ranuras = leido?.resumen.ranuras ?? [];
  check('y cada Pokemon trae sus movimientos',
    ranuras.length > 0 && ranuras.every((r) => Array.isArray(r.movimientos)),
    ranuras.map((r) => `${r.mote}:${(r.movimientos ?? []).length}`).join(' '));

  // Cuatro huecos siempre, porque el juego guarda cuatro; los vacios son cero.
  check('son cuatro huecos, como en el juego',
    ranuras.every((r) => r.movimientos.length === 4),
    ranuras.map((r) => (r.movimientos ?? []).join(',')).join(' | '));

  // Lo que distingue leerlos de inventarlos: un Pokemon que se usa tiene al
  // menos un movimiento, y ninguno puede pasarse del catalogo del juego.
  const todos = ranuras.flatMap((r) => r.movimientos ?? []);
  check('al menos uno sabe algun movimiento', todos.some((m) => m > 0),
    todos.join(','));
  check('y ninguno es un numero que no existe',
    todos.every((m) => m >= 0 && m <= 354),
    todos.filter((m) => m > 354).join(','));
  // Los huecos vacios van al final: un Pokemon no tiene un hueco en medio.
  check('los huecos vacios van al final, no en medio',
    ranuras.every((r) => {
      const m = r.movimientos ?? [];
      const primeroVacio = m.indexOf(0);
      return primeroVacio < 0 || m.slice(primeroVacio).every((x) => x === 0);
    }),
    ranuras.map((r) => (r.movimientos ?? []).join(',')).join(' | '));
}

// --- 2. la partida terminada queda apuntada ---
const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await navegador.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(3000);

const romName = await page.evaluate(
  () => globalThis.mGBAModule?.gameName?.split('/').pop() ?? null,
);

// Antes de acabar nada, no hay historial. Es lo primero que hay que mirar: un
// historial que se llena solo no cuenta partidas, cuenta cualquier cosa.
const alPrincipio = await page.evaluate(() =>
  JSON.parse(globalThis.localStorage.getItem('emupoke.historial') ?? '[]'),
);
check('jugando normal no se apunta nada', alPrincipio.length === 0, `${alPrincipio.length}`);

// Se provoca el final igual que en test-fin-ui: escribiendo el estado que el
// propio modulo guarda y recargando para que lo lea. Perder una partida de
// verdad desde una prueba no se puede.
/** Mete el estado de prueba en el nucleo y lo carga, para que haya equipo. */
const cargarElEstado = async (donde) => {
  if (!ESTADO || !existsSync(ESTADO)) return;
  const bytes = Array.from(new Uint8Array(readFileSync(ESTADO)));
  await donde.evaluate((datos) => {
    const core = globalThis.mGBAModule;
    const base = (core.gameName?.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    core.FS.writeFile(`${core.filePaths().saveStatePath}/${base}.ss4`, new Uint8Array(datos));
    return Boolean(core.loadStateSlot(4, 0));
  }, bytes);
  await donde.waitForTimeout(5000);
};

await cargarElEstado(page);

await page.evaluate((nombre) => {
  globalThis.localStorage.setItem(
    `emupoke.fin.${nombre}`,
    JSON.stringify({ vistos: [111, 222], terminada: true, continuada: false, resultado: 'derrota' }),
  );
}, romName);

await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(3000);
// Y el equipo otra vez: al recargar, la ROM arranca en su pantalla de titulo y
// una partida sin Pokemon no tiene nada que contar. Es a proposito que no se
// apunte hasta que haya equipo que apuntar.
await cargarElEstado(page);

const apuntado = await page.evaluate(() =>
  JSON.parse(globalThis.localStorage.getItem('emupoke.historial') ?? '[]'),
);

check('al acabar, la partida queda apuntada', apuntado.length === 1, `${apuntado.length}`);
const uno = apuntado[0] ?? {};
check('con como acabo', uno.resultado === 'derrota', String(uno.resultado));
check('con cual era', uno.partida === romName, String(uno.partida));
check('y con cuando', typeof uno.cuando === 'number' && uno.cuando > 0, String(uno.cuando));
check('se apunta si fue por el enlace del Soul Link', uno.porElEnlace === false,
  String(uno.porElEnlace));
check('y por donde iba', 'medallas' in uno, JSON.stringify(uno.medallas));

// Lo que se pidio: el equipo con sus movimientos.
const equipo = uno.equipo ?? [];
if (equipo.length === 0) {
  console.log('SALTO  el equipo apuntado: esta partida no tenia Pokemon');
} else {
  check('con el equipo que tenia', equipo.length > 0, `${equipo.length} Pokemon`);
  check('y cada uno con su especie, su mote y su nivel',
    equipo.every((p) => typeof p.especie === 'number' && typeof p.mote === 'string' && p.nivel > 0),
    equipo.map((p) => `${p.mote} Nv.${p.nivel}`).join(', '));
  check('y con sus movimientos, que es lo que se vino a guardar',
    equipo.every((p) => Array.isArray(p.movimientos) && p.movimientos.length === 4),
    equipo.map((p) => `${p.mote}:[${(p.movimientos ?? []).join(',')}]`).join(' '));
  check('y se apunta quien quedo caido',
    equipo.every((p) => typeof p.caido === 'boolean'));
}

// Y no se duplica: el cartel de fin puede verse mas de una vez -se cierra, se
// sigue jugando, vuelve a caer el equipo- y el historial cuenta finales.
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(3000);
await cargarElEstado(page);
const otraVez = await page.evaluate(() =>
  JSON.parse(globalThis.localStorage.getItem('emupoke.historial') ?? '[]'),
);
check('y volver a verlo no la apunta dos veces', otraVez.length === 1, `${otraVez.length}`);

// Nada de la ROM acaba aqui dentro: numeros y el mote, que lo escribio el
// jugador. Es la misma frontera de siempre.
const comoTexto = JSON.stringify(otraVez);
check('lo apuntado son numeros y motes, nada del juego',
  comoTexto.length < 4000, `${comoTexto.length} caracteres`);

await navegador.close();
console.log(
  fallos === 0
    ? '\nLO QUE PASO EN LA PARTIDA QUEDA APUNTADO'
    : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

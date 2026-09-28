// Prueba del servicio de aleatorizacion.
//
// Comprueba el circuito entero: envia una ROM y unos ajustes, ejecuta el
// randomizer de verdad por debajo y verifica que lo que vuelve es una ROM de
// GBA valida, del mismo juego y **distinta** de la que se mando.
//
// Uso: node tools/test-randomizer.mjs <rom.gba>
import { readFileSync } from 'node:fs';

const ROM = process.argv[2];
const BASE = process.env.RANDOMIZER_URL ?? 'http://127.0.0.1:8788';

if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/test-randomizer.mjs <rom.gba>');
  process.exit(2);
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${name}${detail ? '  -> ' + detail : ''}`);
  if (!ok) failures += 1;
};

const gameCodeOf = (bytes) => Buffer.from(bytes.subarray(0xac, 0xb0)).toString('ascii');
const isGba = (bytes) => bytes[0xb2] === 0x96;

const crc32 = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let b = 0; b < 8; b += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return (bytes) => {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
  };
})();

/** Marco del cuerpo: [4 bytes: longitud del JSON][JSON][ROM]. */
const pack = (request, rom) => {
  const header = Buffer.from(JSON.stringify(request), 'utf8');
  const body = Buffer.alloc(4 + header.length + rom.length);
  body.writeUInt32BE(header.length, 0);
  header.copy(body, 4);
  rom.copy(body, 4 + header.length);
  return body;
};

const post = (request, rom) =>
  fetch(`${BASE}/randomize`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: pack(request, rom),
  });

// --- 1. el servicio esta listo ---
let health;
try {
  health = await (await fetch(`${BASE}/health`)).json();
} catch {
  console.error(`No hay servicio en ${BASE}. Arrancalo con: npm run dev:randomizer`);
  process.exit(1);
}
check('Java disponible y de 64 bits', health.java.available && health.java.bits64, health.java.version ?? '');
check('el jar del randomizer esta en su sitio', health.jar.found, health.jar.path);
check('el menu de opciones esta disponible', health.menu.available, health.menu.jjs ?? 'sin jjs');
check('el catalogo llega con opciones', (health.options?.length ?? 0) >= 7,
  `${health.options?.length ?? 0} opciones`);
if (!health.jar.found || !health.java.available) {
  console.log('\nFalta preparacion, no se puede seguir. Lee tools/randomizer/LEEME.md.');
  process.exit(1);
}

// --- 2. una ROM que no es Rojo Fuego ni Verde Hoja se rechaza ---
//
// Se fabrica una cabecera minima en vez de usar otra ROM: lo que se prueba es
// la comprobacion del codigo de juego, no el emulador.
const fake = Buffer.alloc(0x200);
fake.write('AXVE', 0xac, 'ascii');
fake[0xb2] = 0x96;
const rejected = await post({ options: ['salvajes'] }, fake);
const rejectedBody = await rejected.json().catch(() => ({}));
check('otro juego se rechaza antes de tocar Java', rejected.status === 400, rejectedBody.message ?? '');

// --- 3. el caso real ---
const original = readFileSync(ROM);
console.log(`\naleatorizando ${(original.length / 1024 / 1024).toFixed(0)} MB, esto tarda...`);
const started = Date.now();
const response = await post(
  { options: ['salvajes', 'iniciales', 'entrenadores', 'movimientos', 'mts', 'tiendas', 'objetos'] },
  original,
);
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (!response.ok) {
  const error = await response.json().catch(() => ({}));
  check('la aleatorizacion termina bien', false, `${response.status} ${error.message ?? ''} ${error.detalle ?? ''}`);
  console.log(`\n${failures} COMPROBACIONES FALLIDAS`);
  process.exit(1);
}

const randomized = new Uint8Array(await response.arrayBuffer());
check('la aleatorizacion termina bien', true, `${seconds} s`);
check('vuelve una ROM de GBA valida', isGba(randomized));
check('del mismo tamano que la original', randomized.length === original.length,
  `${randomized.length} bytes`);
check('y del mismo juego', gameCodeOf(randomized) === gameCodeOf(original), gameCodeOf(randomized));

const antes = crc32(original);
const despues = crc32(randomized);
check('el contenido ha cambiado de verdad', antes !== despues, `${antes} -> ${despues}`);

const seed = response.headers.get('x-seed');
check('se informa de la semilla usada', seed !== null, seed ?? 'no aparecio en el registro');

// El resumen es lo que permite notar que unos ajustes no cambiaron nada.
const resumen = JSON.parse(
  Buffer.from(response.headers.get('x-summary') ?? '', 'base64').toString('utf8'),
);
check('el resumen dice que ha cambiado', (resumen.changed?.length ?? 0) >= 5,
  (resumen.changed ?? []).join(', '));
check('y nombra los iniciales', (resumen.starters?.length ?? 0) === 3,
  (resumen.starters ?? []).join(' / '));

// --- una peticion sin opciones se rechaza con un mensaje claro ---
const vacia = await post({ options: [] }, original);
const vaciaBody = await vacia.json().catch(() => ({}));
check('pedir sin marcar nada da un error entendible', vacia.status === 400, vaciaBody.message ?? '');

console.log(failures === 0 ? '\nALEATORIZACION FUNCIONANDO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

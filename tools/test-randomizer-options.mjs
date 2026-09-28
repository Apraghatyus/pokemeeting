// Comprueba que CADA opcion del menu cambia la ROM de verdad.
//
// Existe por una leccion concreta: unos ajustes mal construidos producian una
// ROM que arrancaba y parecia normal, pero no tenia nada aleatorizado. Una
// opcion que no hace nada es peor que no ofrecerla, porque el jugador cree que
// la tiene.
//
// Cada opcion se prueba SOLA: si se probaran juntas, una rota se escondería
// detras de las demas.
//
// Uso: node tools/test-randomizer-options.mjs <rom.gba>
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const ROM = process.argv[2];
const BASE = process.env.RANDOMIZER_URL ?? 'http://127.0.0.1:8788';

if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/test-randomizer-options.mjs <rom.gba>');
  process.exit(2);
}

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

const pack = (request, rom) => {
  const header = Buffer.from(JSON.stringify(request), 'utf8');
  const body = Buffer.alloc(4 + header.length + rom.length);
  body.writeUInt32BE(header.length, 0);
  header.copy(body, 4);
  rom.copy(body, 4 + header.length);
  return body;
};

const health = await (await fetch(`${BASE}/health`)).json().catch(() => null);
if (!health?.jar?.found) {
  console.error(`No hay servicio listo en ${BASE}. Arrancalo con: npm run dev:randomizer`);
  process.exit(1);
}

const original = readFileSync(ROM);
const originalCrc = crc32(original);
console.log(`ROM base: ${originalCrc}  (${health.options.length} opciones a comprobar)\n`);

let failures = 0;
for (const option of health.options) {
  const started = Date.now();
  const response = await fetch(`${BASE}/randomize`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-body-encoding': 'gzip' },
    body: gzipSync(pack({ options: [option.id] }, original), { level: 6 }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.log(`FALLO ${option.label.padEnd(30)} el servicio respondio ${response.status}: ${error.message ?? ''}`);
    failures += 1;
    continue;
  }

  const payload = Buffer.from(await response.arrayBuffer());
  const bytes = new Uint8Array(
    response.headers.get('x-body-encoding') === 'gzip' ? gunzipSync(payload) : payload,
  );
  const cambio = crc32(bytes) !== originalCrc;
  const segundos = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${cambio ? 'OK   ' : 'FALLO'} ${option.label.padEnd(30)} ${cambio ? 'cambia la ROM' : 'NO CAMBIA NADA'}  (${segundos} s)`,
  );
  if (!cambio) failures += 1;
}

console.log(
  failures === 0
    ? '\nTODAS LAS OPCIONES HACEN ALGO'
    : `\n${failures} OPCIONES NO CAMBIAN NADA: no deberian ofrecerse`,
);
process.exit(failures === 0 ? 0 : 1);

// Comprueba que una partida aleatorizada se puede rehacer.
//
// Es lo que sostiene todo el asunto de no descargar la ROM: si con la misma
// ROM base, los mismos ajustes y la misma semilla no saliera exactamente la
// misma copia, un jugador que volviera al dia siguiente se encontraria otro
// mundo y su guardado no valdria para nada.
//
// Se compara el hash de la ROM entera, no una muestra: aqui un solo byte
// distinto ya es un juego distinto.
//
// Uso: node tools/test-semilla.mjs <rom.gba>
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const rom = readFileSync(process.argv[2]);
const BASE = 'http://127.0.0.1:8788';
const OPCIONES = ['estadisticas', 'tipos', 'salvajes'];

const pack = (req, rom) => {
  const h = Buffer.from(JSON.stringify(req), 'utf8');
  const b = Buffer.alloc(4 + h.length + rom.length);
  b.writeUInt32BE(h.length, 0); h.copy(b, 4); rom.copy(b, 4 + h.length);
  return b;
};
const pedir = async (req) => {
  const res = await fetch(`${BASE}/randomize`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-body-encoding': 'gzip' },
    body: gzipSync(pack(req, rom), { level: 6 }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const cuerpo = Buffer.from(await res.arrayBuffer());
  const bytes = res.headers.get('x-body-encoding') === 'gzip' ? gunzipSync(cuerpo) : cuerpo;
  const ajustes = res.headers.get('x-settings');
  return {
    seed: res.headers.get('x-seed'),
    reproducible: res.headers.get('x-reproducible'),
    ajustes: ajustes ? Buffer.from(ajustes, 'base64').toString('utf8') : null,
    hash: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
  };
};

let fallos = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'OK   ' : 'FALLO'} ${n}${d ? '  -> ' + d : ''}`); if (!ok) fallos += 1; };

const primera = await pedir({ options: OPCIONES });
check('una aleatorizacion nueva trae semilla', primera.seed !== null, `semilla ${primera.seed}`);
check('y se marca como reproducible', primera.reproducible === '1');
check('y trae la receta de ajustes', (primera.ajustes?.length ?? 0) > 10, primera.ajustes?.slice(0, 24) + '...');

const repetida = await pedir({ options: OPCIONES, seed: primera.seed });
check('repetirla con su semilla da la MISMA ROM', repetida.hash === primera.hash,
  `${primera.hash} vs ${repetida.hash}`);

const porReceta = await pedir({ settingsString: primera.ajustes, seed: primera.seed });
check('y rehacerla desde la receta tambien', porReceta.hash === primera.hash,
  `${primera.hash} vs ${porReceta.hash}`);

const otra = await pedir({ options: OPCIONES });
check('sin semilla sale otra distinta', otra.hash !== primera.hash);

console.log(fallos === 0 ? '\nSEMILLA REPRODUCIBLE' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

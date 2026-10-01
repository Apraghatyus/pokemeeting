// La cola, por el camino HTTP de verdad.
//
// test-cola.mjs prueba la clase; esto prueba que esta enchufada: que mas
// peticiones de las que caben no arrancan todas a la vez, que ninguna se cae por
// esperar, y que quien espera puede preguntar por donde va.
//
// Lo ultimo no es un adorno. Sin ello, esperar media hora es indistinguible de
// estar roto, y el jugador recarga la pagina, con lo que vuelve a la cola por
// el final y encima deja trabajo huerfano por el camino.
//
// Necesita el servicio de aleatorizacion levantado (npm run dev:all).
//
// Uso: node tools/tests/test-cola-servicio.mjs <rom.gba>
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const ROM = process.argv[2];
const BASE = process.env.RANDOMIZER_URL ?? 'http://127.0.0.1:8788';

if (!ROM) {
  console.error('Uso: node tools/tests/test-cola-servicio.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const estado = async () => (await fetch(`${BASE}/cola`)).json();

const inicial = await estado();
check('el servicio dice con que limite corre', typeof inicial.limite === 'number',
  `limite ${inicial.limite}`);
check('y empieza sin nadie trabajando', inicial.atendiendo === 0 && inicial.enCola === 0,
  `${inicial.atendiendo} dentro, ${inicial.enCola} esperando`);

const rom = readFileSync(ROM);
const peticion = (ticket) => {
  const cab = Buffer.from(JSON.stringify({ options: ['salvajes', 'iniciales'], ticket }), 'utf8');
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(cab.length, 0);
  return gzipSync(Buffer.concat([largo, cab, rom]), { level: 6 });
};

// Se piden el doble de las que caben, para que sobre gente a la fuerza.
const CUANTAS = inicial.limite * 2;
const aleatorizar = (ticket) =>
  fetch(`${BASE}/randomize`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-body-encoding': 'gzip' },
    body: peticion(ticket),
  }).then(async (r) => ({ estado: r.status, semilla: r.headers.get('x-seed'), bytes: (await r.arrayBuffer()).byteLength }));

const tickets = Array.from({ length: CUANTAS }, (_, i) => `prueba-${i}`);
const trabajando = Promise.all(tickets.map(aleatorizar));

// Vigilar la cola mientras corren. Interesa el maximo visto, no una foto: el
// momento exacto en que se mira es casualidad.
let maxAtendiendo = 0;
let maxEnCola = 0;
let vioSuPuesto = false;
let peorRespuesta = 0;
let seguir = true;

const vigilar = (async () => {
  while (seguir) {
    const t = performance.now();
    try {
      const ahora = await estado();
      peorRespuesta = Math.max(peorRespuesta, performance.now() - t);
      maxAtendiendo = Math.max(maxAtendiendo, ahora.atendiendo);
      maxEnCola = Math.max(maxEnCola, ahora.enCola);

      // El ultimo de la lista es el que mas posibilidades tiene de estar esperando.
      const suyo = await (await fetch(`${BASE}/cola?ticket=${tickets.at(-1)}`)).json();
      if (suyo.puesto !== null) vioSuPuesto = true;
    } catch { /* ocupado */ }
    await new Promise((sigue) => setTimeout(sigue, 100));
  }
})();

const resultados = await trabajando;
seguir = false;
await vigilar;

check(`las ${CUANTAS} peticiones terminan bien`,
  resultados.every((r) => r.estado === 200),
  resultados.map((r) => r.estado).join(','));

check('no se arrancan todas a la vez', maxAtendiendo <= inicial.limite,
  `${maxAtendiendo} como maximo, limite ${inicial.limite}`);

check('a las que no caben se las hace esperar', maxEnCola > 0, `${maxEnCola} esperando`);

check('quien espera puede saber por donde va', vioSuPuesto);

// Esto es lo que compra comprimir fuera del bucle de eventos: con gzipSync,
// cada respuesta de 16 MB congelaba el proceso entero 389 ms, asi que la propia
// consulta de la cola llegaba tarde justo cuando mas falta hacia.
check('y preguntarlo sigue siendo instantaneo con todo ocupado', peorRespuesta < 250,
  `${peorRespuesta.toFixed(0)} ms en el peor caso`);

// Cada copia es distinta aunque se pidieran juntas: la semilla se escoge por
// peticion, no por tanda.
const semillas = new Set(resultados.map((r) => r.semilla));
check('cada una trae su propia semilla', semillas.size === CUANTAS, `${semillas.size}/${CUANTAS}`);

const final = await estado();
check('al acabar la cola queda vacia', final.atendiendo === 0 && final.enCola === 0,
  `${final.atendiendo} dentro, ${final.enCola} esperando`);
check('y el servicio sabe lo que tarda por copia', typeof final.segundosPorCopia === 'number',
  `${final.segundosPorCopia} s`);

console.log(fallos === 0 ? '\nLA COLA ESTA ENCHUFADA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

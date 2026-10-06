// Leer las medallas de una partida.
//
// Son banderas: bits sueltos, sin forma que buscar. Eso las hace faciles de
// leer y dificiles de ENCONTRAR, que es al reves que el equipo. Y como Rojo
// Fuego mueve sus bloques de guardado, tampoco vale una direccion fija.
//
// Asi que mientras no se mida la direccion contra una partida real, esto tiene
// que decir "no se sabe" en vez de inventarse un cero. Enseñar cero medallas a
// quien tiene cuatro es peor que no enseñar nada, y eso es lo que mas se prueba
// aqui.
//
// Uso: npx tsx tools/tests/test-medallas.mjs
import { pathToFileURL } from 'node:url';

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
const { leerMedallas, DIRECCION_MEDALLAS, TOTAL_MEDALLAS, TAMANO_ESTADO } = pk;

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const estado = () => new Uint8Array(TAMANO_ESTADO);

check('son ocho medallas', TOTAL_MEDALLAS === 8);

// --- mientras no se sepa la direccion, no se inventa nada ---
check('de un juego sin medir, dice que no lo sabe',
  leerMedallas(estado(), 'BPRS').cuantas === null);
check('y no devuelve una lista de ceros que parezca "ninguna"',
  leerMedallas(estado(), 'BPRS').conseguidas.length === 0);
check('de un juego desconocido, igual', leerMedallas(estado(), 'XXXX').cuantas === null);

// --- y cuando se sepa, que lea bien ---
// Se mide con una direccion de mentira metida a mano, que es lo que habra ahi
// en cuanto alguien pase los dos estados.
const EWRAM_EN_ESTADO = 0x21000;
const EWRAM_BASE = 0x02000000;
const DIRECCION = 0x02025000;

DIRECCION_MEDALLAS.PRU = DIRECCION;
const conBits = (byte) => {
  const s = estado();
  s[EWRAM_EN_ESTADO + (DIRECCION - EWRAM_BASE)] = byte;
  return s;
};

check('sin ninguna, cero', leerMedallas(conBits(0b00000000), 'PRU').cuantas === 0);
check('con la primera, una', leerMedallas(conBits(0b00000001), 'PRU').cuantas === 1);
check('con cuatro, cuatro', leerMedallas(conBits(0b00001111), 'PRU').cuantas === 4);
check('con las ocho, ocho', leerMedallas(conBits(0b11111111), 'PRU').cuantas === 8);

const cuatro = leerMedallas(conBits(0b00001111), 'PRU');
check('y dice CUALES, no solo cuantas',
  cuatro.conseguidas.join(',') === 'true,true,true,true,false,false,false,false',
  cuatro.conseguidas.map((x) => (x ? '1' : '0')).join(''));

// --- la comprobacion que convierte un error en un hueco honesto ---
// Las medallas se ganan en orden, asi que el byte solo puede ser 0, 1, 3, 7...
// Si no lo es, la direccion esta mal y hay que callarse, no contar bits.
check('un byte que no puede ser medallas se da por desconocido',
  leerMedallas(conBits(0b00001010), 'PRU').cuantas === null,
  'tercera y primera sin las de en medio');
check('ni siquiera uno que parece lleno por otro lado',
  leerMedallas(conBits(0b11110000), 'PRU').cuantas === null);

delete DIRECCION_MEDALLAS.PRU;

console.log(fallos === 0 ? '\nLAS MEDALLAS NO SE INVENTAN' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

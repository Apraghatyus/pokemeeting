// Lo que viaja por el canal cuando se intercambia un Pokemon.
//
// Al otro lado hay un navegador que no controlamos, y aqui lo que llega no es
// un aviso que se pueda descartar: son cien bytes que van a acabar ESCRITOS en
// la partida de alguien. Un bloque mal formado no da un Pokemon raro, da un
// "Bad Egg" y puede dejar la partida tocada.
//
// Por eso se prueba lo que se RECHAZA mas que lo que se acepta.
//
// Uso: npx tsx tools/tests/test-intercambio-red.mjs
import { pathToFileURL } from 'node:url';

const { parsePeerMessage } = await import(
  pathToFileURL(`${process.cwd()}/packages/protocol/src/index.ts`).href
);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

/** Un bloque de cien bytes en base64, que es lo que viaja de verdad. */
const bloqueBueno = Buffer.alloc(100, 7).toString('base64');

const oferta = (cambios = {}) => ({
  type: 'oferta',
  oferta: {
    trato: 'abc-123',
    ranura: 2,
    bloque: bloqueBueno,
    mote: 'Huesitos',
    especie: 105,
    nivel: 24,
    ...cambios,
  },
});

const leer = (objeto) => parsePeerMessage(JSON.stringify(objeto));

// --- lo que si vale ---
const buena = leer(oferta());
check('una oferta bien formada pasa', buena?.type === 'oferta');
check('y llega entera, sin perder el bloque',
  buena?.oferta.bloque === bloqueBueno && buena?.oferta.ranura === 2);

check('el "por mi adelante" pasa', leer({ type: 'trato-listo', trato: 'abc-123' })?.trato === 'abc-123');
check('y el "me echo atras" tambien', leer({ type: 'trato-roto', trato: 'abc-123' })?.type === 'trato-roto');

// Que lo de antes siga funcionando: ahora hay cuatro tipos de mensaje y es
// facil romper el que ya estaba al anadir los nuevos.
const equipo = leer({
  type: 'equipo',
  equipo: { juego: 'BPRS', momento: 1, ranuras: [] },
});
check('el equipo de siempre sigue pasando', equipo?.type === 'equipo');

// --- lo que NO puede pasar ---

check('un bloque mas corto no es un Pokemon',
  leer(oferta({ bloque: Buffer.alloc(99, 7).toString('base64') })) === null);
check('ni uno mas largo',
  leer(oferta({ bloque: Buffer.alloc(101, 7).toString('base64') })) === null);
check('ni uno vacio', leer(oferta({ bloque: '' })) === null);
check('ni algo que no sea texto', leer(oferta({ bloque: 12345 })) === null);

// La ranura se usa para escribir en el equipo: fuera de rango toca memoria que
// no es del equipo.
check('una ranura de mas no pasa', leer(oferta({ ranura: 6 })) === null);
check('ni una negativa', leer(oferta({ ranura: -1 })) === null);
check('ni una con decimales', leer(oferta({ ranura: 1.5 })) === null);

check('un nivel imposible no pasa', leer(oferta({ nivel: 0 })) === null);
check('ni uno por encima de cien', leer(oferta({ nivel: 101 })) === null);

// Un mote de veinte caracteres no cabe en el juego: viene de fuera.
check('un mote larguisimo no pasa', leer(oferta({ mote: 'x'.repeat(21) })) === null);

check('sin nombre de trato no pasa', leer(oferta({ trato: '' })) === null);
check('ni con uno larguisimo', leer(oferta({ trato: 'x'.repeat(65) })) === null);

check('una oferta sin oferta dentro no pasa', leer({ type: 'oferta' }) === null);
check('un "listo" sin trato no pasa', leer({ type: 'trato-listo' }) === null);
check('un tipo que no existe no pasa', leer({ type: 'otra-cosa', trato: 'a' }) === null);
check('y basura tampoco', parsePeerMessage('{{{') === null);

console.log(fallos === 0 ? '\nLO QUE SE ESCRIBE EN UNA PARTIDA SE MIRA ANTES' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

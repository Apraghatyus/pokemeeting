// Prueba de la compatibilidad entre ROMs. Sin navegador ni servidor: es logica
// pura y conviene que se pueda comprobar en un segundo.
//
// Lo que se verifica sobre todo es que NO se bloqueen parejas validas. El fallo
// que motivo este codigo era tratar el codigo de cabecera como un bloque, con
// lo que Rojo Fuego y Verde Hoja parecian juegos incompatibles.
//
// Uso: npx tsx tools/tests/test-roms.mjs
// La ruta se resuelve como URL y no como cadena: el proyecto vive en una
// carpeta con espacios y en Windows, donde concatenar rutas a mano falla.
const { compareRoms, parseGameCode, describeGame } = await import(
  new URL('../../packages/pokemon/src/index.ts', import.meta.url).href
);

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${name}${detail ? '  -> ' + detail : ''}`);
  if (!ok) failures += 1;
};

const rom = (gameCode, crc32 = 'aaaa1111', version = 0) => ({
  title: 'POKEMON',
  gameCode,
  version,
  crc32,
  fileName: `${gameCode}.gba`,
});

// --- lectura del codigo de cabecera ---
const fireRed = parseGameCode('BPRE');
check('BPRE se lee como Rojo Fuego en ingles',
  fireRed.game?.label === 'Rojo Fuego' && fireRed.language === 'ingles');

const fireRedEs = parseGameCode('BPRS');
check('BPRS es el MISMO juego en espanol',
  fireRedEs.game?.id === fireRed.game?.id && fireRedEs.language === 'espanol',
  describeGame('BPRS'));

check('BPGE se reconoce como Verde Hoja', parseGameCode('BPGE').game?.label === 'Verde Hoja');
check('un juego que no es Pokemon no se reconoce', parseGameCode('AZLE').game === null);

// --- la regla: misma edicion, es decir mismo juego y mismo idioma ---
const frVsLg = compareRoms(rom('BPRS', 'aaa'), rom('BPGS', 'bbb'));
check('Rojo Fuego y Verde Hoja NO comparten sala', !frVsLg.canPlayTogether);
check('y se explica que hace falta el mismo juego',
  frVsLg.notes.some((n) => /el mismo juego/.test(n)), frVsLg.headline);

const idiomas = compareRoms(rom('BPRE', 'aaa'), rom('BPRS', 'aaa'));
check('el mismo juego en idiomas distintos NO comparte sala', !idiomas.canPlayTogether);
check('y se nombran los dos idiomas',
  idiomas.notes.some((n) => /ingles/.test(n) && /espanol/.test(n)), idiomas.headline);

const otro = compareRoms(rom('BPRS', 'aaa'), rom('AZLE', 'ccc'));
check('una ROM que no es Pokemon NO comparte sala', !otro.canPlayTogether);

// --- lo que si se permite: dos aleatorizaciones de la misma edicion ---
const random = compareRoms(rom('BPRS', 'aaa'), rom('BPRS', 'bbb'));
check('dos aleatorizaciones de la misma edicion se permiten', random.canPlayTogether);
check('y se pueden intercambiar', random.canTrade);
check('avisando de que cambian estadisticas, tipo y habilidad',
  random.notes.some((n) => /estadisticas, el tipo y la habilidad/.test(n)));

const iguales = compareRoms(rom('BPRS', 'aaa'), rom('BPRS', 'aaa'));
check('la misma copia se reconoce como identica', iguales.level === 'identica');
check('y no genera avisos', iguales.notes.length === 0);


// --- el resto de la tercera generacion ---
check('AXVS se lee como Rubi en espanol',
  parseGameCode('AXVS').game?.label === 'Rubi' && parseGameCode('AXVS').language === 'espanol',
  describeGame('AXVS'));
check('AXPS se reconoce como Zafiro', parseGameCode('AXPS').game?.label === 'Zafiro');
check('BPES se reconoce como Esmeralda', parseGameCode('BPES').game?.label === 'Esmeralda');

const rubiZafiro = compareRoms(rom('AXVS', 'aaa'), rom('AXPS', 'bbb'));
check('Rubi y Zafiro NO comparten sala, igual que Rojo Fuego y Verde Hoja',
  !rubiZafiro.canPlayTogether, rubiZafiro.headline);

const dosRubies = compareRoms(rom('AXVS', 'aaa'), rom('AXVS', 'bbb'));
check('dos aleatorizaciones de Rubi si se permiten', dosRubies.canPlayTogether);
check('y se pueden intercambiar', dosRubies.canTrade);

const esmeraldas = compareRoms(rom('BPES', 'aaa'), rom('BPES', 'bbb'));
check('dos Esmeraldas distintas tambien', esmeraldas.canPlayTogether && esmeraldas.canTrade);

// Rubi y Zafiro son pareja de versiones, aunque la regla no deje mezclarlas.
check('Rubi sabe que su pareja es Zafiro',
  parseGameCode('AXVS').game?.sibling === 'AXP');
check('Esmeralda no tiene pareja, y esta bien que no la tenga',
  parseGameCode('BPES').game?.sibling === undefined);

// Lo que todavia no se ha comprobado jugando, marcado como tal.
check('Rojo Fuego consta como probado de verdad', parseGameCode('BPRS').game?.tested === true);
check('Rubi consta como NO probado todavia', parseGameCode('AXVS').game?.tested === false);

console.log(failures === 0 ? '\nCOMPATIBILIDAD CORRECTA' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

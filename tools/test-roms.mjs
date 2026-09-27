// Prueba de la compatibilidad entre ROMs. Sin navegador ni servidor: es logica
// pura y conviene que se pueda comprobar en un segundo.
//
// Lo que se verifica sobre todo es que NO se bloqueen parejas validas. El fallo
// que motivo este codigo era tratar el codigo de cabecera como un bloque, con
// lo que Rojo Fuego y Verde Hoja parecian juegos incompatibles.
//
// Uso: npx tsx tools/test-roms.mjs
// La ruta se resuelve como URL y no como cadena: el proyecto vive en una
// carpeta con espacios y en Windows, donde concatenar rutas a mano falla.
const { compareRoms, parseGameCode, describeGame } = await import(
  new URL('../packages/pokemon/src/index.ts', import.meta.url).href
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

// --- el caso que motivo todo: Rojo Fuego y Verde Hoja ---
const frVsLg = compareRoms(rom('BPRE', 'aaa'), rom('BPGE', 'bbb'));
check('Rojo Fuego y Verde Hoja pueden jugar juntos', frVsLg.canPlayTogether);
check('Rojo Fuego y Verde Hoja pueden intercambiar', frVsLg.canTrade);
check('y se explica que son pareja de versiones',
  frVsLg.notes.some((n) => /pareja de versiones/.test(n)));

// --- mismo juego en idiomas distintos ---
const idiomas = compareRoms(rom('BPRE', 'aaa'), rom('BPRS', 'aaa'));
check('mismo juego en dos idiomas se permite', idiomas.canTrade);
check('y se avisa del idioma', idiomas.notes.some((n) => /idiomas distintos/.test(n)));

// --- copias randomizadas distintas ---
const random = compareRoms(rom('BPRE', 'aaa'), rom('BPRE', 'bbb'));
check('dos aleatorizaciones del mismo juego se permiten', random.canTrade);
check('y se avisa de que un Pokemon puede llegar como otra especie',
  random.notes.some((n) => /otra especie/.test(n)));

// --- revisiones distintas ya no bloquean ---
const revs = compareRoms(rom('BPRE', 'aaa', 0), rom('BPRE', 'aaa', 1));
check('una revision distinta ya no impide nada', revs.canTrade);

// --- la misma copia exacta ---
const iguales = compareRoms(rom('BPRE', 'aaa'), rom('BPRE', 'aaa'));
check('la misma copia se reconoce como identica', iguales.level === 'identica');
check('y no genera avisos', iguales.notes.length === 0);

// --- algo que no es un juego de Pokemon ---
const otro = compareRoms(rom('BPRE', 'aaa'), rom('AZLE', 'ccc'));
check('con una ROM desconocida se puede acompanar', otro.canPlayTogether);
check('pero no intercambiar', !otro.canTrade);

// --- Esmeralda: compatible pero sin probar ---
const esmeralda = compareRoms(rom('BPRE', 'aaa'), rom('BPEE', 'ddd'));
check('Esmeralda se admite para intercambios', esmeralda.canTrade);
check('advirtiendo de que no esta probado',
  esmeralda.notes.some((n) => /no lo hemos podido probar/.test(n)));

console.log(failures === 0 ? '\nCOMPATIBILIDAD CORRECTA' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

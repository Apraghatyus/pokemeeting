// Reconocer el final bueno: el Salon de la Fama.
//
// Al entrar, OAK suelta un mensaje que lleva tu nombre dentro tres veces. Por
// eso el juego tiene que montarlo entero en memoria en vez de pintarlo desde la
// ROM, y por eso se puede leer.
//
// Lo que de verdad se comprueba aqui, y es lo que justifica el fichero: que el
// trozo elegido **no aparece en ningun otro sitio de la ROM**. Un ancla que
// sale dos veces da partidas por ganadas al leer un cartel cualquiera.
//
// Uso: npx tsx tools/tests/test-victoria.mjs [rom.gba]
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
const { enSalonDeLaFama, TAMANO_ESTADO } = pk;

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const EWRAM_EN_ESTADO = 0x21000;
const codificar = (t) =>
  [...t].map((c) => {
    if (c === ' ') return 0x00;
    if (c >= 'A' && c <= 'Z') return 0xbb + c.charCodeAt(0) - 65;
    return 0xd5 + c.charCodeAt(0) - 97;
  });

/** Un estado de Rojo Fuego vacio, con lo justo para que se reconozca. */
const estadoVacio = () => {
  const s = new Uint8Array(TAMANO_ESTADO);
  const v = new DataView(s.buffer);
  v.setUint32(0, 0x01000000, true);
  for (const [i, c] of [...'POKEMON FIRE'].entries()) s[0x10 + i] = c.charCodeAt(0);
  for (const [i, c] of [...'BPRS'].entries()) s[0x1c + i] = c.charCodeAt(0);
  return s;
};

check('una partida normal no es una victoria', enSalonDeLaFama(estadoVacio()) === false);

const ganando = estadoVacio();
ganando.set(codificar('FAMA de los'), EWRAM_EN_ESTADO + 0x4000);
check('con el mensaje del Salon en memoria, si lo es', enSalonDeLaFama(ganando) === true);

const alFinal = estadoVacio();
alFinal.set(codificar('FAMA de los'), EWRAM_EN_ESTADO + 0x3f000);
check('da igual en que parte de la memoria este', enSalonDeLaFama(alFinal) === true);

// Lo que NO vale: "HALL de la" sale en la tarjeta de entrenador y en dialogos
// de antes de la Liga, asi que se descarto a proposito.
const soloHall = estadoVacio();
soloHall.set(codificar('HALL de la'), EWRAM_EN_ESTADO + 0x4000);
check('mencionar el HALL no es haber ganado', enSalonDeLaFama(soloHall) === false);

check('un estado que no lo es, no rompe nada', enSalonDeLaFama(new Uint8Array(64)) === false);
check('ni uno vacio del todo', enSalonDeLaFama(new Uint8Array(0)) === false);

// --- contra la ROM de verdad ---
const ruta =
  process.argv[2] ?? 'roms/Pokemon - Edicion Rojo Fuego (Spain)/Pokemon - Edicion Rojo Fuego (Spain).gba';

if (!existsSync(ruta)) {
  console.log(`\n(sin ROM en "${ruta}": no se comprueba que el ancla sea unica)`);
} else {
  const rom = readFileSync(ruta);
  const veces = (texto) => {
    const p = Buffer.from(codificar(texto));
    let n = 0;
    for (let i = rom.indexOf(p); i !== -1; i = rom.indexOf(p, i + 1)) n += 1;
    return n;
  };

  const unica = veces('FAMA de los');
  check('el ancla aparece una sola vez en los dieciseis megas', unica === 1, `${unica} veces`);

  // Esto no es curiosidad: documenta por que el ancla es esa y no la obvia.
  const hall = veces('HALL de la');
  check('y la alternativa evidente aparece varias, por eso no se usa', hall > 1, `${hall} veces`);
}

console.log(fallos === 0 ? '\nLA VICTORIA SE RECONOCE' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

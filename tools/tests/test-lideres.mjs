// Hasta que nivel se puede subir antes de cada gimnasio.
//
// Es una regla que se pone la gente, no del juego: nadie puede llevar un
// Pokemon por encima del mas alto del proximo lider. Y el numero se lee de la
// ROM, no de una lista, porque en una copia aleatorizada los lideres llevan
// otros Pokemon: una tabla con los valores de siempre seria exacta en el juego
// original y mentira en el que se esta jugando.
//
// La comprobacion de verdad es contra la ROM: si salen los ocho niveles reales
// de Rojo Fuego, es que la tabla de entrenadores se esta leyendo bien.
//
// Uso: npx tsx tools/tests/test-lideres.mjs [rom.gba]
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
const { topesDeLosLideres, topeSiguiente, LIDERES_KANTO } = pk;

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

check('son los ocho de Kanto', LIDERES_KANTO.length === 8);
// El orden importa: la tabla del juego los guarda con Blaine antes que Sabrina,
// pero la medalla numero seis es la de Sabrina.
check('y en orden de medalla, no en el de la tabla del juego',
  LIDERES_KANTO[5] === 'SABRINA' && LIDERES_KANTO[6] === 'BLAINE',
  `${LIDERES_KANTO[5]} y despues ${LIDERES_KANTO[6]}`);

// --- a quien toca y con que tope ---
const topes = [14, 21, 24, 29, 43, 43, 47, 50];

const sinMedallas = topeSiguiente(topes, 0);
check('sin medallas toca el primer gimnasio',
  sinMedallas?.lider === 'BROCK' && sinMedallas?.nivel === 14 && sinMedallas?.gimnasio === 1,
  JSON.stringify(sinMedallas));

const conUna = topeSiguiente(topes, 1);
check('con una medalla toca el segundo',
  conUna?.lider === 'MISTY' && conUna?.nivel === 21 && conUna?.gimnasio === 2,
  JSON.stringify(conUna));

check('con las ocho ya no hay gimnasio al que ponerle tope',
  topeSiguiente(topes, 8) === null);
check('sin saber los topes, no se dice ninguno', topeSiguiente(null, 1) === null);
check('y un numero de medallas imposible tampoco inventa nada',
  topeSiguiente(topes, -1) === null);

// --- lo que no puede dar por bueno ---
check('una ROM de mentira no da topes', topesDeLosLideres(new Uint8Array(1024)) === null);
check('ni una vacia', topesDeLosLideres(new Uint8Array(0)) === null);

// --- contra la ROM de verdad ---
const ruta =
  process.argv[2] ??
  'roms/Pokemon - Edicion Rojo Fuego (Spain)/Pokemon - Edicion Rojo Fuego (Spain).gba';

if (!existsSync(ruta)) {
  console.log(`\n(sin ROM en "${ruta}": no se comprueba contra una de verdad)`);
} else {
  const rom = new Uint8Array(readFileSync(ruta));
  const leidos = topesDeLosLideres(rom);

  check('se encuentran los ocho lideres en la ROM', leidos !== null,
    leidos ? leidos.join(', ') : 'ninguno');

  if (leidos) {
    // Los niveles de verdad de Rojo Fuego. Si estos ocho cuadran es que la
    // tabla de entrenadores se esta leyendo bien, y de paso que el tamano de
    // cada Pokemon del equipo -16 bytes con movimientos propios, 8 sin ellos-
    // se dedujo bien.
    check('y sus niveles son los del juego', leidos.join() === topes.join(), leidos.join(', '));

    // Giovanni sale tres veces en la tabla porque se le pelea tambien fuera del
    // gimnasio. El que vale es el mas fuerte, que es el del gimnasio.
    check('de Giovanni se coge el equipo del gimnasio, el mas fuerte',
      leidos[7] === 50, String(leidos[7]));

    let suben = true;
    for (let i = 1; i < leidos.length; i += 1) if (leidos[i] < leidos[i - 1]) suben = false;
    check('y los topes nunca bajan de un gimnasio al siguiente', suben, leidos.join(' <= '));
  }
}

console.log(fallos === 0 ? '\nEL TOPE SALE DE LA ROM, NO DE UNA LISTA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

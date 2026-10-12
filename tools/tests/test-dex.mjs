// La tabla fija de la Pokedex nacional, contra la de la ROM.
//
// En el proyecto casi todo se lee del fichero que tienes puesto, a proposito.
// Esta tabla es la excepcion, y por eso hay que vigilarla: se fijo porque el
// ranking enseña equipos de partidas de OTRA gente y se mira tanto jugando como
// sin jugar, y sin ROM delante no habia forma de saber que sprite pedir.
//
// Fijarla solo vale si de verdad es siempre la misma. Eso es lo que comprueba
// esta prueba, numero a numero, contra cada ROM que se le pase. Si alguna vez
// dejara de serlo, aqui se ve; en el comentario del fichero, no.
//
// Uso: npx tsx tools/tests/test-dex.mjs <rom.gba> [mas-roms.gba...]
import { readFileSync } from 'node:fs';
import {
  encontrarTablaDex,
  nacionalDeGen3,
  ESPECIES_GEN3,
  NACIONAL_GEN3,
} from '../../packages/pokemon/src/index.ts';

const roms = process.argv.slice(2);
if (roms.length === 0) {
  console.error('Uso: npx tsx tools/tests/test-dex.mjs <rom.gba> [mas...]');
  process.exit(2);
}

let fallos = 0;
const check = (que, bien, detalle = '') => {
  console.log(`${bien ? 'OK  ' : 'MAL '}  ${que}${detalle ? `  -> ${detalle}` : ''}`);
  if (!bien) fallos += 1;
};

// Las anclas: tres numeros que dicen que esto no es una resta.
check('la tabla tiene una entrada por especie', NACIONAL_GEN3.length === ESPECIES_GEN3,
  `${NACIONAL_GEN3.length}`);
check('Pikachu es el 25 en las dos numeraciones', nacionalDeGen3(25) === 25);
check('el primero de Hoenn, la interna 277, es el nacional 252 (TREECKO)',
  nacionalDeGen3(277) === 252);
// Esta es la que desmonta la resta: 411 - 25 daria 386, que es DEOXYS.
check('y la interna 411 es el 358 (CHIMECHO), no el 386',
  nacionalDeGen3(411) === 358, `${nacionalDeGen3(411)}`);
check('los huecos de relleno no son nadie', nacionalDeGen3(252) === 0 && nacionalDeGen3(270) === 0);

for (const ruta of roms) {
  const rom = new Uint8Array(readFileSync(ruta));
  const codigo = String.fromCharCode(...rom.slice(0xac, 0xb0));
  const tabla = encontrarTablaDex(rom);

  if (!tabla) {
    check(`${codigo}: se encuentra su tabla`, false);
    continue;
  }

  // Numero a numero. Lo que se compara es el valor util -0 para los huecos-,
  // que es lo que usa quien pide un sprite.
  const distintos = [];
  for (let especie = 1; especie < ESPECIES_GEN3; especie += 1) {
    const deLaRom = tabla.nacional(especie);
    const fija = nacionalDeGen3(especie);
    const util = deLaRom > 0 && deLaRom <= 386 ? deLaRom : 0;
    if (util !== fija) distintos.push(`${especie}: ROM ${util} / fija ${fija}`);
  }

  check(`${codigo}: la tabla fija coincide con la de la ROM`, distintos.length === 0,
    distintos.slice(0, 5).join('; ') || `${ESPECIES_GEN3 - 1} especies`);
}

console.log(
  fallos === 0 ? '\nLA TABLA FIJA ES LA DE LOS JUEGOS' : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

// Comprueba la formula de estadisticas contra un Pokemon que creo el juego.
//
// Es la unica forma honesta de validarla: se recalculan las estadisticas de un
// Pokemon de una partida real usando los datos base de su propia ROM, y tienen
// que salir exactamente las que el juego ya habia guardado. Si sale un solo
// numero distinto, la formula esta mal.
//
// Uso: npx tsx tools/tests/test-estadisticas.mjs <estado.bin> <rom.gba>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [, , ESTADO, ROM] = process.argv;
if (!ROM) {
  console.error('Uso: npx tsx tools/tests/test-estadisticas.mjs <estado.bin> <rom.gba>');
  process.exit(2);
}

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
const estado = new Uint8Array(readFileSync(ESTADO));
const rom = new Uint8Array(readFileSync(ROM));
const tabla = pk.encontrarTablaEstadisticas(rom);
const nombres = pk.encontrarTablaNombres(rom);

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const GUARDADAS = [
  ['PS maximos', 0x58],
  ['ataque', 0x5a],
  ['defensa', 0x5c],
  ['velocidad', 0x5e],
  ['ataque especial', 0x60],
  ['defensa especial', 0x62],
];

let fallos = 0;
const equipo = pk.localizarEquipo(estado);
for (const ranura of equipo.ranuras) {
  const base = tabla.estadisticas(ranura.pokemon.especie);
  const rehecho = pk.recalcularEnBloque(ranura.bloque, base);
  const nombre = nombres?.nombre(ranura.pokemon.especie) ?? `#${ranura.pokemon.especie}`;
  console.log(`${nombre} "${pk.leerTexto(ranura.pokemon.moteBruto)}" nivel ${ranura.pokemon.nivel}`);
  for (const [etiqueta, off] of GUARDADAS) {
    const guardada = u16(ranura.bloque, off);
    const calculada = u16(rehecho, off);
    const ok = guardada === calculada;
    if (!ok) fallos += 1;
    console.log(`  ${ok ? 'OK   ' : 'FALLO'} ${etiqueta.padEnd(17)} juego ${String(guardada).padStart(3)}   calculado ${String(calculada).padStart(3)}`);
  }
}

console.log(fallos === 0 ? '\nLA FORMULA COINCIDE CON EL JUEGO' : `\n${fallos} ESTADISTICAS NO COINCIDEN`);
process.exit(fallos === 0 ? 0 : 1);

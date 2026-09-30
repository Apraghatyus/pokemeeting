// Muestra el equipo de una partida, descifrado y con nombres de verdad.
//
// Junta las tres piezas: localizar la memoria dentro del estado, descifrar los
// bloques de 100 bytes y traducir el juego de caracteres. Los nombres de
// especie salen de la ROM, no de una lista nuestra, que es lo que hace que
// funcione con copias aleatorizadas.
//
// Uso: npx tsx tools/memoria/ver-equipo.mjs <estado.bin> <rom.gba>
import { readFileSync } from 'node:fs';

const [, , ESTADO, ROM] = process.argv;
if (!ESTADO || !ROM) {
  console.error('Uso: npx tsx tools/memoria/ver-equipo.mjs <estado.bin> <rom.gba>');
  process.exit(2);
}

const base = new URL('../../packages/pokemon/src/', import.meta.url);
const ss = await import(new URL('savestate.ts', base).href);
const g3 = await import(new URL('gen3.ts', base).href);
const tx = await import(new URL('texto.ts', base).href);
const rm = await import(new URL('rom.ts', base).href);

const estado = new Uint8Array(readFileSync(ESTADO));
const rom = new Uint8Array(readFileSync(ROM));
const cabecera = ss.leerCabecera(estado);

// La tabla de nombres se localiza y se CONFIRMA contra nombres conocidos: un
// desplazamiento de una sola entrada haria decir IVYSAUR donde pone BULBASAUR.
const tabla = rm.encontrarTablaNombres(rom);
const nombreEspecie = (n) => tabla?.nombre(n) ?? `#${n}`;

console.log(`partida de ${cabecera.titulo} (${cabecera.codigoJuego}), ROM ${cabecera.romCrc32}`);
console.log(
  tabla
    ? `tabla de nombres en 0x${tabla.offset.toString(16).toUpperCase()}, confirmada con ${tabla.anclasVerificadas} de 4 nombres conocidos\n`
    : 'no se encontro la tabla de nombres\n',
);

const ewram = ss.region(estado, 'ewram');
const hallazgos = [];
for (let off = 0; off + g3.TAMANO_EN_EQUIPO <= ewram.length; off += 4) {
  const bloque = ewram.subarray(off, off + g3.TAMANO_EN_EQUIPO);
  if (g3.pareceValido(bloque)) hallazgos.push({ direccion: 0x02000000 + off, bloque });
}

for (const { direccion, bloque } of hallazgos) {
  const p = g3.leerPokemon(bloque);
  const mote = tx.leerTexto(p.moteBruto);
  const entrenador = tx.leerTexto(p.nombreEntrenadorBruto);
  console.log(`0x${direccion.toString(16).toUpperCase()}`);
  console.log(`  especie      : ${nombreEspecie(p.especie)} (numero interno ${p.especie})`);
  console.log(`  mote         : "${mote}"`);
  console.log(`  entrenador   : "${entrenador}"  (ID ${p.idEntrenador & 0xffff})`);
  console.log(`  nivel        : ${p.nivel}`);
  console.log(`  experiencia  : ${p.experiencia}`);
  console.log(`  movimientos  : ${p.movimientos.filter(Boolean).join(', ')}`);
  console.log(`  personalidad : 0x${p.personalidad.toString(16).toUpperCase()}  (orden de subestructuras ${p.personalidad % 24})`);
  console.log(`  checksum     : ${p.valido ? 'correcto' : 'INCORRECTO'}`);
  console.log();
}

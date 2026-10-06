// Encuentra en memoria dónde guarda el juego las medallas.
//
// Las medallas son banderas: bits sueltos. No tienen forma que buscar, así que
// no se pueden localizar como el equipo, que se encuentra por su checksum. Y en
// Rojo Fuego y Verde Hoja tampoco sirve una dirección fija, porque esos juegos
// mueven sus bloques de guardado de sitio.
//
// Lo que sí se puede es compararlas. Dos estados de la misma partida, uno antes
// y otro después de ganar un gimnasio, y mirar qué bit se encendió. Esa es la
// pregunta que contesta esto.
//
// CÓMO SACAR LOS DOS ESTADOS
//
//   1. Justo antes de entrar al combate del líder, menú ⋮ → Exportar estado.
//   2. Gana la medalla.
//   3. Exporta otro estado.
//
// Uso:
//   node tools/buscar-medallas.mjs <antes.bin> <despues.bin> [mas.bin...]
//
// Con más de dos va mejor: cada medalla nueva descarta candidatos. Los ficheros
// se dan en el orden en que se jugaron.

import { readFileSync } from 'node:fs';

const EWRAM_EN_ESTADO = 0x21000;
const EWRAM_TAMANO = 0x40000;
const EWRAM_BASE = 0x02000000;

const ficheros = process.argv.slice(2);
if (ficheros.length < 2) {
  console.error('Hacen falta al menos dos estados: uno antes y otro después de una medalla.');
  console.error('Uso: node tools/buscar-medallas.mjs <antes.bin> <despues.bin> [mas.bin...]');
  process.exit(2);
}

const estados = ficheros.map((f) => {
  const datos = new Uint8Array(readFileSync(f));
  return { nombre: f.split(/[\\/]/).pop(), ewram: datos.subarray(EWRAM_EN_ESTADO, EWRAM_EN_ESTADO + EWRAM_TAMANO) };
});

console.log(`${estados.length} estados, en este orden:`);
for (const e of estados) console.log(`  ${e.nombre}`);

/**
 * Las medallas se ganan en orden, así que el byte que las guarda solo puede
 * valer 0, 1, 3, 7, 15... Eso descarta casi todo por sí solo.
 */
const esPrefijo = (b) => (b & (b + 1)) === 0;
const cuantas = (b) => b.toString(2).split('1').length - 1;

const candidatos = [];

for (let off = 0; off < EWRAM_TAMANO; off += 1) {
  const serie = estados.map((e) => e.ewram[off]);

  // Todos tienen que ser un prefijo de bits.
  if (!serie.every(esPrefijo)) continue;

  // Y tiene que CRECER: una medalla no se pierde.
  let crece = false;
  let valido = true;
  for (let i = 1; i < serie.length; i += 1) {
    if (serie[i] < serie[i - 1]) { valido = false; break; }
    if (serie[i] > serie[i - 1]) crece = true;
  }
  if (!valido || !crece) continue;

  // Un byte que empieza y acaba igual no dice nada, y cero no es una medalla.
  if (serie[serie.length - 1] === 0) continue;

  candidatos.push({ direccion: EWRAM_BASE + off, serie });
}

console.log(`\n${candidatos.length} sitios cuadran con "las medallas se ganan en orden y no se pierden".`);

if (candidatos.length === 0) {
  console.log('\nNinguno. Dos explicaciones posibles, y conviene distinguirlas:');
  console.log('  - Entre los dos estados no se gano ninguna medalla.');
  console.log('  - Las medallas de este juego no se guardan en un solo byte.');
  process.exit(1);
}

for (const c of candidatos.slice(0, 40)) {
  const serie = c.serie
    .map((b) => `${b.toString(2).padStart(8, '0')} (${cuantas(b)})`)
    .join('  ->  ');
  console.log(`  0x${c.direccion.toString(16)}:  ${serie}`);
}
if (candidatos.length > 40) console.log(`  ... y ${candidatos.length - 40} mas`);

console.log('\nEl bueno es el que pase de N medallas a N+1 justo cuando la ganaste.');
console.log('Si quedan varios, pasa un tercer estado con otra medalla mas y se cae solo.');

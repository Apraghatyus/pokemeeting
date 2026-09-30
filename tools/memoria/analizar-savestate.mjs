// Mira dentro de un savestate real: cabecera y Pokemon que haya en memoria.
//
// Es la herramienta con la que se valida todo lo demas contra la realidad. Con
// una partida sin Pokemon no deberia encontrar nada, y eso ya dice algo: si el
// filtro diera positivos ahi, seria demasiado laxo para confiar en el.
//
// Uso: npx tsx tools/memoria/analizar-savestate.mjs <estado.bin>
import { readFileSync } from 'node:fs';

const RUTA = process.argv[2];
if (!RUTA) {
  console.error('Uso: npx tsx tools/memoria/analizar-savestate.mjs <estado.bin>');
  process.exit(2);
}

const ss = await import(new URL('../../packages/pokemon/src/savestate.ts', import.meta.url).href);
const g3 = await import(new URL('../../packages/pokemon/src/gen3.ts', import.meta.url).href);

const estado = new Uint8Array(readFileSync(RUTA));
const cabecera = ss.leerCabecera(estado);

console.log('=== cabecera ===');
console.log(`  juego   : ${cabecera.titulo} (${cabecera.codigoJuego})`);
console.log(`  ROM      : crc32 ${cabecera.romCrc32}`);
console.log(`  ciclos   : ${cabecera.ciclos.toLocaleString('es')}  (~${(cabecera.ciclos/16777216).toFixed(0)} s de juego)`);

const ewram = ss.region(estado, 'ewram');
console.log(`\n=== memoria principal: ${(ewram.length/1024).toFixed(0)} KB ===`);
console.log(`  ${((ewram.length - ewram.filter((b) => b === 0).length) * 100 / ewram.length).toFixed(0)}% de bytes no nulos`);

console.log('\n=== buscando Pokemon ===');
const inicio = Date.now();
const encontrados = [];
for (let off = 0; off + g3.TAMANO_EN_EQUIPO <= ewram.length; off += 4) {
  const bloque = ewram.subarray(off, off + g3.TAMANO_EN_EQUIPO);
  if (!g3.pareceValido(bloque)) continue;
  encontrados.push({ off, datos: g3.leerPokemon(bloque) });
}
const ms = Date.now() - inicio;
console.log(`  recorridos ${(ewram.length/1024).toFixed(0)} KB en ${ms} ms`);
console.log(`  candidatos: ${encontrados.length}`);

for (const { off, datos } of encontrados.slice(0, 12)) {
  const direccion = 0x02000000 + off;
  console.log(
    `    0x${direccion.toString(16).toUpperCase()}  especie ${String(datos.especie).padStart(3)}` +
    `  nivel ${String(datos.nivel).padStart(3)}  mov ${datos.movimientos.join('/')}`,
  );
}
if (encontrados.length > 12) console.log(`    ... y ${encontrados.length - 12} mas`);

// Seis seguidos separados 100 bytes son el equipo.
const porDireccion = new Set(encontrados.map((e) => e.off));
const equipos = encontrados.filter(({ off }) =>
  [1, 2].every((n) => porDireccion.has(off + n * g3.TAMANO_EN_EQUIPO)),
);
if (equipos.length) {
  console.log('\n=== posible equipo (tres o mas seguidos, separados 100 bytes) ===');
  for (const { off } of equipos) {
    console.log(`    empieza en 0x${(0x02000000 + off).toString(16).toUpperCase()}`);
  }
}

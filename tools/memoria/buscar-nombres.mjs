// Localiza dentro de una ROM la tabla de nombres de especie.
//
// Es lo que permite decirle al jugador "das PIKACHU y el recibe GOLEM" cuando
// las dos copias estan aleatorizadas por separado. No se usa una direccion
// fija a proposito: cambia entre versiones e idiomas, y un hack puede moverla.
// Se busca por su forma: cientos de nombres seguidos de 11 bytes cada uno.
//
// Uso: npx tsx tools/memoria/buscar-nombres.mjs <rom.gba>
import { readFileSync } from 'node:fs';

const RUTA = process.argv[2];
if (!RUTA) {
  console.error('Uso: npx tsx tools/memoria/buscar-nombres.mjs <rom.gba>');
  process.exit(2);
}

const t = await import(new URL('../../packages/pokemon/src/texto.ts', import.meta.url).href);
const rom = new Uint8Array(readFileSync(RUTA));

/** Cada nombre de especie ocupa 11 bytes, rellenos con el terminador. */
const ANCHO = 11;
/** Gen 3 tiene 412 huecos de especie, incluyendo los vacios. */
const ESPECIES = 412;

const entradaValida = (off) => {
  const trozo = rom.subarray(off, off + ANCHO);
  if (!t.pareceNombre(trozo)) return false;
  // Un nombre de verdad termina antes del final del hueco.
  const fin = trozo.indexOf(t.FIN);
  return fin > 0 && fin <= ANCHO;
};

console.log(`ROM de ${(rom.length / 1024 / 1024).toFixed(0)} MB; buscando ${ESPECIES} nombres seguidos de ${ANCHO} bytes...`);

const candidatos = [];
for (let off = 0; off + ANCHO * 60 < rom.length; off += 4) {
  // Basta con mirar las primeras 60 entradas para descartar casi todo.
  let seguidas = 0;
  while (seguidas < 60 && entradaValida(off + seguidas * ANCHO)) seguidas += 1;
  if (seguidas >= 60) {
    // Y luego se mide cuanto aguanta de verdad.
    let total = 0;
    while (total < ESPECIES + 20 && entradaValida(off + total * ANCHO)) total += 1;
    candidatos.push({ off, total });
    off += total * ANCHO;
  }
}

console.log(`\ncandidatos: ${candidatos.length}`);
for (const { off, total } of candidatos.slice(0, 5)) {
  const nombres = [];
  for (let i = 0; i < 10; i += 1) {
    nombres.push(t.leerTexto(rom.subarray(off + i * ANCHO, off + (i + 1) * ANCHO)));
  }
  console.log(`\n  0x${off.toString(16).toUpperCase()}  (${total} entradas seguidas)`);
  console.log(`    ${nombres.map((n, i) => `${i}:${n}`).join('  ')}`);
}

// La tabla buena empieza con un hueco vacio y luego el numero 1 de la Pokedex.
const buena = candidatos.find((c) => c.total >= ESPECIES - 12);
if (buena) {
  console.log(`\n=== tabla elegida: 0x${buena.off.toString(16).toUpperCase()} ===`);
  const nombre = (n) => t.leerTexto(rom.subarray(buena.off + n * ANCHO, buena.off + (n + 1) * ANCHO));
  for (const n of [1, 4, 7, 25, 150, 251, 386]) {
    console.log(`  especie ${String(n).padStart(3)}: ${nombre(n)}`);
  }
} else {
  console.log('\nninguna tabla alcanza el numero de especies esperado');
}

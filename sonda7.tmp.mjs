import { readFileSync } from 'node:fs';
import { leerTexto } from './packages/pokemon/src/index.ts';

const ENTRADA = 44, NOMBRE = 14, BOLSILLO = 0x1a;

// La tabla de objetos por su forma: la entrada N lleva N dentro, en el byte 14.
const buscar = (rom) => {
  for (let base = 0; base + ENTRADA * 40 < rom.length; base += 4) {
    let i = 0;
    while (i < 40 && rom.readUInt16LE(base + i * ENTRADA + NOMBRE) === i) i += 1;
    if (i >= 40) return base;
  }
  return -1;
};

for (const ruta of process.argv.slice(2)) {
  const rom = readFileSync(ruta);
  const base = buscar(rom);
  const codigo = rom.subarray(0xac, 0xb0).toString('ascii');
  if (base < 0) { console.log(codigo, 'NO ENCONTRADA'); continue; }
  const nom = (id) => leerTexto(new Uint8Array(rom.subarray(base + id * ENTRADA, base + id * ENTRADA + NOMBRE)));
  const bol = (id) => rom.readUInt8(base + id * ENTRADA + BOLSILLO);
  console.log(
    `${codigo} 0x${base.toString(16)}`,
    `| 4=${nom(4)}(b${bol(4)})`,
    `13=${nom(13)}(b${bol(13)})`,
    `24=${nom(24)}(b${bol(24)})`,
    `293=${nom(293)}(b${bol(293)})`,
  );
}

// Que escribimos de verdad en las tiendas, y si esos objetos existen.
//
// La tabla de objetos de tercera generacion son entradas de 44 bytes: 14 de
// nombre y, en el byte 14, un u16 con SU PROPIO numero. Eso ultimo es el ancla:
// la entrada N lleva N dentro, y eso no pasa por casualidad en ningun otro
// sitio de la ROM.
import { readFileSync } from 'node:fs';
import { leerTexto } from './packages/pokemon/src/index.ts';

const ruta = process.argv[2];
const rom = readFileSync(ruta);

const ENTRADA = 44;
const NOMBRE = 14;

const buscarTablaObjetos = () => {
  for (let base = 0; base + ENTRADA * 40 < rom.length; base += 4) {
    let cuadran = 0;
    for (let i = 0; i < 40; i += 1) {
      if (rom.readUInt16LE(base + i * ENTRADA + NOMBRE) !== i) break;
      cuadran += 1;
    }
    if (cuadran >= 40) return base;
  }
  return -1;
};

const base = buscarTablaObjetos();
console.log('tabla de objetos en', base >= 0 ? '0x' + base.toString(16) : 'NO ENCONTRADA');
if (base < 0) process.exit(1);

// Cuantas entradas hay: mientras el numero de dentro siga cuadrando.
let cuantos = 0;
while (
  base + (cuantos + 1) * ENTRADA <= rom.length &&
  rom.readUInt16LE(base + cuantos * ENTRADA + NOMBRE) === cuantos
) {
  cuantos += 1;
}
console.log('objetos:', cuantos);

const nombreDe = (id) =>
  leerTexto(new Uint8Array(rom.subarray(base + id * ENTRADA, base + id * ENTRADA + NOMBRE)));

/** Un objeto existe de verdad si tiene nombre y no es el relleno. */
const existe = (id) => {
  if (id <= 0 || id >= cuantos) return false;
  const n = nombreDe(id);
  return n.length > 0 && !/^\?+$/.test(n) && !n.startsWith('·');
};

console.log('ejemplos:', [1, 2, 4, 13, 24, 25].map((i) => `${i}=${nombreDe(i)}`).join(' '));

const huecos = [];
for (let i = 1; i < cuantos; i += 1) if (!existe(i)) huecos.push(i);
console.log(`huecos (objetos que NO existen): ${huecos.length}`);
console.log('primeros:', huecos.slice(0, 40).join(', '));

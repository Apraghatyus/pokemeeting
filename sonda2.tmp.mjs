import { readFileSync } from 'node:fs';
import { leerTexto } from './packages/pokemon/src/index.ts';

const rom = readFileSync(process.argv[2]);
const BASE = 0x3d4f50;
const ENTRADA = 44;
const NOMBRE = 14;

const nombreDe = (id) =>
  leerTexto(new Uint8Array(rom.subarray(BASE + id * ENTRADA, BASE + id * ENTRADA + NOMBRE)));
const indiceDe = (id) => rom.readUInt16LE(BASE + id * ENTRADA + NOMBRE);

const huecos = [];
const reales = [];
for (let i = 1; i <= 377; i += 1) {
  const n = nombreDe(i);
  const ok = indiceDe(i) === i && n.length > 0 && !/^[?·]+$/.test(n);
  (ok ? reales : huecos).push(i);
}
console.log('objetos reales:', reales.length, '| huecos:', huecos.length);
console.log('huecos:', huecos.join(','));
console.log('muestra de huecos:', huecos.slice(0, 6).map((i) => `${i}="${nombreDe(i)}" idx=${indiceDe(i)}`).join(' | '));

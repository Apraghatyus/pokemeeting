import { readFileSync } from 'node:fs';
import { leerTexto } from './packages/pokemon/src/index.ts';

const rom = readFileSync(process.argv[2]);
const BASE = 0x3d4f50, ENTRADA = 44, NOMBRE = 14;
const nombreDe = (id) =>
  leerTexto(new Uint8Array(rom.subarray(BASE + id * ENTRADA, BASE + id * ENTRADA + NOMBRE)));
// En la entrada de objeto, el byte 0x1A dice a que bolsillo va.
const bolsilloDe = (id) => rom.readUInt8(BASE + id * ENTRADA + 0x1a);

const OFFSETS = [0x164A4C, 0x167778, 0x167790, 0x1677AC, 0x1677CC, 0x16A330, 0x16A7A0, 0x16AD70,
  0x16B428, 0x16B724, 0x16BBD0, 0x16BC0C, 0x16BCC8, 0x16BD1C, 0x16BD54, 0x16D5B0, 0x16EAE0,
  0x16EB8C, 0x16F074, 0x170BF4, 0x171950, 0x171D70, 0x171F28];
const MAIN = [12, 13, 14];
const REVIVIR = [24, 25];

const pool = new Set();
for (const [i, off] of OFFSETS.entries()) {
  if (MAIN.includes(i)) continue;
  for (let k = 0; k < 24; k += 1) {
    const id = rom.readUInt16LE(off + k * 2);
    if (id === 0) break;
    if (!REVIVIR.includes(id)) pool.add(id);
  }
}
const lista = [...pool].sort((a, b) => a - b);
console.log('objetos en el reparto:', lista.length);
const porBolsillo = new Map();
for (const id of lista) {
  const b = bolsilloDe(id);
  if (!porBolsillo.has(b)) porBolsillo.set(b, []);
  porBolsillo.get(b).push(`${id}:${nombreDe(id)}`);
}
for (const [b, ids] of [...porBolsillo].sort((a, c) => a[0] - c[0])) {
  console.log(`  bolsillo ${b} (${ids.length}):`, ids.join(' | ').slice(0, 150));
}

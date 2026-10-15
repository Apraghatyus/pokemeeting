import { readFileSync } from 'node:fs';
import { leerTexto } from './packages/pokemon/src/index.ts';

const rom = readFileSync(process.argv[2]);
const BASE = 0x3d4f50, ENTRADA = 44, NOMBRE = 14;
const nombreDe = (id) =>
  id > 0 && id <= 377
    ? leerTexto(new Uint8Array(rom.subarray(BASE + id * ENTRADA, BASE + id * ENTRADA + NOMBRE)))
    : '??';
const real = (id) =>
  id > 0 && id <= 377 && rom.readUInt16LE(BASE + id * ENTRADA + NOMBRE) === id &&
  !/^[?·]+$/.test(nombreDe(id));

const OFFSETS = [0x164A4C, 0x167778, 0x167790, 0x1677AC, 0x1677CC, 0x16A330, 0x16A7A0, 0x16AD70,
  0x16B428, 0x16B724, 0x16BBD0, 0x16BC0C, 0x16BCC8, 0x16BD1C, 0x16BD54, 0x16D5B0, 0x16EAE0,
  0x16EB8C, 0x16F074, 0x170BF4, 0x171950, 0x171D70, 0x171F28];
const MAIN = [12, 13, 14];

for (const [i, off] of OFFSETS.entries()) {
  const ids = [];
  for (let k = 0; k < 24; k += 1) {
    const id = rom.readUInt16LE(off + k * 2);
    if (id === 0) break;
    ids.push(id);
  }
  const malos = ids.filter((id) => !real(id));
  const etiqueta = MAIN.includes(i) ? 'RANDOMIZER' : 'nuestra   ';
  console.log(
    `${String(i).padStart(2)} ${etiqueta} 0x${off.toString(16)} (${String(ids.length).padStart(2)})`,
    malos.length ? `<<< ${malos.length} RAROS: ${malos.join(',')}` : ids.map(nombreDe).join(', ').slice(0, 86),
  );
}

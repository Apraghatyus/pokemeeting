import { readFileSync } from 'node:fs';
import { leerTexto } from './packages/pokemon/src/index.ts';
import { aleatorizarTiendas } from './apps/randomizer/src/tiendas.ts';

const ROM = process.argv[2];
const jar = readFileSync('tools/randomizer/PokeRandoZX.jar');
const original = readFileSync(ROM);

const BASE = 0x3d4f50, ENTRADA = 44, NOMBRE = 14;
const nombreDe = (rom, id) =>
  leerTexto(new Uint8Array(rom.subarray(BASE + id * ENTRADA, BASE + id * ENTRADA + NOMBRE)));
const esReal = (rom, id) => {
  if (id <= 0 || id > 377) return false;
  const n = nombreDe(rom, id);
  return rom.readUInt16LE(BASE + id * ENTRADA + NOMBRE) === id && !/^[?·]+$/.test(n) && n.length > 0;
};

// Las tiendas, leidas igual que lo hace el modulo.
const leerTiendas = (rom) => {
  const { tiendasDeLaRom } = globalThis.__t ?? {};
  return null;
};

for (const semilla of ['uno', 'dos', 'tres', '12345', 'abcdef']) {
  const copia = Buffer.from(original);
  const r = aleatorizarTiendas(jar, copia, semilla, true);
  if (!r) { console.log(semilla, '-> sin mapa'); continue; }

  // Se comparan los 16 MB: donde cambio, mirar si lo escrito es un objeto real.
  const malos = new Map();
  for (let i = 0; i + 2 <= copia.length; i += 2) {
    if (copia[i] === original[i] && copia[i + 1] === original[i + 1]) continue;
    const id = copia.readUInt16LE(i);
    if (!esReal(copia, id)) malos.set(i, id);
  }
  const lista = [...malos.values()];
  console.log(
    `${semilla}: ${r.tiendas} tiendas, ${r.plazas} plazas ->`,
    lista.length === 0 ? 'todo real' : `${lista.length} INVALIDOS: ${[...new Set(lista)].slice(0,10).join(',')}`,
  );
}

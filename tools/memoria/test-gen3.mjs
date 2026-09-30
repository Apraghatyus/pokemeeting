// Prueba del descifrado de Pokemon de tercera generacion.
//
// Se fabrica un Pokemon valido byte a byte, se comprueba que se lee igual, y
// luego se esconde dentro de memoria de relleno para ver si el buscador lo
// encuentra sin ayuda. Esa es la operacion real: localizar el equipo dentro de
// 256 KB sin saber su direccion.
//
// Uso: npx tsx tools/memoria/test-gen3.mjs
const g3 = await import(new URL('../../packages/pokemon/src/gen3.ts', import.meta.url).href);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const u32 = (b, i, v) => { b[i] = v & 0xff; b[i+1] = (v>>>8)&0xff; b[i+2] = (v>>>16)&0xff; b[i+3] = (v>>>24)&0xff; };
const u16 = (b, i, v) => { b[i] = v & 0xff; b[i+1] = (v>>>8)&0xff; };

/** Construye un Pokemon valido: cifra los datos y pone bien el checksum. */
const fabricar = ({ personalidad, idEntrenador, especie, objeto, experiencia, movimientos, nivel }) => {
  const bloque = new Uint8Array(100);
  u32(bloque, 0x00, personalidad);
  u32(bloque, 0x04, idEntrenador);

  // Datos en claro, colocados segun el orden que impone la personalidad.
  const claro = new Uint8Array(48);
  const g = g3.posicionDe(personalidad, 'G');
  const a = g3.posicionDe(personalidad, 'A');
  u16(claro, g, especie);
  u16(claro, g + 2, objeto);
  u32(claro, g + 4, experiencia);
  movimientos.forEach((m, i) => u16(claro, a + i*2, m));

  // Checksum sobre los datos EN CLARO, antes de cifrar.
  let suma = 0;
  for (let i = 0; i < 48; i += 2) suma = (suma + (claro[i] | (claro[i+1] << 8))) & 0xffff;
  u16(bloque, 0x1c, suma);

  // Cifrado: XOR palabra a palabra con personalidad ^ idEntrenador.
  const clave = (personalidad ^ idEntrenador) >>> 0;
  for (let i = 0; i < 48; i += 4) {
    const palabra = ((claro[i] | (claro[i+1]<<8) | (claro[i+2]<<16) | (claro[i+3]<<24)) ^ clave) >>> 0;
    u32(bloque, 0x20 + i, palabra);
  }

  bloque[0x50 + 4] = nivel;
  return bloque;
};

const ejemplo = {
  personalidad: 0x3A7F1C05,
  idEntrenador: 0x12345678,
  especie: 25,
  objeto: 13,
  experiencia: 12500,
  movimientos: [84, 45, 39, 86],
  nivel: 27,
};
const bloque = fabricar(ejemplo);

// --- se lee lo mismo que se escribio ---
const leido = g3.leerPokemon(bloque);
check('el checksum cuadra', leido.valido);
check('la especie se recupera', leido.especie === ejemplo.especie, `${leido.especie}`);
check('el objeto se recupera', leido.objeto === ejemplo.objeto, `${leido.objeto}`);
check('la experiencia se recupera', leido.experiencia === ejemplo.experiencia, `${leido.experiencia}`);
check('los movimientos se recuperan', leido.movimientos.join(',') === ejemplo.movimientos.join(','),
  leido.movimientos.join(','));
check('el nivel se recupera', leido.nivel === ejemplo.nivel, `${leido.nivel}`);
check('se reconoce como Pokemon de verdad', g3.pareceValido(bloque));

// --- el orden de subestructuras depende de la personalidad ---
const ordenes = new Set();
for (let p = 0; p < 24; p += 1) ordenes.add(g3.posicionDe(p, 'G'));
check('la personalidad reparte las subestructuras en las 4 posiciones', ordenes.size === 4,
  `${ordenes.size} posiciones distintas`);

// Mismo Pokemon con otra personalidad: los datos caen en otro sitio.
const otro = fabricar({ ...ejemplo, personalidad: ejemplo.personalidad + 1 });
check('con otra personalidad el bloque cifrado cambia',
  Buffer.compare(Buffer.from(bloque), Buffer.from(otro)) !== 0);
check('pero se sigue leyendo la misma especie', g3.leerPokemon(otro).especie === ejemplo.especie);

// --- tocar un byte tiene que romper el checksum ---
const roto = bloque.slice();
roto[0x25] ^= 0xff;
check('alterar un byte invalida el bloque', !g3.leerPokemon(roto).valido);

// --- recalcular el checksum lo vuelve a dar por bueno ---
check('recalcular el checksum lo repara', g3.leerPokemon(g3.recalcularChecksum(roto)).valido);

// --- buscarlo dentro de memoria de relleno ---
//
// Es la operacion real: el equipo esta en algun sitio de 256 KB y hay que dar
// con el sin saber la direccion.
const memoria = new Uint8Array(256 * 1024);
let semilla = 99;
for (let i = 0; i < memoria.length; i += 1) {
  semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
  // Mezcla de ruido y ceros, como es la memoria de verdad.
  memoria[i] = semilla % 7 === 0 ? (semilla >>> 16) & 0xff : 0;
}
const escondido = 0x24284;
memoria.set(bloque, escondido);

const encontrados = [];
for (let off = 0; off + 100 <= memoria.length; off += 4) {
  if (g3.pareceValido(memoria.subarray(off, off + 100))) encontrados.push(off);
}
check('encuentra el Pokemon escondido en 256 KB', encontrados.includes(escondido),
  encontrados.length ? encontrados.map((o) => '0x' + o.toString(16)).join(', ') : 'ninguno');
check('y no encuentra falsos positivos', encontrados.length === 1,
  `${encontrados.length} candidatos`);

console.log(fallos === 0 ? '\nDESCIFRADO CORRECTO' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

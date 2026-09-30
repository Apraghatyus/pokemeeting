// Mete un Pokemon en el equipo de una partida, editando su estado.
//
// Es la mitad de un intercambio que no se puede simular: escribir en la
// partida de alguien. Si esto funciona, el intercambio entero funciona,
// porque la otra mitad (mandar cien bytes por la red) ya esta resuelta.
//
// Uso: npx tsx tools/memoria/inyectar.mjs <estado.bin> <rom.gba> <salida.bin>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , ESTADO, ROM, SALIDA] = process.argv;
if (!ESTADO || !ROM || !SALIDA) {
  console.error('Uso: npx tsx tools/memoria/inyectar.mjs <estado.bin> <rom.gba> <salida.bin>');
  process.exit(2);
}

const base = new URL('../../packages/pokemon/src/', import.meta.url);
const ss = await import(new URL('savestate.ts', base).href);
const g3 = await import(new URL('gen3.ts', base).href);
const tx = await import(new URL('texto.ts', base).href);
const rm = await import(new URL('rom.ts', base).href);
const eq = await import(new URL('equipo.ts', base).href);

const estado = new Uint8Array(readFileSync(ESTADO));
const rom = new Uint8Array(readFileSync(ROM));
const tabla = rm.encontrarTablaNombres(rom);
const nombre = (n) => tabla?.nombre(n) ?? `#${n}`;

const equipo = eq.localizarEquipo(estado);
if (!equipo) {
  console.error('No se encontro ningun equipo en esa partida.');
  process.exit(1);
}
console.log(`equipo en 0x${equipo.direccion.toString(16).toUpperCase()}, ${equipo.ranuras.length} Pokemon:`);
for (const r of equipo.ranuras) {
  console.log(`  ${r.indice}: ${nombre(r.pokemon.especie)} "${tx.leerTexto(r.pokemon.moteBruto)}" nivel ${r.pokemon.nivel}`);
}

// --- se fabrica el Pokemon que "llega del companero" ---
const u16 = (b, i, v) => { b[i] = v & 0xff; b[i+1] = (v>>>8)&0xff; };
const u32 = (b, i, v) => { b[i] = v&0xff; b[i+1] = (v>>>8)&0xff; b[i+2] = (v>>>16)&0xff; b[i+3] = (v>>>24)&0xff; };
const escribirNombre = (b, off, texto, largo) => {
  for (let i = 0; i < largo; i += 1) b[off + i] = tx.FIN;
  [...texto].forEach((c, i) => {
    const codigo = c === ' ' ? 0x00
      : c >= 'A' && c <= 'Z' ? 0xBB + c.charCodeAt(0) - 65
      : c >= 'a' && c <= 'z' ? 0xD5 + c.charCodeAt(0) - 97
      : c >= '0' && c <= '9' ? 0xA1 + c.charCodeAt(0) - 48
      : 0x00;
    if (i < largo) b[off + i] = codigo;
  });
};

const fabricar = ({ personalidad, idEntrenador, especie, nivel, movimientos, mote, entrenador, experiencia }) => {
  const b = new Uint8Array(100);
  u32(b, 0x00, personalidad);
  u32(b, 0x04, idEntrenador);
  escribirNombre(b, 0x08, mote, 10);
  b[0x12] = 7;            // idioma: espanol
  b[0x13] = 0x02;         // marcado como obtenido, no como huevo
  escribirNombre(b, 0x14, entrenador, 7);

  const claro = new Uint8Array(48);
  const g = g3.posicionDe(personalidad, 'G');
  const a = g3.posicionDe(personalidad, 'A');
  const e = g3.posicionDe(personalidad, 'E');
  const m = g3.posicionDe(personalidad, 'M');
  u16(claro, g, especie);
  u32(claro, g + 4, experiencia);
  claro[g + 8] = 0;                     // felicidad
  movimientos.forEach((mv, i) => u16(claro, a + i*2, mv));
  [0,1,2,3].forEach((i) => { claro[a + 8 + i] = 20; });   // PP de cada movimiento
  for (let i = 0; i < 6; i += 1) claro[e + i] = 0;        // esfuerzo a cero
  // Cuidado con esta palabra: los bits 0-29 son los seis IV (cinco bits cada
  // uno) y el bit 30 es la bandera de HUEVO. Poner 0x7FFFFFFF lo enciende, y
  // el Pokemon aparece en el equipo sin nivel ni PS porque el juego lo trata
  // como un huevo. Con 0x3FFFFFFF quedan los IV al maximo y la bandera a cero.
  u32(claro, m + 4, 0x3FFFFFFF);

  let suma = 0;
  for (let i = 0; i < 48; i += 2) suma = (suma + (claro[i] | (claro[i+1] << 8))) & 0xffff;
  u16(b, 0x1c, suma);

  const clave = (personalidad ^ idEntrenador) >>> 0;
  for (let i = 0; i < 48; i += 4) {
    u32(b, 0x20 + i, ((claro[i] | (claro[i+1]<<8) | (claro[i+2]<<16) | (claro[i+3]<<24)) ^ clave) >>> 0);
  }

  b[0x50] = 0;            // estado alterado: ninguno
  b[0x54] = nivel;
  u16(b, 0x56, 60);       // HP actual
  u16(b, 0x58, 60);       // HP maximo
  u16(b, 0x5a, 40);       // ataque
  u16(b, 0x5c, 40);       // defensa
  u16(b, 0x5e, 45);       // velocidad
  u16(b, 0x60, 40);       // ataque especial
  u16(b, 0x62, 40);       // defensa especial
  return b;
};

const regalo = fabricar({
  personalidad: 0x5EA57A11,
  idEntrenador: equipo.ranuras[0].pokemon.idEntrenador,  // mismo entrenador: no sale como intercambiado
  especie: 25,
  nivel: 22,
  movimientos: [84, 45, 98, 86],
  mote: 'REGALO',
  entrenador: 'AAA',
  experiencia: 8000,
});

console.log(`\nse va a inyectar: ${nombre(25)} "REGALO" nivel 22`);

// --- validacion antes de tocar nada ---
const veredicto = eq.validarRecibido(regalo, { maxEspecie: 411, maxMovimiento: 354, maxObjeto: 377 });
console.log(`validacion: ${veredicto.ok ? 'pasa' : 'RECHAZADO -> ' + veredicto.motivo}`);
if (!veredicto.ok) process.exit(1);

// --- escritura ---
const conPokemon = eq.escribirEnRanura(estado, equipo.direccion, equipo.ranuras.length, regalo);
// Aqui el equipo SI crece, asi que el contador hace falta de verdad, y se
// confirma antes de tocarlo: si el byte no coincide con los Pokemon que hay,
// no es el contador y no se escribe nada.
const contador = eq.localizarContador(estado, ss.leerCabecera(estado).codigoJuego, equipo);
if (contador === null) {
  console.error('No he podido confirmar donde guarda este juego cuantos Pokemon lleva.');
  process.exit(1);
}
const finalBytes = eq.escribirContador(conPokemon, contador, equipo.ranuras.length + 1);

writeFileSync(SALIDA, Buffer.from(finalBytes));
console.log(`\nestado modificado escrito en ${SALIDA.split(/[\/]/).pop()}`);

// --- se relee para confirmar ---
const comprobar = eq.localizarEquipo(new Uint8Array(readFileSync(SALIDA)));
console.log(`\nequipo tras la inyeccion: ${comprobar.ranuras.length} Pokemon`);
for (const r of comprobar.ranuras) {
  console.log(`  ${r.indice}: ${nombre(r.pokemon.especie)} "${tx.leerTexto(r.pokemon.moteBruto)}" nivel ${r.pokemon.nivel}  checksum ${r.pokemon.valido ? 'ok' : 'MAL'}`);
}

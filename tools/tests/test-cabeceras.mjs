// Comprueba que reconocemos de que consola es una ROM leyendo su cabecera.
//
// Game Boy y Game Boy Advance la guardan en sitios distintos, asi que el
// lector tiene que deducirlo del contenido y no del nombre del fichero: un
// `.gb` puede traer un juego de Game Boy Color, y cualquiera puede renombrar
// lo que quiera.
//
// Las cabeceras de Game Boy se fabrican aqui, byte a byte, en vez de usar una
// ROM de verdad. Asi la prueba corre sin que nadie tenga que tener un juego, y
// de paso no hace falta copiar el logotipo de Nintendo, que es un dato de otra
// gente: la suma de comprobacion de la cabecera es mejor senal y son tres
// lineas de cuenta.
//
// Uso: npx tsx tools/tests/test-cabeceras.mjs [rom.gba]
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { readRomHeader } = await import(
  pathToFileURL(`${process.cwd()}/apps/web/src/core/romHeader.ts`).href
);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

/**
 * Fabrica una ROM de Game Boy con la cabecera que se le pida.
 *
 * La consola no arrancaba un cartucho cuya suma no cuadrara, asi que toda ROM
 * real la cumple y sirve para reconocerlas.
 */
const romGameBoy = ({ titulo, codigo = null, color = false, licenciaNueva = null }) => {
  const rom = new Uint8Array(0x8000);

  const escribir = (offset, texto) => {
    for (let i = 0; i < texto.length; i += 1) rom[offset + i] = texto.charCodeAt(i);
  };

  // Con codigo de juego el titulo se queda en once letras; sin el, dieciseis.
  escribir(0x134, titulo.slice(0, codigo ? 11 : 16));
  if (codigo) escribir(0x13f, codigo);
  if (color) rom[0x143] = 0x80;
  if (licenciaNueva) {
    rom[0x14b] = 0x33; // anuncia que la licencia buena es la de dos letras
    escribir(0x144, licenciaNueva);
  }

  let suma = 0;
  for (let i = 0x134; i <= 0x14c; i += 1) suma = (suma - rom[i] - 1) & 0xff;
  rom[0x14d] = suma;
  return rom;
};

// --- Game Boy Color ---
const oro = readRomHeader(romGameBoy({ titulo: 'POKEMON_GLD', codigo: 'AAUS', color: true, licenciaNueva: '01' }));
check('una ROM de Game Boy Color se reconoce como tal', oro.platform === 'gbc', oro.platform ?? 'nada');
check('se lee su codigo de juego', oro.gameCode === 'AAUS', oro.gameCode);
check('y su titulo, sin comerse el codigo', oro.title === 'POKEMON_GLD', `"${oro.title}"`);
check('y la licencia moderna de dos letras', oro.makerCode === '01', oro.makerCode);
check('la cabecera se da por valida', oro.valid);

// --- Game Boy a secas ---
const viejo = readRomHeader(romGameBoy({ titulo: 'TETRIS' }));
check('un cartucho sin color se reconoce como Game Boy', viejo.platform === 'gb', viejo.platform ?? 'nada');
check('y sin codigo de juego, porque no lo lleva', viejo.gameCode === '', `"${viejo.gameCode}"`);

// --- el caso que obliga a desempatar ---
//
// 0xB2 es el byte fijo de una cabecera de GBA, pero en una ROM de Game Boy esa
// posicion cae en los vectores de interrupcion, donde puede haber un 0x96
// cualquiera. Sin desempate, esa ROM pasaria por ser de GBA.
const confuso = romGameBoy({ titulo: 'POKEMON_SLV', codigo: 'AAXS', color: true });
confuso[0xb2] = 0x96;
const leido = readRomHeader(confuso);
check('una ROM de Game Boy con un 0x96 en 0xB2 no se confunde con una de GBA',
  leido.platform === 'gbc', leido.platform ?? 'nada');
check('y se lee bien su codigo', leido.gameCode === 'AAXS', leido.gameCode);

// --- basura ---
const basura = readRomHeader(new Uint8Array(0x200));
check('un fichero que no es una ROM se marca como invalido', !basura.valid);
check('y no se le inventa consola', basura.platform === null, String(basura.platform));

// --- una ROM de GBA de verdad, si la hay a mano ---
const ROM = process.argv[2];
if (ROM && existsSync(ROM)) {
  const real = readRomHeader(new Uint8Array(readFileSync(ROM)));
  check('una ROM de GBA real se reconoce', real.platform === 'gba', real.platform ?? 'nada');
  check('con su codigo de juego', /^[A-Z]{4}$/.test(real.gameCode), real.gameCode);
  check('y su CRC', /^[0-9a-f]{8}$/.test(real.crc32), real.crc32);
} else {
  console.log('\n(sin ROM de GBA a mano: pasale una como argumento para comprobarla tambien)');
}

console.log(fallos === 0 ? '\nLAS CABECERAS SE LEEN BIEN' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

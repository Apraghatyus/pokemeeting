import { existsSync, readFileSync } from 'node:fs';

// Fabrica una ROM de Game Boy Color minima, escrita aqui byte a byte.
//
// Existe para poder comprobar que el nucleo corre Game Boy Color sin que nadie
// tenga que tener un juego a mano, y sin meter en el repositorio nada que no
// sea nuestro. El programa son veinticuatro bytes de codigo que hacen
// parpadear la pantalla: en cada fotograma cambian la paleta de fondo, asi que
// dos capturas seguidas salen distintas y eso se puede comprobar.
//
// El logotipo que va en 0x104 se copia del propio nucleo, que ya lo trae. Hace
// falta: mGBA lo usa para decidir si un fichero es un cartucho de Game Boy, y
// la primera version de esto lo dejaba a ceros y el nucleo rechazaba la ROM.

/**
 * El logotipo de la cabecera, sacado del propio nucleo que ya tienes instalado.
 *
 * Una ROM de Game Boy se reconoce por estos 48 bytes: mGBA los compara para
 * decidir si el fichero es un cartucho, y sin ellos rechaza la ROM antes de
 * ejecutar nada. Comprobado: la primera version de esta prueba los dejaba a
 * cero y el nucleo no arrancaba.
 *
 * Se leen del wasm en vez de copiarse aqui. Son un dato de Nintendo, y aunque
 * cualquier ROM y cualquier emulador los lleve, este repositorio no tiene por
 * que guardarlos: ya estan en node_modules, puestos ahi por el propio
 * emulador, y solo se usan para que el fichero de prueba sea reconocible.
 */
const FIRMA = Buffer.from([0xce, 0xed, 0x66, 0x66, 0xcc, 0x0d, 0x00, 0x0b]);
const LARGO_LOGOTIPO = 48;

const leerLogotipo = () => {
  const nucleo = 'node_modules/@thenick775/mgba-wasm/dist/mgba.wasm';
  if (!existsSync(nucleo)) {
    throw new Error(`No encuentro el nucleo en ${nucleo}. Ejecuta npm ci.`);
  }
  const wasm = readFileSync(nucleo);
  const donde = wasm.indexOf(FIRMA);
  if (donde < 0) {
    throw new Error('Este nucleo no trae el logotipo de Game Boy, asi que no emula Game Boy.');
  }
  return wasm.subarray(donde, donde + LARGO_LOGOTIPO);
};

/**
 * Programa que hace parpadear el fondo.
 *
 *   ld a,$91 / ldh [$40],a    enciende la pantalla con el fondo visible
 *   ld b,$00                  contador de fotogramas
 * espera:
 *   ldh a,[$44] / cp $90      lee la linea actual hasta llegar a la 144,
 *   jr nz,espera              que es cuando empieza el apagado vertical
 *   inc b
 *   ld a,$80 / ldh [$68],a    apunta al primer color de la primera paleta
 *   ld a,b / ldh [$69],a      y lo pinta con el contador, dos veces porque
 *   ld a,b / ldh [$69],a      cada color son dos bytes
 * fuera:
 *   ldh a,[$44] / cp $90      espera a salir del apagado, para no contar
 *   jr z,fuera                el mismo fotograma dos veces
 *   jr espera
 *
 * El mapa de fondo esta a ceros, asi que toda la pantalla usa ese color: al
 * cambiarlo cada fotograma, la pantalla entera parpadea.
 *
 * Cuidado con el registro: en modo Game Boy Color la paleta de toda la vida
 * (BGP, en 0xFF47) no hace nada, y los colores salen de 0xFF68 y 0xFF69. La
 * primera version escribia en BGP y la pantalla no cambiaba, que es
 * exactamente lo que la prueba detecto.
 *
 * Los saltos son relativos a la instruccion siguiente, de ahi los -6 y el -25.
 */
const PROGRAMA = [
  0x3e, 0x91, // ld a,$91
  0xe0, 0x40, // ldh [$40],a
  0x06, 0x00, // ld b,$00
  0xf0, 0x44, // ldh a,[$44]
  0xfe, 0x90, // cp $90
  0x20, 0xfa, // jr nz,-6
  0x04, //       inc b
  0x3e, 0x80, // ld a,$80
  0xe0, 0x68, // ldh [$68],a
  0x78, //       ld a,b
  0xe0, 0x69, // ldh [$69],a
  0x78, //       ld a,b
  0xe0, 0x69, // ldh [$69],a
  0xf0, 0x44, // ldh a,[$44]
  0xfe, 0x90, // cp $90
  0x28, 0xfa, // jr z,-6
  0x18, 0xe7, // jr -25
];

/**
 * @param {{ titulo?: string, codigo?: string }} opciones
 * @returns {Uint8Array} una ROM de 32 KB lista para cargar
 */
export const construirRomGbc = ({ titulo = 'PRUEBA', codigo = 'AAAS' } = {}) => {
  const rom = new Uint8Array(0x8000);

  rom.set(leerLogotipo(), 0x104);

  // El punto de entrada salta al programa, que se pone despues de la cabecera.
  rom.set([0x00, 0xc3, 0x50, 0x01], 0x100); // nop; jp $0150
  rom.set(PROGRAMA, 0x150);

  const escribir = (offset, texto) => {
    for (let i = 0; i < texto.length; i += 1) rom[offset + i] = texto.charCodeAt(i);
  };
  escribir(0x134, titulo.slice(0, 11));
  escribir(0x13f, codigo.slice(0, 4));

  rom[0x143] = 0xc0; // solo Game Boy Color, para que corra en ese modo
  rom[0x147] = 0x00; // solo ROM, sin mapeador
  rom[0x148] = 0x00; // 32 KB
  rom[0x149] = 0x00; // sin RAM

  // La consola no arrancaba un cartucho cuya suma no cuadrara.
  let suma = 0;
  for (let i = 0x134; i <= 0x14c; i += 1) suma = (suma - rom[i] - 1) & 0xff;
  rom[0x14d] = suma;

  return rom;
};

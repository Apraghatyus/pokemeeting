// Identificacion de una ROM a partir de su cabecera.
//
// Sirve para tres cosas distintas, y conviene no confundirlas:
//   1. Saber de que consola es -> se deduce del contenido, no del nombre.
//   2. Elegir el perfil de direcciones de RAM -> depende de gameCode + version.
//   3. Saber si dos jugadores tienen la MISMA ROM -> depende del crc32.
// En un Soul Link randomizado lo normal es (2) igual y (3) distinto.
//
// Game Boy y Game Boy Advance guardan la cabecera en sitios distintos y con
// otra forma, pero ambas traen lo mismo que necesitamos: un titulo, un codigo
// de cuatro letras cuya ultima es el idioma, y algo con lo que comprobar que
// el fichero es lo que dice ser.

import type { PlatformId } from './platforms';

export type RomHeader = {
  /** Titulo interno, ej. "POKEMON FIRE" o "POKEMON_GLD". */
  title: string;
  /** Codigo de juego de 4 letras, ej. "BPRE" (Rojo Fuego) o "AAUS" (Oro). */
  gameCode: string;
  /** Codigo de fabricante, "01" = Nintendo. */
  makerCode: string;
  /** Numero de revision: 0 = v1.0, 1 = v1.1. */
  version: number;
  /** CRC32 de la ROM completa. Identifica la copia exacta, randomizador incluido. */
  crc32: string;
  /** Tamano en bytes. */
  size: number;
  /** false si la cabecera no cuadra: no es una ROM de las que sabemos leer. */
  valid: boolean;
  /**
   * De que consola es, deducido del contenido.
   *
   * Se mira dentro del fichero y no su extension a proposito: un `.gb` puede
   * traer un juego de Game Boy Color, y alguien puede renombrar cualquier cosa.
   */
  platform: PlatformId | null;
};

// Tabla CRC32 estandar, generada una sola vez.
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export const crc32 = (bytes: Uint8Array): string => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = crcTable[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
};

const ascii = (bytes: Uint8Array, offset: number, length: number): string => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    const byte = bytes[offset + i];
    // El titulo se rellena con ceros; cortamos ahi.
    if (byte === undefined || byte === 0) break;
    out += String.fromCharCode(byte);
  }
  return out.trim();
};

// --- Game Boy Advance ---

const GBA = {
  title: 0xa0,
  gameCode: 0xac,
  makerCode: 0xb0,
  fixedValue: 0xb2,
  version: 0xbc,
} as const;

/** Toda cabecera de GBA valida lleva este byte en 0xB2. */
const GBA_FIXED_VALUE = 0x96;

/**
 * Suma de comprobacion de la cabecera de GBA, en 0xBD.
 *
 * No se usa para decidir si una ROM vale -el byte fijo basta, y exigir mas
 * podria rechazar una copia manipulada que funciona-, sino solo para desempatar
 * en el caso raro de que un fichero pase por las dos consolas a la vez.
 */
const sumaCabeceraGba = (bytes: Uint8Array): number => {
  let suma = 0;
  for (let i = 0xa0; i <= 0xbc; i += 1) suma = (suma - (bytes[i] ?? 0)) & 0xff;
  return (suma - 0x19) & 0xff;
};

const esGba = (bytes: Uint8Array): boolean => bytes[GBA.fixedValue] === GBA_FIXED_VALUE;

// --- Game Boy y Game Boy Color ---

const GB = {
  titulo: 0x134,
  /** Codigo de 4 letras. Solo lo traen los cartuchos tardios, los de GBC. */
  codigo: 0x13f,
  /** 0x80 o 0xC0 si el juego usa las capacidades de color. */
  banderaColor: 0x143,
  licenciaNueva: 0x144,
  banderaSgb: 0x146,
  version: 0x14c,
  checksum: 0x14d,
  licenciaVieja: 0x14b,
} as const;

/**
 * Comprueba la suma de la cabecera de Game Boy.
 *
 * Es mejor senal que el logotipo de Nintendo que hay justo antes: el logotipo
 * es un dato fijo de otra gente, y esto es una cuenta de tres lineas que
 * cualquier ROM real cumple porque, si no, la consola no la arrancaba.
 */
const sumaCabeceraGb = (bytes: Uint8Array): number => {
  let suma = 0;
  for (let i = 0x134; i <= 0x14c; i += 1) suma = (suma - (bytes[i] ?? 0) - 1) & 0xff;
  return suma;
};

const esGb = (bytes: Uint8Array): boolean =>
  bytes.length > GB.checksum && bytes[GB.checksum] === sumaCabeceraGb(bytes);

const leerGb = (bytes: Uint8Array): RomHeader => {
  const color = (bytes[GB.banderaColor] ?? 0) & 0x80;

  // En los cartuchos con codigo de juego, el titulo se queda en once letras:
  // los cinco bytes siguientes son el codigo y la bandera de color. Leer
  // dieciseis como en los cartuchos viejos mezclaria las dos cosas.
  const codigo = ascii(bytes, GB.codigo, 4);
  const conCodigo = /^[A-Z0-9]{4}$/.test(codigo);
  const titulo = ascii(bytes, GB.titulo, conCodigo ? 11 : 16);

  // La licencia moderna son dos letras en 0x144, y solo vale cuando la vieja
  // esta puesta a 0x33 anunciandolo. Si no, la vieja es un byte suelto.
  const licencia =
    bytes[GB.licenciaVieja] === 0x33
      ? ascii(bytes, GB.licenciaNueva, 2)
      : (bytes[GB.licenciaVieja] ?? 0).toString(16).padStart(2, '0').toUpperCase();

  return {
    title: titulo,
    gameCode: conCodigo ? codigo : '',
    makerCode: licencia,
    version: bytes[GB.version] ?? 0,
    crc32: crc32(bytes),
    size: bytes.length,
    valid: true,
    platform: color ? 'gbc' : 'gb',
  };
};

/**
 * Lee la cabecera, sea de la consola que sea.
 *
 * Las dos senales son independientes: GBA lleva un byte fijo en 0xB2 y Game
 * Boy una suma de comprobacion en 0x14D. Un fichero puede cumplir las dos por
 * casualidad -0xB2 cae en los vectores de interrupcion de una ROM de Game Boy,
 * y ahi puede haber un 0x96 cualquiera-, asi que cuando pasa se desempata con
 * la suma de la cabecera de GBA, que ya no coincide por azar.
 */
export const readRomHeader = (bytes: Uint8Array): RomHeader => {
  const pareceGba = esGba(bytes);
  const pareceGb = esGb(bytes);

  const gba = (): RomHeader => ({
    title: ascii(bytes, GBA.title, 12),
    gameCode: ascii(bytes, GBA.gameCode, 4),
    makerCode: ascii(bytes, GBA.makerCode, 2),
    version: bytes[GBA.version] ?? 0,
    crc32: crc32(bytes),
    size: bytes.length,
    valid: true,
    platform: 'gba',
  });

  if (pareceGba && pareceGb) {
    return bytes[0xbd] === sumaCabeceraGba(bytes) ? gba() : leerGb(bytes);
  }
  if (pareceGba) return gba();
  if (pareceGb) return leerGb(bytes);

  return {
    title: '',
    gameCode: '',
    makerCode: '',
    version: 0,
    crc32: crc32(bytes),
    size: bytes.length,
    valid: false,
    platform: null,
  };
};

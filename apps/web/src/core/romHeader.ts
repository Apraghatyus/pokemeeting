// Identificacion de una ROM de GBA a partir de su cabecera.
//
// Sirve para dos cosas distintas, y conviene no confundirlas:
//   1. Elegir el perfil de direcciones de RAM -> depende de gameCode + version.
//   2. Saber si dos jugadores tienen la MISMA ROM -> depende del crc32.
// En un Soul Link randomizado lo normal es (1) igual y (2) distinto.

export type RomHeader = {
  /** Titulo interno, ej. "POKEMON FIRE". */
  title: string;
  /** Codigo de juego de 4 letras, ej. "BPRE" (FireRed) o "BPRS" (Rojo Fuego ES). */
  gameCode: string;
  /** Codigo de fabricante, "01" = Nintendo. */
  makerCode: string;
  /** Numero de revision: 0 = v1.0, 1 = v1.1. */
  version: number;
  /** CRC32 de la ROM completa. Identifica la copia exacta, randomizador incluido. */
  crc32: string;
  /** Tamano en bytes. */
  size: number;
  /** false si el byte fijo 0x96 no esta donde debe: no es una ROM de GBA valida. */
  valid: boolean;
};

const HEADER = {
  title: 0xa0,
  gameCode: 0xac,
  makerCode: 0xb0,
  fixedValue: 0xb2,
  version: 0xbc,
} as const;

/** Toda cabecera de GBA valida lleva este byte en 0xB2. */
const GBA_FIXED_VALUE = 0x96;

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

export const readRomHeader = (bytes: Uint8Array): RomHeader => ({
  title: ascii(bytes, HEADER.title, 12),
  gameCode: ascii(bytes, HEADER.gameCode, 4),
  makerCode: ascii(bytes, HEADER.makerCode, 2),
  version: bytes[HEADER.version] ?? 0,
  crc32: crc32(bytes),
  size: bytes.length,
  valid: bytes[HEADER.fixedValue] === GBA_FIXED_VALUE,
});

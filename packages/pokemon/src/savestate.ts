// Leer la memoria del juego a traves de un savestate de mGBA.
//
// Es un rodeo, y conviene saber por que se da: mGBA-wasm no expone lectura ni
// escritura de memoria, ni scripting. Lo unico que ofrece es guardar y cargar
// estados. Pero un estado de GBA contiene la RAM entera, y el equipo Pokemon
// vive en ella. Asi que se lee parseando el estado, y se escribe editandolo y
// volviendolo a cargar.
//
// Como el Soul Link automatico quedo descartado, no hace falta mirar la memoria
// continuamente: basta con leerla en el momento del intercambio, con los dos
// juegos en pausa. Eso convierte este rodeo en algo perfectamente comodo.

/** Tamano exacto del estado sin captura de pantalla. */
export const TAMANO_ESTADO = 0x61000;

/**
 * Donde vive cada region dentro del fichero de estado.
 *
 * El orden no es el que uno esperaria (la memoria principal va al final, no al
 * principio), asi que no se deduce: sale del propio codigo de mGBA, y esta
 * comprobado contra estados reales. Las comprobaciones que lo confirman:
 *
 *   - En PRAM ninguna de las 512 entradas tiene el bit 15 puesto, porque un
 *     color de GBA es BGR555 y ese bit no existe. Y el 69% de sus bytes
 *     aparecen tal cual dentro de la ROM: las paletas se copian sin tocar.
 *   - En OAM, 43 de los 128 sprites tienen coordenadas dentro de la pantalla,
 *     y esa region cambia un 37% entre dos instantes: los sprites se mueven.
 *   - El 43% de IWRAM sale tal cual de la ROM, que es justo lo que hacen los
 *     juegos de GBA: copiar sus rutinas a la RAM rapida.
 */
export const REGIONES = {
  pram: { inicio: 0x00800, tamano: 0x400 },
  oam: { inicio: 0x00c00, tamano: 0x400 },
  vram: { inicio: 0x01000, tamano: 0x18000 },
  iwram: { inicio: 0x19000, tamano: 0x8000 },
  /** La memoria principal, en 0x02000000 para el juego. Aqui vive el equipo. */
  ewram: { inicio: 0x21000, tamano: 0x40000 },
} as const;

export type Region = keyof typeof REGIONES;

/** Direccion que ve el juego para el primer byte de cada region. */
export const DIRECCION_BASE: Readonly<Record<Region, number>> = {
  pram: 0x05000000,
  oam: 0x07000000,
  vram: 0x06000000,
  iwram: 0x03000000,
  ewram: 0x02000000,
};

export type CabeceraEstado = {
  /** Version del formato de estado de mGBA. */
  magic: number;
  /** CRC de la ROM que estaba corriendo. Sirve para no mezclar partidas. */
  romCrc32: string;
  /** Titulo interno, por ejemplo "POKEMON FIRE". */
  titulo: string;
  /** Codigo de juego de cuatro letras, por ejemplo "BPRS". */
  codigoJuego: string;
  /** Ciclos emulados desde el arranque. */
  ciclos: number;
};

export class EstadoInvalidoError extends Error {}

const texto = (bytes: Uint8Array, inicio: number, largo: number): string => {
  let salida = '';
  for (let i = 0; i < largo; i += 1) {
    const byte = bytes[inicio + i];
    if (byte === undefined || byte === 0) break;
    salida += String.fromCharCode(byte);
  }
  return salida.trim();
};

/**
 * Lee la cabecera del estado.
 *
 * Merece la pena comprobarla antes de tocar nada: un estado de otro juego
 * tiene exactamente la misma forma, y confundirlos significaria escribir
 * bytes de un Pokemon en mitad de otra partida.
 */
export const leerCabecera = (estado: Uint8Array): CabeceraEstado => {
  if (estado.length !== TAMANO_ESTADO) {
    throw new EstadoInvalidoError(
      `Un estado sin captura ocupa ${TAMANO_ESTADO} bytes y este tiene ${estado.length}.`,
    );
  }

  const vista = new DataView(estado.buffer, estado.byteOffset, estado.byteLength);
  return {
    magic: vista.getUint32(0, true),
    romCrc32: vista.getUint32(8, true).toString(16).padStart(8, '0'),
    titulo: texto(estado, 0x10, 12),
    codigoJuego: texto(estado, 0x1c, 4),
    ciclos: vista.getUint32(12, true),
  };
};

/** Devuelve una vista sobre una region, sin copiar. */
export const region = (estado: Uint8Array, cual: Region): Uint8Array => {
  if (estado.length !== TAMANO_ESTADO) {
    throw new EstadoInvalidoError(
      `Un estado sin captura ocupa ${TAMANO_ESTADO} bytes y este tiene ${estado.length}.`,
    );
  }
  const { inicio, tamano } = REGIONES[cual];
  return estado.subarray(inicio, inicio + tamano);
};

/**
 * Traduce una direccion del juego al desplazamiento dentro del estado.
 *
 * Asi se puede razonar con las direcciones que usan los documentos de
 * ingenieria inversa (0x02024284 y compania) sin hacer cuentas a mano.
 */
export const desplazamientoDe = (direccion: number): { region: Region; offset: number } | null => {
  for (const cual of Object.keys(REGIONES) as Region[]) {
    const base = DIRECCION_BASE[cual];
    const { tamano, inicio } = REGIONES[cual];
    if (direccion >= base && direccion < base + tamano) {
      return { region: cual, offset: inicio + (direccion - base) };
    }
  }
  return null;
};

/**
 * Escribe bytes en el estado, en la direccion que veria el juego.
 *
 * Es la mitad que hace posibles los intercambios: se edita el estado y se
 * vuelve a cargar. Devuelve una copia y no modifica el original, para que un
 * intercambio a medias nunca deje el estado del jugador tocado.
 */
export const escribirEn = (
  estado: Uint8Array,
  direccion: number,
  datos: Uint8Array,
): Uint8Array => {
  const destino = desplazamientoDe(direccion);
  if (!destino) {
    throw new EstadoInvalidoError(`La direccion 0x${direccion.toString(16)} no cae en ninguna region.`);
  }

  const { inicio, tamano } = REGIONES[destino.region];
  if (destino.offset + datos.length > inicio + tamano) {
    throw new EstadoInvalidoError('Lo que se quiere escribir no cabe en la region.');
  }

  const copia = estado.slice();
  copia.set(datos, destino.offset);
  return copia;
};

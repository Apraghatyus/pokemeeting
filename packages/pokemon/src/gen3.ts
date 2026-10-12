// La estructura de un Pokemon de tercera generacion.
//
// Un Pokemon del equipo son 100 bytes. Los primeros 80 son los que viajan en un
// intercambio; los otros 20 son el estado de combate, que el juego recalcula.
//
//    0x00  4  valor de personalidad   <- semilla de todo: genero, naturaleza, orden
//    0x04  4  ID del entrenador original
//    0x08 10  mote
//    0x12  1  idioma
//    0x13  1  banderas
//    0x14  7  nombre del entrenador original
//    0x1B  1  marcas de la caja
//    0x1C  2  checksum
//    0x1E  2  relleno
//    0x20 48  datos cifrados: cuatro subestructuras de 12 bytes
//    0x50 20  nivel, HP actual, estadisticas (solo en el equipo)
//
// Dos detalles que hay que respetar o el juego rechaza el Pokemon como "malo":
//
//   - Los 48 bytes van cifrados con un XOR palabra a palabra, con la clave
//     `personalidad XOR idEntrenador`.
//   - El orden de las cuatro subestructuras lo decide `personalidad % 24`. No
//     es fijo: hay 24 permutaciones y cada Pokemon usa la suya.

/** Tamano del bloque tal y como vive en el equipo. */
export const TAMANO_EN_EQUIPO = 100;
/** Tamano del bloque tal y como vive en una caja: sin estado de combate. */
export const TAMANO_EN_CAJA = 80;
/** Cuantos caben en el equipo. */
export const TAMANO_EQUIPO = 6;

const OFF = {
  personalidad: 0x00,
  idEntrenador: 0x04,
  mote: 0x08,
  idioma: 0x12,
  banderas: 0x13,
  nombreEntrenador: 0x14,
  marcas: 0x1b,
  checksum: 0x1c,
  datos: 0x20,
  combate: 0x50,
} as const;

/**
 * Las 24 permutaciones posibles de las cuatro subestructuras.
 *
 * G = crecimiento, A = ataques, E = esfuerzo, M = misceláneo. El indice es
 * `personalidad % 24` y el valor dice en que posicion esta cada una.
 */
const ORDENES = [
  'GAEM', 'GAME', 'GEAM', 'GEMA', 'GMAE', 'GMEA',
  'AGEM', 'AGME', 'AEGM', 'AEMG', 'AMGE', 'AMEG',
  'EGAM', 'EGMA', 'EAGM', 'EAMG', 'EMGA', 'EMAG',
  'MGAE', 'MGEA', 'MAGE', 'MAEG', 'MEGA', 'MEAG',
] as const;

export type Subestructura = 'G' | 'A' | 'E' | 'M';

export type PokemonGen3 = {
  personalidad: number;
  idEntrenador: number;
  /** Mote todavia sin traducir del juego de caracteres propio. */
  moteBruto: Uint8Array;
  nombreEntrenadorBruto: Uint8Array;
  idioma: number;
  especie: number;
  objeto: number;
  experiencia: number;
  movimientos: number[];
  nivel: number;
  /**
   * Si es un huevo.
   *
   * Vive en el bit 30 de la palabra que guarda los IV, compartiendo sitio con
   * ellos. Rellenar esa palabra a lo bruto enciende la bandera y el juego pinta
   * un huevo sin nivel ni PS: paso al fabricar un Pokemon para probar.
   */
  esHuevo: boolean;
  /**
   * Donde se encontro: el numero de zona del mapa, en el byte 1 de la
   * subestructura M.
   *
   * Es una ZONA con nombre -"RUTA 3", "MT. MOON"- y no un mapa: todas las
   * plantas de una cueva comparten el mismo. Justo la medida de una Nuzlocke.
   * Dos valores no son sitios: 254 es un intercambio dentro del juego y 255 un
   * encuentro de evento.
   */
  lugar: number;
  /**
   * El nivel al que se encontro, en los siete bits de abajo de la palabra de
   * origen. Cero quiere decir que salio de un huevo: entonces `lugar` es donde
   * eclosiono, no donde se capturo.
   */
  nivelEncontrado: number;
  /** true si el checksum cuadra: la senal de que el bloque esta intacto. */
  valido: boolean;
};

const u16 = (b: Uint8Array, i: number): number => b[i]! | (b[i + 1]! << 8);
const u32 = (b: Uint8Array, i: number): number =>
  (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0;

/**
 * Descifra los 48 bytes de datos.
 *
 * El cifrado es simetrico, asi que la misma funcion vuelve a cifrar.
 */
export const descifrarDatos = (bloque: Uint8Array): Uint8Array => {
  const clave = (u32(bloque, OFF.personalidad) ^ u32(bloque, OFF.idEntrenador)) >>> 0;
  const datos = bloque.slice(OFF.datos, OFF.datos + 48);
  const salida = new Uint8Array(48);

  for (let i = 0; i < 48; i += 4) {
    const palabra = (u32(datos, i) ^ clave) >>> 0;
    salida[i] = palabra & 0xff;
    salida[i + 1] = (palabra >>> 8) & 0xff;
    salida[i + 2] = (palabra >>> 16) & 0xff;
    salida[i + 3] = (palabra >>> 24) & 0xff;
  }
  return salida;
};

/**
 * Suma de comprobacion: la suma de las palabras de 16 bits ya descifradas.
 *
 * Es lo que separa un bloque intacto de basura, y por eso es el filtro con el
 * que se busca el equipo dentro de la memoria: la probabilidad de que 100
 * bytes cualesquiera cuadren por casualidad es de una entre 65536.
 */
export const calcularChecksum = (datosDescifrados: Uint8Array): number => {
  let suma = 0;
  for (let i = 0; i < 48; i += 2) suma = (suma + u16(datosDescifrados, i)) & 0xffff;
  return suma;
};

/** Donde empieza cada subestructura dentro de los 48 bytes descifrados. */
export const posicionDe = (personalidad: number, cual: Subestructura): number => {
  const orden = ORDENES[personalidad % 24]!;
  return orden.indexOf(cual) * 12;
};

/**
 * Interpreta un bloque de 100 bytes.
 *
 * No lanza si el checksum falla: devuelve `valido: false` y lo que haya podido
 * leer, porque el buscador necesita mirar miles de posiciones y casi todas no
 * son un Pokemon.
 */
export const leerPokemon = (bloque: Uint8Array): PokemonGen3 => {
  const personalidad = u32(bloque, OFF.personalidad);
  const idEntrenador = u32(bloque, OFF.idEntrenador);
  const datos = descifrarDatos(bloque);

  const g = posicionDe(personalidad, 'G');
  const a = posicionDe(personalidad, 'A');
  const m = posicionDe(personalidad, 'M');

  return {
    personalidad,
    idEntrenador,
    moteBruto: bloque.slice(OFF.mote, OFF.mote + 10),
    nombreEntrenadorBruto: bloque.slice(OFF.nombreEntrenador, OFF.nombreEntrenador + 7),
    idioma: bloque[OFF.idioma]!,
    especie: u16(datos, g),
    objeto: u16(datos, g + 2),
    experiencia: u32(datos, g + 4),
    movimientos: [u16(datos, a), u16(datos, a + 2), u16(datos, a + 4), u16(datos, a + 6)],
    nivel: bloque[OFF.combate + 4] ?? 0,
    esHuevo: ((u32(datos, m + 4) >>> 30) & 1) === 1,
    lugar: datos[m + 1] ?? 0,
    nivelEncontrado: u16(datos, m + 2) & 0x7f,
    valido: calcularChecksum(datos) === u16(bloque, OFF.checksum),
  };
};

/**
 * Rehace el checksum de un bloque.
 *
 * Solo hace falta si se modifica algo. Moviendo un Pokemon entero de una
 * partida a otra no se toca nada, asi que el checksum viaja ya correcto.
 */
export const recalcularChecksum = (bloque: Uint8Array): Uint8Array => {
  const copia = bloque.slice();
  const suma = calcularChecksum(descifrarDatos(copia));
  copia[OFF.checksum] = suma & 0xff;
  copia[OFF.checksum + 1] = (suma >>> 8) & 0xff;
  return copia;
};

/**
 * Cambia de especie a un Pokemon, dejando el bloque valido.
 *
 * Son tres pasos y los tres son obligatorios: la especie vive dentro de los 48
 * bytes CIFRADOS, asi que hay que descifrar, escribir y volver a cifrar; y
 * despues rehacer el checksum, porque los datos han cambiado y el juego
 * rechaza como "Bad Egg" cualquier bloque cuya suma no cuadre.
 *
 * Lo usa la evolucion al intercambiar. Lo que NO hace es recalcular las
 * estadisticas: eso es otra cosa y la hace `recalcularEnBloque`, que necesita
 * los datos base de la nueva especie en ESTA ROM.
 */
export const escribirEspecie = (bloque: Uint8Array, especie: number): Uint8Array => {
  const copia = bloque.slice();
  const personalidad = u32(copia, OFF.personalidad);
  const clave = (personalidad ^ u32(copia, OFF.idEntrenador)) >>> 0;

  const datos = descifrarDatos(copia);
  const g = posicionDe(personalidad, 'G');
  datos[g] = especie & 0xff;
  datos[g + 1] = (especie >>> 8) & 0xff;

  // El cifrado es el mismo XOR de antes, palabra a palabra.
  for (let i = 0; i < 48; i += 4) {
    const palabra = (u32(datos, i) ^ clave) >>> 0;
    copia[OFF.datos + i] = palabra & 0xff;
    copia[OFF.datos + i + 1] = (palabra >>> 8) & 0xff;
    copia[OFF.datos + i + 2] = (palabra >>> 16) & 0xff;
    copia[OFF.datos + i + 3] = (palabra >>> 24) & 0xff;
  }

  // El checksum se calcula sobre los datos DESCIFRADOS, que son los que
  // acabamos de cambiar.
  const suma = calcularChecksum(datos);
  copia[OFF.checksum] = suma & 0xff;
  copia[OFF.checksum + 1] = (suma >>> 8) & 0xff;
  return copia;
};

/**
 * Le pone otro mote, en los bytes del propio juego.
 *
 * Se le pasan los bytes ya en el juego de caracteres de la ROM -por ejemplo,
 * copiados de su tabla de nombres- porque asi no hay que traducir en ningun
 * sentido y el mote queda escrito en el idioma de la copia que lo recibe.
 *
 * El mote NO va cifrado, asi que esto no toca el checksum.
 */
export const escribirMote = (bloque: Uint8Array, mote: Uint8Array): Uint8Array => {
  const copia = bloque.slice();
  for (let i = 0; i < 10; i += 1) copia[OFF.mote + i] = i < mote.length ? mote[i]! : FIN_DE_TEXTO;
  return copia;
};

/** El 0xFF que cierra una cadena del juego. Se repite aqui para no depender. */
const FIN_DE_TEXTO = 0xff;

/** Si un bloque parece de verdad un Pokemon y no memoria cualquiera. */
export const pareceValido = (bloque: Uint8Array, maxEspecie = 411): boolean => {
  if (bloque.length < TAMANO_EN_EQUIPO) return false;

  const leido = leerPokemon(bloque);
  if (!leido.valido) return false;

  // El checksum ya filtra casi todo, pero un hueco de ceros lo cuadra por
  // accidente: la suma de cuarenta y ocho ceros es cero. Estas comprobaciones
  // descartan ese caso y los indices fuera de rango.
  if (leido.personalidad === 0 && leido.idEntrenador === 0) return false;
  if (leido.especie === 0 || leido.especie > maxEspecie) return false;
  if (leido.nivel < 1 || leido.nivel > 100) return false;

  return true;
};

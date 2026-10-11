// El juego de caracteres de tercera generacion.
//
// Los juegos de GBA no usan ASCII: tienen su propia tabla, donde la 'A' es
// 0xBB y el fin de cadena es 0xFF. Hace falta para dos cosas: leer los motes
// que viajan en un intercambio, y leer de la ROM como se llama cada especie,
// que es lo que permite avisar de que un Pokemon llegara convertido en otro
// cuando las dos copias estan aleatorizadas por separado.

/** Marca el final de una cadena. */
export const FIN = 0xff;
/** Espacio. */
export const ESPACIO = 0x00;

const tabla = new Map<number, string>();

// Los tramos regulares se generan en vez de escribirse a mano.
const tramo = (inicio: number, texto: string): void => {
  [...texto].forEach((caracter, i) => tabla.set(inicio + i, caracter));
};

tramo(0xa1, '0123456789');
tramo(0xbb, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
tramo(0xd5, 'abcdefghijklmnopqrstuvwxyz');

// Y los sueltos, que no siguen ningun patron.
const sueltos: Record<number, string> = {
  0x00: ' ',
  0xab: '!',
  0xac: '?',
  0xad: '.',
  0xae: '-',
  0xb0: '…',
  0xb1: '“',
  0xb2: '”',
  0xb3: '‘',
  0xb4: '’',
  0xb5: '♂',
  0xb6: '♀',
  0xb7: '$',
  0xb8: ',',
  0xb9: '×',
  0xba: '/',
  // La ñ y la Ñ, comprobadas contra la ROM espanola: se busco "peque?o" y
  // "SE?OR" con el hueco en blanco y salieron estos dos, 40 y 6 veces.
  //
  // Aqui habia un 0xe7 puesto a 'ñ', y 0xe7 es la 's': es 0xd5 ('a') mas
  // dieciocho. O sea que pisaba una letra del tramo de minusculas y toda 's'
  // salia como 'ñ'. Se vio jugando, con un Pokemon llamado "Huesitos" que en el
  // panel aparecia como "Hueñitoñ".
  0x29: 'ñ',
  0x14: 'Ñ',
  0x2d: '&',
  0x2e: '+',
  0x35: '=',
  0x36: ';',
  0x5a: 'í',
  0x5b: '%',
  0x5c: '(',
  0x5d: ')',
  // Las mayusculas acentuadas. La O salio de medirla: el movimiento 272 se
  // guarda como "IMITACI?N" con un 0x0E en el hueco, y el 3 como
  // "DOBLEBOFET?N" con el mismo byte. Las otras cuatro vienen de la misma tabla
  // de la que ya salian la N con virgulilla (0x14) y esa misma O, asi que van
  // con ella; si alguna estuviera mal se veria como una letra cambiada y no
  // como texto roto.
  //
  // No es solo cosmetico: sin estos bytes, `pareceNombre` daba por basura toda
  // entrada que llevara un acento, y por eso la tabla de nombres de movimiento
  // no se encontraba buscandola por su forma.
  // Y la U con dieresis, que salio sola: el movimiento 122 se guarda como
  // "LENG?ETAZO" con un 0xf3 en el hueco, y ahi solo cabe una letra.
  0xf3: 'Ü',
  0x02: 'Á',
  0x06: 'É',
  0x0a: 'Í',
  0x0e: 'Ó',
  0x12: 'Ú',
  0x68: 'á',
  0x6f: 'í',
  0x73: 'ú',
  0x74: 'é',
  0x75: 'ó',
  0x76: 'í',
};
for (const [codigo, caracter] of Object.entries(sueltos)) {
  tabla.set(Number(codigo), caracter);
}

/**
 * Convierte una cadena del juego a texto normal.
 *
 * Los caracteres que no reconocemos se dejan como un punto en vez de fallar:
 * una tabla incompleta no debe impedir leer un mote.
 */
export const leerTexto = (bytes: Uint8Array): string => {
  let salida = '';
  for (const byte of bytes) {
    if (byte === FIN) break;
    salida += tabla.get(byte) ?? '·';
  }
  return salida.trimEnd();
};

/** Si una secuencia parece un nombre del juego y no bytes cualesquiera. */
export const pareceNombre = (bytes: Uint8Array): boolean => {
  let letras = 0;
  for (const byte of bytes) {
    if (byte === FIN) break;
    // Mayusculas, minusculas, digitos, espacio y los signos mas comunes.
    //
    // Las vocales acentuadas y la ñ viven por debajo de 0xa1, asi que tambien
    // cuentan: si no, un mote perfectamente normal en espanol -"Ñoño"- se daria
    // por basura.
    const valido =
      (byte >= 0xa1 && byte <= 0xee) ||
      byte === ESPACIO ||
      tabla.has(byte);
    if (!valido) return false;
    letras += 1;
  }
  return letras > 0;
};

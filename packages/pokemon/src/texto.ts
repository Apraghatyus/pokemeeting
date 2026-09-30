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
  0xe7: 'ñ', // en la tabla latina la ñ ocupa su propio hueco
  0x2d: '&',
  0x2e: '+',
  0x35: '=',
  0x36: ';',
  0x5a: 'í',
  0x5b: '%',
  0x5c: '(',
  0x5d: ')',
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
    const valido =
      (byte >= 0xa1 && byte <= 0xee) || byte === ESPACIO || byte === 0x2d || byte === 0x2e;
    if (!valido) return false;
    letras += 1;
  }
  return letras > 0;
};

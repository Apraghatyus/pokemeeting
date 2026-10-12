// Base64 a bytes, sin depender de atob.
//
// Por aqui pasan la ROM una vez (16 MB) y el estado cada pocos segundos (388
// KB), asi que se decodifica con una tabla y sin cadenas intermedias.

const TABLA = new Uint8Array(128);
'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  .split('')
  .forEach((c, i) => (TABLA[c.charCodeAt(0)] = i));

export const desdeBase64 = (texto: string): Uint8Array => {
  let largo = texto.length;
  while (largo > 0 && texto[largo - 1] === '=') largo -= 1;
  const salida = new Uint8Array(Math.floor((largo * 3) / 4));
  let j = 0;
  for (let i = 0; i < largo; i += 4) {
    const a = TABLA[texto.charCodeAt(i)]!;
    const b = TABLA[texto.charCodeAt(i + 1)]!;
    const c = i + 2 < largo ? TABLA[texto.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < largo ? TABLA[texto.charCodeAt(i + 3)]! : 0;
    salida[j++] = (a << 2) | (b >> 4);
    if (j < salida.length) salida[j++] = ((b & 15) << 4) | (c >> 2);
    if (j < salida.length) salida[j++] = ((c & 3) << 6) | d;
  }
  return salida;
};

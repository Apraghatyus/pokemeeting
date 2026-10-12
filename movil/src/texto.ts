// TextDecoder para Hermes.
//
// Hermes trae TextEncoder pero no TextDecoder, y el codigo compartido con la
// web lo usa para leer los ficheros .emupoke (core/paquete.ts). Solo hace
// falta UTF-8, asi que solo hay UTF-8.

const decodificar = (bytes: Uint8Array): string => {
  let salida = '';
  for (let i = 0; i < bytes.length; ) {
    const a = bytes[i++]!;
    let punto: number;
    if (a < 0x80) punto = a;
    else if (a < 0xe0) punto = ((a & 31) << 6) | (bytes[i++]! & 63);
    else if (a < 0xf0) punto = ((a & 15) << 12) | ((bytes[i++]! & 63) << 6) | (bytes[i++]! & 63);
    else
      punto =
        ((a & 7) << 18) | ((bytes[i++]! & 63) << 12) | ((bytes[i++]! & 63) << 6) | (bytes[i++]! & 63);
    salida += String.fromCodePoint(punto);
  }
  return salida;
};

class DecodificadorUtf8 {
  readonly encoding = 'utf-8';
  decode(datos?: ArrayBufferView | ArrayBuffer): string {
    if (!datos) return '';
    const bytes =
      datos instanceof ArrayBuffer
        ? new Uint8Array(datos)
        : new Uint8Array(datos.buffer, datos.byteOffset, datos.byteLength);
    return decodificar(bytes);
  }
}

const global = globalThis as {TextDecoder?: unknown};
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = DecodificadorUtf8;

/** Por si acaso: Hermes lo trae desde React Native 0.74, pero no cuesta nada. */
class CodificadorUtf8 {
  readonly encoding = 'utf-8';
  encode(texto = ''): Uint8Array {
    const salida: number[] = [];
    for (const letra of texto) {
      const p = letra.codePointAt(0)!;
      if (p < 0x80) salida.push(p);
      else if (p < 0x800) salida.push(0xc0 | (p >> 6), 0x80 | (p & 63));
      else if (p < 0x10000) salida.push(0xe0 | (p >> 12), 0x80 | ((p >> 6) & 63), 0x80 | (p & 63));
      else salida.push(0xf0 | (p >> 18), 0x80 | ((p >> 12) & 63), 0x80 | ((p >> 6) & 63), 0x80 | (p & 63));
    }
    return new Uint8Array(salida);
  }
}

const otroGlobal = globalThis as {TextEncoder?: unknown};
if (typeof otroGlobal.TextEncoder === 'undefined') otroGlobal.TextEncoder = CodificadorUtf8;

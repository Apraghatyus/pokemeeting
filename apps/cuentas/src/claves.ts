// Guardar contrasenas sin guardar contrasenas.
//
// Lo que se guarda es un resumen que no se puede deshacer. Si alguien se lleva
// una copia de la base, no se lleva las contrasenas de nadie: se lleva un
// monton de resumenes que cuestan anos de ordenador cada uno.
//
// SCRYPT, y no SHA ni MD5. La diferencia no es que sea "mas seguro" en
// abstracto: es que esta hecho para ir LENTO y para gastar memoria. Un SHA-256
// se calcula miles de millones de veces por segundo en una tarjeta grafica, asi
// que una lista de contrasenas comunes se prueba entera en nada. Scrypt con
// estos parametros tarda ~100 ms y pide 32 MB por intento, y eso convierte esa
// misma lista en semanas.
//
// Y viene en Node. Sin dependencias nativas, sin compilar nada, sin un paquete
// mas que mantener. Para un proyecto que se despliega en el homelab de alguien,
// eso vale mas que el ultimo punto de teoria.

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derivar = promisify(scrypt) as (
  clave: string | Buffer,
  sal: Buffer,
  largo: number,
  opciones: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * El coste. N es el que manda: subirlo al doble dobla el tiempo y la memoria.
 *
 * 2^15 pide 32 MB y tarda unos 100 ms. Es el punto en el que probar
 * contrasenas sale caro y entrar sigue siendo instantaneo para quien tiene la
 * suya. Van escritos dentro de cada resumen, asi que subirlos mas adelante no
 * deja fuera a quien ya tenia cuenta.
 */
const N = 2 ** 15;
const R = 8;
const P = 1;
const LARGO = 64;
const SAL = 16;

/** El doble de lo que pide scrypt: sin margen, Node se niega a calcular. */
const MAXMEM = 128 * N * R * 2;

/**
 * Convierte una contrasena en algo que se puede guardar.
 *
 * La sal es distinta para cada cuenta, y por eso dos personas con la misma
 * contrasena tienen resumenes distintos: sin ella, una tabla hecha de
 * antemano valdria para toda la base de golpe.
 */
export const resumirClave = async (clave: string): Promise<string> => {
  const sal = randomBytes(SAL);
  const resumen = await derivar(clave.normalize('NFKC'), sal, LARGO, { N, r: R, p: P, maxmem: MAXMEM });
  return ['scrypt', N, R, P, sal.toString('base64'), resumen.toString('base64')].join('$');
};

/**
 * Si una contrasena es la que genero ese resumen.
 *
 * La comparacion es de tiempo constante. Comparar con === tarda menos cuando
 * los primeros bytes no coinciden, y esa diferencia -microsegundos- basta para
 * ir adivinando el resumen byte a byte desde fuera.
 */
export const claveCorrecta = async (clave: string, guardado: string): Promise<boolean> => {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;

  const n = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Un resumen con parametros disparatados solo puede venir de una base
  // manipulada, y calcularlo seria quedarse sin memoria obedeciendola.
  if (n > 2 ** 20 || r > 32 || p > 16) return false;

  let esperado: Buffer;
  let sal: Buffer;
  try {
    sal = Buffer.from(partes[4] ?? '', 'base64');
    esperado = Buffer.from(partes[5] ?? '', 'base64');
  } catch {
    return false;
  }
  if (sal.length === 0 || esperado.length === 0) return false;

  const calculado = await derivar(clave.normalize('NFKC'), sal, esperado.length, {
    N: n,
    r,
    p,
    maxmem: 128 * n * r * 2,
  });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
};

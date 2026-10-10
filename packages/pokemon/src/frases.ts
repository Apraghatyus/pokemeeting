// Buscar una frase del juego en la memoria.
//
// Hay cosas que no se pueden leer de una direccion -si has perdido, si has
// entrado en el Salon de la Fama- pero que el juego **dice en voz alta**. Esas
// frases son una señal limpisima: las escribe el propio juego en el momento
// exacto en que da el hecho por bueno.
//
// Y se pueden leer por un motivo concreto: los mensajes que llevan tu nombre
// dentro no se pueden pintar directos desde la ROM, porque el nombre lo eliges
// tu. El juego tiene que **montar la frase entera en memoria** sustituyendo el
// hueco, y mientras la enseña, ahi esta.
//
// Dos reglas para elegir un ancla, y las dos salen de haberse equivocado antes:
//
//   1. Sin el nombre del jugador: lo unico que se puede dar por fijo es lo que
//      viene alrededor.
//   2. Comprobada contra la ROM de verdad, y que salga **una sola vez** en los
//      dieciseis megas. Un ancla que aparece en varios sitios da falsos
//      positivos, y aqui un falso positivo le da a alguien una partida por
//      terminada sin estarlo.

import { leerCabecera, region } from './savestate';

const may = (c: string): number => 0xbb + c.charCodeAt(0) - 65;
const min = (c: string): number => 0xd5 + c.charCodeAt(0) - 97;

/**
 * Pasa un trozo de texto normal a como lo guarda el juego.
 *
 * Solo letras sin tilde, numeros y espacios. Las vocales acentuadas y la ñ
 * tienen codigos sueltos y repetidos, asi que no se usan en las anclas: una
 * frase con tilde es una frase que puede no cuadrar por el motivo equivocado.
 */
export const codificar = (texto: string): number[] =>
  [...texto].map((c) => {
    if (c >= 'A' && c <= 'Z') return may(c);
    if (c >= 'a' && c <= 'z') return min(c);
    if (c >= '0' && c <= '9') return 0xa1 + c.charCodeAt(0) - 48;
    if (c === ' ') return 0x00;
    // El punto hace falta para nombres como "LT. SURGE".
    if (c === '.') return 0xad;
    throw new Error(`no se sabe codificar "${c}"`);
  });

const contiene = (donde: Uint8Array, patron: readonly number[]): boolean => {
  const tope = donde.length - patron.length;
  for (let i = 0; i <= tope; i += 1) {
    let cuadra = true;
    for (let j = 0; j < patron.length; j += 1) {
      if (donde[i + j] !== patron[j]) {
        cuadra = false;
        break;
      }
    }
    if (cuadra) return true;
  }
  return false;
};

/**
 * Si alguna de estas frases esta ahora mismo escrita en la memoria del juego.
 *
 * Devuelve false ante cualquier duda -un estado de otra consola, uno que no se
 * sabe interpretar- porque equivocarse aqui cambia lo que se le dice al
 * jugador sobre su partida.
 */
export const diceEnPantalla = (estado: Uint8Array, patrones: readonly (readonly number[])[]): boolean => {
  try {
    leerCabecera(estado);
    const memoria = region(estado, 'ewram');
    return patrones.some((patron) => contiene(memoria, patron));
  } catch {
    return false;
  }
};

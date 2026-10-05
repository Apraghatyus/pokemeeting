// Reconocer la derrota por lo que dice el juego, no por la vida del equipo.
//
// Cuando se te cae el equipo entero, el juego enseña un mensaje: "<nombre> fue
// corriendo a un CENTRO PKMN para curar a sus agotados POKEMON...". Ese texto es
// la señal mas limpia que hay de que la partida se ha perdido, por dos razones:
//
//   1. Lo dice el propio juego, en el momento exacto en que da la derrota por
//      buena. No hay que interpretar nada.
//   2. Mirar la vida del equipo tiene una ventana muy corta: al perder, el juego
//      te cura en el Centro Pokemon, asi que "todos a cero" dura unos segundos.
//      Entre dos lecturas se puede escapar.
//
// Y se puede leer porque el mensaje lleva **tu nombre dentro**: para
// sustituirlo, el juego tiene que armar la frase en memoria en vez de pintarla
// directamente desde la ROM. Asi que la frase montada esta en EWRAM mientras se
// enseña.
//
// Lo que NO es: una deteccion de combate. Esto solo sabe de una pantalla
// concreta. Saber si hay un combate en marcha sigue pendiente.

import { leerCabecera, region } from './savestate';

/**
 * Trozos del mensaje de derrota, por idioma.
 *
 * Se busca un trozo corto y SIN el nombre del jugador: el nombre lo elige cada
 * uno, asi que lo unico que se puede dar por fijo es lo que viene despues.
 *
 * Comprobado contra la ROM espanola de Rojo Fuego: "corriendo a un" aparece una
 * sola vez en los dieciseis megas, asi que como ancla no se confunde con nada.
 */
const FRASES: readonly string[] = ['corriendo a un', 'running to a'];

const may = (c: string): number => 0xbb + c.charCodeAt(0) - 65;
const min = (c: string): number => 0xd5 + c.charCodeAt(0) - 97;

/** Pasa un trozo de texto normal a como lo guarda el juego. */
const codificar = (texto: string): number[] =>
  [...texto].map((c) => {
    if (c >= 'A' && c <= 'Z') return may(c);
    if (c >= 'a' && c <= 'z') return min(c);
    if (c === ' ') return 0x00;
    throw new Error(`no se sabe codificar "${c}"`);
  });

const PATRONES = FRASES.map(codificar);

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
 * Si el juego esta enseñando ahora mismo el mensaje de haber perdido.
 *
 * Devuelve false ante cualquier duda -un estado de otra consola, un idioma que
 * no se conoce- porque equivocarse aqui significa darle a alguien una partida
 * por terminada sin estarlo.
 */
export const enDerrota = (estado: Uint8Array): boolean => {
  try {
    leerCabecera(estado);
    const memoria = region(estado, 'ewram');
    return PATRONES.some((patron) => contiene(memoria, patron));
  } catch {
    return false;
  }
};

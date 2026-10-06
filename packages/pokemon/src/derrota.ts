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

import { codificar, diceEnPantalla } from './frases';

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

const PATRONES = FRASES.map(codificar);

/**
 * Si el juego esta ensenando ahora mismo el mensaje de haber perdido.
 *
 * Devuelve false ante cualquier duda -un estado de otra consola, un idioma que
 * no se conoce- porque equivocarse aqui significa darle a alguien una partida
 * por terminada sin estarlo.
 */
export const enDerrota = (estado: Uint8Array): boolean => diceEnPantalla(estado, PATRONES);

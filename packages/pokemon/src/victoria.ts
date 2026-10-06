// Cuando se ha completado el reto.
//
// El final bueno de una Nuzlocke es el Salon de la Fama. Y el juego lo canta:
// al entrar, el profesor OAK suelta un mensaje que empieza por "Enhorabuena,
// <tu nombre>!" y sigue con "En este piso esta el HALL de la FAMA de los
// POKeMON!".
//
// Ese mensaje cumple las dos condiciones que hacen falta para leerlo (ver
// `frases.ts`): lleva el nombre del jugador dentro -tres veces, de hecho- asi
// que el juego tiene que montarlo entero en memoria, y dentro de el hay un
// trozo que no se repite en ningun otro sitio.
//
// COMPROBADO contra la ROM espanola de Rojo Fuego: la cadena entera son 316
// bytes en 0x179563, con tres huecos de nombre, y el trozo "FAMA de los"
// aparece **una sola vez** en los dieciseis megas. Se probaron otros trozos mas
// evidentes y ninguno vale: "HALL de la" sale 7 veces y "HALL" 16, porque el
// Salon se menciona tambien en la tarjeta de entrenador y en los dialogos de
// antes de la Liga. Uno de esos habria dado la partida por ganada al leer un
// cartel.
//
// Lo que esto NO es: un marcador de cuanto has avanzado en la Liga. Solo sabe
// de esta pantalla. Saber por que miembro del Alto Mando vas sigue pendiente,
// porque eso si son banderas y hay que localizarlas.

import { codificar, diceEnPantalla } from './frases';

/**
 * Trozos del mensaje del Salon de la Fama, por idioma.
 *
 * Solo esta el espanol, y es a proposito: es el unico que se ha podido
 * comprobar contra su ROM. Para anadir otro idioma hay que repetir la
 * comprobacion con la ROM de ese idioma y quedarse con un trozo que salga una
 * sola vez. Poner "el que dice internet" sin contar las veces que aparece es
 * justo como se cuelan los falsos positivos.
 */
const FRASES: readonly string[] = ['FAMA de los'];

const PATRONES = FRASES.map(codificar);

/** Si el juego esta ensenando ahora mismo la entrada al Salon de la Fama. */
export const enSalonDeLaFama = (estado: Uint8Array): boolean =>
  diceEnPantalla(estado, PATRONES);

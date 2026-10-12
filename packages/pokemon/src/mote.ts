// Cambiarle el mote a un Pokemon del equipo, dentro de la partida.
//
// La mitad dificil ya estaba hecha para la evolucion al intercambiar: escribir
// el mote en el bloque (`escribirMote`, sin tocar el checksum porque el mote no
// va cifrado) y meter un bloque cambiado en el estado (`escribirEnRanura`). Lo
// que se anade aqui es encontrar al Pokemon por su personalidad y juntar las
// dos cosas.
//
// No se hace en mitad de un combate: el juego tiene ahi su propia copia del que
// pelea, con su mote, y cargar un estado editado en combate es como se rompe
// una partida. Quien llama lo comprueba antes.

import { escribirMote } from './gen3';
import { escribirEnRanura, localizarEquipo } from './equipo';
import { leerCabecera } from './savestate';

/**
 * El estado con el mote cambiado, o null si ese Pokemon no esta en el equipo.
 *
 * @param mote los bytes ya en el juego de caracteres (`codificarTexto`)
 */
export const cambiarMoteEnEstado = (
  estado: Uint8Array,
  personalidad: number,
  mote: Uint8Array,
): Uint8Array | null => {
  const equipo = localizarEquipo(estado, undefined, leerCabecera(estado).codigoJuego);
  const ranura = equipo?.ranuras.find((r) => r.pokemon.personalidad === personalidad);
  if (!equipo || !ranura) return null;
  return escribirEnRanura(estado, equipo.direccion, ranura.indice, escribirMote(ranura.bloque, mote));
};

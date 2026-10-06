// En que orden se ensena el equipo, y a quien se ilumina.
//
// AQUI HUBO UN ORDEN "ESTABLE" Y SE HA QUITADO. La idea era que el panel no se
// barajara solo: se recordaba el orden en que habian aparecido y se colocaban
// siempre asi, pasara lo que pasara en memoria. Se construyo sobre la idea de
// que tercera generacion sube a la ranura 0 al que sale a pelear.
//
// Las dos cosas estaban mal, y lo enseno una partida de verdad: el equipo en el
// juego era [PEZGATO, A BUENO], el panel ensenaba [A BUENO, PEZGATO], y el
// resaltado senalaba a PEZGATO mientras peleaba A BUENO. O sea que el orden
// "estable" no protegia de nada -el juego no mueve las ranuras- y ademas hacia
// que el panel no se pareciera a la lista del propio juego.
//
// Asi que el orden es el del juego, y ya esta. Es el unico que se puede
// comprobar mirando la pantalla, que es lo que hace el jugador.
//
// Y quien pelea se lee aparte, buscando la copia de combate por personalidad
// (ver `quienPelea` en el paquete de dominio). Si no hay combate, no se ilumina
// a nadie: una marca permanente sobre el primero no dice nada.

import type { EquipoResumen, PokemonResumen } from '@emupoke/protocol';

export type EquipoOrdenado = {
  /** Los mismos Pokemon, en el orden en que los tiene el juego. */
  ranuras: PokemonResumen[];
  /**
   * La personalidad del que esta peleando, o null si no hay combate.
   *
   * Se dice por personalidad y no por ranura. La ranura es un sitio, y el que
   * pelea no esta en un sitio fijo: eso fue justo el fallo.
   */
  alFrente: number | null;
};

/**
 * Coloca el equipo como lo tiene el juego.
 *
 * El lector ya los devuelve en orden, pero se ordena igualmente: el equipo del
 * companero llega por la red, y lo que llega de fuera no se da por ordenado.
 */
export const ordenarComoElJuego = (equipo: EquipoResumen | null): EquipoOrdenado => {
  if (!equipo || equipo.ranuras.length === 0) return { ranuras: [], alFrente: null };

  return {
    ranuras: [...equipo.ranuras].sort((a, b) => a.ranura - b.ranura),
    alFrente: equipo.peleando ?? null,
  };
};

/** El equipo listo para pintar. */
export const useEquipoOrdenado = (
  equipo: EquipoResumen | null,
): { equipo: EquipoResumen | null; alFrente: number | null } => {
  const colocado = ordenarComoElJuego(equipo);

  return {
    equipo: equipo ? { ...equipo, ranuras: colocado.ranuras } : null,
    alFrente: colocado.alFrente,
  };
};

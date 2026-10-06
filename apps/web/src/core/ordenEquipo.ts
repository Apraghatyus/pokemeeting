// En que orden se ensena el equipo, y a quien se ilumina.
//
// La regla tiene UNA frase: fuera de combate manda el juego, y dentro de
// combate no se mueve nada.
//
// Y las dos mitades vienen de dos quejas distintas, que parecian contrarias y
// no lo eran:
//
//   - "El panel no se parece a la lista del juego". Cierto: aqui hubo un orden
//     propio que recordaba como habian aparecido, y acababa ensenando un reparto
//     que no coincidia con el del juego ni cuando el jugador lo reordenaba a
//     mano. Por eso fuera de combate se sigue al juego y punto.
//   - "No se debe reorganizar cuando entre en combate y pulse POKeMON". Tambien
//     cierto: durante un combate el juego mueve las ranuras por su cuenta, asi
//     que seguirlas ahi hace que el panel se baraje solo justo cuando el jugador
//     esta mirando otra cosa.
//
// Lo que las concilia es saber cuando hay combate, que antes no se sabia. Ahora
// si: viene con el equipo, medido de la memoria de cada partida.
//
// Si de un juego no se sabe -porque su bandera de combate no esta medida- se
// sigue al juego. Es la opcion que deja funcionando lo que el jugador SI
// controla, que es reordenar su equipo a mano.

import { useRef } from 'react';
import type { EquipoResumen, PokemonResumen } from '@emupoke/protocol';

export type EquipoOrdenado = {
  /** Los mismos Pokemon, en el orden en que toca ensenarlos. */
  ranuras: PokemonResumen[];
  /**
   * La personalidad del que esta peleando, o null si no hay combate.
   *
   * Se dice por personalidad y no por ranura. La ranura es un sitio, y el que
   * pelea no esta en un sitio fijo: eso fue justo el fallo que hubo aqui.
   */
  alFrente: number | null;
  /** El orden aprendido, para pasarselo a la siguiente lectura. */
  orden: number[];
};

const porRanura = (ranuras: readonly PokemonResumen[]): PokemonResumen[] =>
  [...ranuras].sort((a, b) => a.ranura - b.ranura);

/**
 * Coloca el equipo.
 *
 * @param equipo  lo que dice la memoria ahora mismo
 * @param previo  personalidades en el orden en que se estaban ensenando
 */
export const ordenarComoElJuego = (
  equipo: EquipoResumen | null,
  previo: readonly number[] = [],
): EquipoOrdenado => {
  if (!equipo || equipo.ranuras.length === 0) {
    // El orden aprendido se conserva aunque la lectura venga vacia: no haber
    // podido leer no es lo mismo que haberse quedado sin equipo.
    return { ranuras: [], alFrente: null, orden: [...previo] };
  }

  const alFrente = equipo.peleando ?? null;

  // Fuera de combate, y cuando no se sabe, manda el juego.
  if (equipo.enCombate !== true) {
    const ranuras = porRanura(equipo.ranuras);
    return { ranuras, alFrente, orden: ranuras.map((r) => r.personalidad) };
  }

  // En combate: se mantiene el orden que ya se estaba ensenando. Se identifican
  // por personalidad, los cuatro bytes que no cambian nunca; el mote no vale
  // -dos pueden llamarse igual- y la especie tampoco.
  const porPersonalidad = new Map(equipo.ranuras.map((r) => [r.personalidad, r]));
  const ranuras: PokemonResumen[] = [];

  for (const personalidad of previo) {
    const ranura = porPersonalidad.get(personalidad);
    if (!ranura) continue;
    ranuras.push(ranura);
    porPersonalidad.delete(personalidad);
  }

  // Lo que no estuviera en el orden anterior entra al final, por su ranura. Es
  // el caso de capturar en mitad de un combate.
  for (const ranura of porRanura([...porPersonalidad.values()])) ranuras.push(ranura);

  return { ranuras, alFrente, orden: ranuras.map((r) => r.personalidad) };
};

/**
 * El equipo listo para pintar, recordando el orden entre lecturas.
 *
 * El orden vive en una ref y no en el estado: cambiarlo no tiene que provocar un
 * repintado por si mismo, solo acompanar al equipo que ya lo provoca.
 */
export const useEquipoOrdenado = (
  equipo: EquipoResumen | null,
): { equipo: EquipoResumen | null; alFrente: number | null } => {
  const orden = useRef<number[]>([]);

  const colocado = ordenarComoElJuego(equipo, orden.current);
  orden.current = colocado.orden;

  return {
    equipo: equipo ? { ...equipo, ranuras: colocado.ranuras } : null,
    alFrente: colocado.alFrente,
  };
};

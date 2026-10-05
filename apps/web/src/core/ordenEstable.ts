// El orden en que se enseña el equipo, y quién va al frente.
//
// Tercera generación **intercambia de verdad las ranuras del equipo** cuando
// sacas otro Pokémon en combate: el que entra pasa a ser el primero. No es una
// suposición, se ve en el propio juego: un Marowak que estaba el cuarto aparece
// el primero en cuanto sale a pelear.
//
// Eso tiene dos consecuencias, y las dos se resuelven aquí:
//
//   1. El panel se barajaba solo en mitad de un combate, porque estaba leyendo
//      bien una memoria que se mueve. Se arregla recordando el orden en que
//      aparecieron y colocándolos siempre así, no por la ranura.
//   2. A cambio, la ranura 0 pasa a ser un dato útil: durante un combate, el
//      que está ahí **es** el que está peleando. Por eso no hace falta detectar
//      el combate para iluminarlo, que es justo lo que bloqueaba esto antes.
//
// Se identifican por personalidad, los cuatro bytes que no cambian nunca. El
// mote no vale -dos pueden llamarse igual- y la especie tampoco.

import { useRef } from 'react';
import type { EquipoResumen, PokemonResumen } from '@emupoke/protocol';

export type EquipoOrdenado = {
  /** Los mismos Pokémon, en el orden en que el jugador los conoce. */
  ranuras: PokemonResumen[];
  /**
   * Qué ranura de memoria va al frente, o null si no hay equipo.
   *
   * Es siempre 0: lo que cambia es quién está ahí. Se devuelve como número y no
   * como booleano porque quien pinta compara contra `ranura`, que es la posición
   * real en memoria y no la de la pantalla.
   */
  alFrente: number | null;
  /** El orden aprendido, para pasárselo a la siguiente lectura. */
  orden: number[];
};

/**
 * Coloca el equipo en un orden que no se mueva solo.
 *
 * @param equipo  lo que dice la memoria ahora mismo
 * @param previo  personalidades en el orden en que se vieron hasta ahora
 */
export const ordenarEstable = (
  equipo: EquipoResumen | null,
  previo: readonly number[],
): EquipoOrdenado => {
  if (!equipo || equipo.ranuras.length === 0) {
    // El orden aprendido se conserva aunque el equipo venga vacío: una lectura
    // que no encontró nada no es lo mismo que un equipo que se vació.
    return { ranuras: [], alFrente: null, orden: [...previo] };
  }

  const porPersonalidad = new Map(equipo.ranuras.map((r) => [r.personalidad, r]));

  // Primero los que ya conocíamos, en el orden de siempre. Los que ya no están
  // se caen solos al no encontrarlos.
  const ordenados: PokemonResumen[] = [];
  const orden: number[] = [];
  for (const personalidad of previo) {
    const ranura = porPersonalidad.get(personalidad);
    if (!ranura) continue;
    ordenados.push(ranura);
    orden.push(personalidad);
    porPersonalidad.delete(personalidad);
  }

  // Y después los nuevos, por su ranura: al capturar, el juego lo mete en el
  // primer hueco libre, y ahí sí manda la ranura.
  const nuevos = [...porPersonalidad.values()].sort((a, b) => a.ranura - b.ranura);
  for (const ranura of nuevos) {
    ordenados.push(ranura);
    orden.push(ranura.personalidad);
  }

  return { ranuras: ordenados, alFrente: 0, orden };
};

/**
 * El equipo listo para pintar, recordando el orden entre lecturas.
 *
 * El orden vive en una ref y no en el estado: cambiarlo no tiene que provocar
 * un repintado por si mismo, solo acompañar al equipo que ya lo provoca.
 */
export const useEquipoOrdenado = (equipo: EquipoResumen | null): {
  equipo: EquipoResumen | null;
  alFrente: number | null;
} => {
  const orden = useRef<number[]>([]);

  const colocado = ordenarEstable(equipo, orden.current);
  orden.current = colocado.orden;

  return {
    equipo: equipo ? { ...equipo, ranuras: colocado.ranuras } : null,
    alFrente: colocado.alFrente,
  };
};

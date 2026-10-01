// Que especie es cada numero, segun TU copia del juego: como se llama y que
// numero tiene en la Pokedex nacional.
//
// Los nombres salen de la ROM que tiene cada jugador, no de una lista nuestra,
// y eso es lo que hace que funcione tambien con copias aleatorizadas: el
// randomizer cambia los datos de cada especie, no como se llama.
//
// Tambien es lo que mantiene limpia la frontera con el companero. Por el cable
// viaja el numero de especie, y el nombre lo pone este lado. Asi su equipo se
// ve con nombres correctos sin que su ROM haya tenido que salir de su
// ordenador, ni la nuestra de aqui.

import { useEffect, useMemo, useRef } from 'react';
import { encontrarTablaDex, encontrarTablaEstadisticas, encontrarTablaNombres } from '@emupoke/pokemon';

export type Especies = {
  nombre: (especie: number) => string;
  /**
   * El numero de la Pokedex nacional, o 0 si no se sabe.
   *
   * Hace falta para los sprites, que fuera del juego se nombran asi. La
   * conversion no es una resta aunque lo parezca -la especie interna 411 es
   * CHIMECHO, la 358 nacional, no la 386- y la tabla buena esta en la ROM.
   */
  nacional: (especie: number) => number;
  /**
   * Sus dos tipos, leidos de la ROM.
   *
   * De la ROM y no de una lista de internet porque el randomizer los cambia:
   * una lista diria el tipo de siempre y seria falso en media partida.
   */
  tipos: (especie: number) => readonly [number, number] | null;
};

/**
 * @param romBytesRef la ROM que corre ahora, si hay alguna
 * @param romName     para rehacer la tabla al cambiar de juego
 */
export const useEspecies = (
  romBytesRef: { current: Uint8Array | null },
  romName: string | null,
): Especies => {
  const nombresRef = useRef<((especie: number) => string) | null>(null);
  const dexRef = useRef<((especie: number) => number) | null>(null);
  const tiposRef = useRef<((especie: number) => readonly [number, number] | null) | null>(null);
  const buscadaRef = useRef(false);

  useEffect(() => {
    // Al cambiar de juego, las tablas anteriores ya no valen.
    nombresRef.current = null;
    dexRef.current = null;
    tiposRef.current = null;
    buscadaRef.current = false;
  }, [romName]);

  return useMemo(() => {
    // Localizar las tablas obliga a recorrer la ROM entera, asi que se hace una
    // sola vez por juego y la primera vez que alguien pregunta, no al cargar:
    // asi no se nota mientras arranca la partida.
    const asegurar = () => {
      if (buscadaRef.current) return;
      buscadaRef.current = true;
      const rom = romBytesRef.current;
      if (!rom) return;
      nombresRef.current = encontrarTablaNombres(rom)?.nombre ?? null;
      dexRef.current = encontrarTablaDex(rom)?.nacional ?? null;
      const stats = encontrarTablaEstadisticas(rom);
      tiposRef.current = stats ? (especie) => stats.estadisticas(especie)?.tipos ?? null : null;
    };

    return {
      // Sin tabla -una ROM que no sabemos leer- se enseña el numero. Es feo,
      // pero es verdad, y es mejor que inventarse un nombre.
      nombre: (especie: number) => {
        asegurar();
        return nombresRef.current?.(especie) ?? `#${especie}`;
      },
      // Sin tabla, 0: quien pinta el sprite sabe que entonces no hay sprite.
      nacional: (especie: number) => {
        asegurar();
        return dexRef.current?.(especie) ?? 0;
      },
      tipos: (especie: number) => {
        asegurar();
        return tiposRef.current?.(especie) ?? null;
      },
    };
  }, [romBytesRef, romName]);
};

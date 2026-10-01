// Como se llama cada especie, segun TU copia del juego.
//
// Los nombres salen de la ROM que tiene cada jugador, no de una lista nuestra,
// y eso es lo que hace que funcione tambien con copias aleatorizadas: el
// randomizer cambia los datos de cada especie, no como se llama.
//
// Tambien es lo que mantiene limpia la frontera con el companero. Por el cable
// viaja el numero de especie, y el nombre lo pone este lado. Asi su equipo se
// ve con nombres correctos sin que su ROM haya tenido que salir de su
// ordenador, ni la nuestra de aqui.

import { useCallback, useEffect, useRef } from 'react';
import { encontrarTablaNombres } from '@emupoke/pokemon';

/**
 * @param romBytesRef la ROM que corre ahora, si hay alguna
 * @param romName     para rehacer la tabla al cambiar de juego
 */
export const useNombresEspecie = (
  romBytesRef: { current: Uint8Array | null },
  romName: string | null,
): ((especie: number) => string) => {
  const tablaRef = useRef<((especie: number) => string) | null>(null);
  const buscadaRef = useRef(false);

  useEffect(() => {
    // Al cambiar de juego, la tabla anterior ya no vale.
    tablaRef.current = null;
    buscadaRef.current = false;
  }, [romName]);

  return useCallback(
    (especie: number): string => {
      // Localizar la tabla obliga a recorrer la ROM entera, asi que se hace una
      // sola vez por juego y la primera vez que alguien pregunta un nombre, no
      // al cargar: asi no se nota mientras arranca la partida.
      if (!buscadaRef.current) {
        buscadaRef.current = true;
        const rom = romBytesRef.current;
        tablaRef.current = rom ? (encontrarTablaNombres(rom)?.nombre ?? null) : null;
      }

      // Sin tabla -una ROM que no sabemos leer- se enseña el numero. Es feo,
      // pero es verdad, y es mejor que inventarse un nombre.
      return tablaRef.current?.(especie) ?? `#${especie}`;
    },
    [romBytesRef],
  );
};

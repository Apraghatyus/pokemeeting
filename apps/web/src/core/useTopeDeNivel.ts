// Hasta que nivel se puede subir antes del proximo gimnasio.
//
// Es una regla de la comunidad, no del juego: nadie lleva un Pokemon por encima
// del mas alto del lider que toca. Sin ella basta con machacar hierba alta hasta
// que el reto desaparece, asi que en una Nuzlocke es de las que mas se usan. Y
// lo que la hace incomoda de cumplir a mano es justo esto: hay que acordarse del
// numero, y en una copia aleatorizada el numero no es el de siempre.
//
// De ahi que se lea de la ROM. Ver `lideres.ts` para como se encuentra.
//
// POR QUE SE ESPERA UN POCO ANTES DE LEERLA. Recorrer la ROM cuesta unos 85 ms
// de hilo principal, y medidos en el unico sitio donde eso importa -un movil
// viejo- caen justo cuando el juego esta arrancando, que es el momento en que
// peor se nota un tiron. Como el tope no hace falta hasta que se mire el equipo,
// se calcula un rato despues y una sola vez por partida.

import { useEffect, useState } from 'react';
import { topesDeLosLideres, topeSiguiente, type TopeDeNivel } from '@emupoke/pokemon';

/** Lo que se espera desde que arranca la partida antes de recorrer la ROM. */
const ESPERA_MS = 4000;

/**
 * @param romBytesRef la ROM que corre ahora, si hay alguna
 * @param romName     para rehacer el calculo al cambiar de juego
 * @param jugando     no hay nada que leer sin partida en marcha
 * @param medallas    cuantas lleva, o null si todavia no se sabe
 */
export const useTopeDeNivel = (
  romBytesRef: { current: Uint8Array | null },
  romName: string | null,
  jugando: boolean,
  medallas: number | null,
): TopeDeNivel | null => {
  const [topes, setTopes] = useState<number[] | null>(null);

  useEffect(() => {
    // Los topes del juego anterior no valen para este.
    setTopes(null);
    if (!jugando) return;

    const cuando = setTimeout(() => {
      const rom = romBytesRef.current;
      if (!rom) return;
      setTopes(topesDeLosLideres(rom));
    }, ESPERA_MS);
    return () => clearTimeout(cuando);
  }, [romBytesRef, romName, jugando]);

  // Sin medallas leidas no se sabe que gimnasio toca, y adivinar el primero
  // seria mentir a quien lleva cuatro. Mejor no decir nada.
  if (medallas === null) return null;
  return topeSiguiente(topes, medallas);
};

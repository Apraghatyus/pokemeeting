// Cuándo se acabó el reto.
//
// En una Nuzlocke o un Soul Link la partida termina cuando se te cae el equipo
// entero. El juego no lo sabe: tú pierdes, vuelves al Centro Pokémon y la
// aventura sigue. O sea que esto no es leer un dato, es **aplicar una regla**,
// y por eso vive aquí y no en el lector de memoria.
//
// Eso tiene una consecuencia que conviene tener presente: el final lo decide
// esta regla, así que si la regla se equivoca, al jugador le aparece un cartel
// de "se acabó" en mitad de una partida que no se ha acabado. De ahí las dos
// precauciones de abajo.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EquipoResumen } from '@emupoke/protocol';

/**
 * Cuántos Pokémon distintos hay que haber tenido para que la regla se active.
 *
 * Dos, y no uno, por el combate del laboratorio: el primero del juego es un
 * tutorial contra tu rival en el que solo tienes al inicial, y perderlo ahí no
 * acaba con nada. Exigiendo dos, ese combate queda fuera por construcción, sin
 * tener que reconocerlo ni saber en qué mapa estás.
 *
 * El precio es el caso raro de quien se deje debilitar al inicial antes de
 * capturar nada: ahí no saltaría. En una Nuzlocke se captura en la primera ruta,
 * así que es un hueco estrecho, y prefiero un hueco a un cartel falso.
 */
const MINIMO_PARA_CONTAR = 2;

export type FinDePartida = {
  /** Si hay que enseñar el cartel ahora mismo. */
  terminada: boolean;
  /** El equipo tal y como quedó, para poder enseñarlo aunque luego cambie. */
  equipoFinal: EquipoResumen | null;
  /**
   * Si esta partida siguió jugándose después de caer.
   *
   * Importa para las estadísticas: lo que venga después de un fin de partida no
   * puede contar, porque si contara bastaría con seguir hasta ganar.
   */
  continuada: boolean;
  /** "Seguir jugando": cierra el cartel y marca la partida como continuada. */
  continuar: () => void;
  /** Cierra el cartel sin dar nada por terminado. Para un falso positivo. */
  descartar: () => void;
};

type Guardado = {
  /** Personalidades distintas vistas en el equipo. De aquí sale el mínimo. */
  vistos: number[];
  /** Si ya se dio por terminada, para no repetir el cartel en cada lectura. */
  terminada: boolean;
  continuada: boolean;
};

const VACIO: Guardado = { vistos: [], terminada: false, continuada: false };

const clave = (partida: string) => `emupoke.fin.${partida}`;

const leer = (partida: string): Guardado => {
  try {
    const crudo = localStorage.getItem(clave(partida));
    if (!crudo) return { ...VACIO };
    const guardado = JSON.parse(crudo) as Partial<Guardado>;
    return {
      vistos: Array.isArray(guardado.vistos) ? guardado.vistos : [],
      terminada: guardado.terminada === true,
      continuada: guardado.continuada === true,
    };
  } catch {
    return { ...VACIO };
  }
};

const escribir = (partida: string, estado: Guardado): void => {
  try {
    localStorage.setItem(clave(partida), JSON.stringify(estado));
  } catch {
    // Sin almacenamiento la regla vale para esta sesion y ya. No es critico:
    // lo peor que pasa es que el cartel vuelva a salir al recargar.
  }
};

/** Si todos los que hay están debilitados. Sin Pokémon no hay nada que decidir. */
const equipoCaido = (equipo: EquipoResumen | null): boolean => {
  const vivos = equipo?.ranuras ?? [];
  if (vivos.length === 0) return false;
  // Un huevo no cuenta ni a favor ni en contra: no pelea y no se debilita.
  const pelean = vivos.filter((r) => !r.huevo);
  if (pelean.length === 0) return false;
  return pelean.every((r) => r.estado === 'debilitado');
};

/**
 * @param equipo   el equipo tal y como se está leyendo ahora
 * @param partida  con qué partida se asocia esto; al cambiar, se empieza de cero
 */
export const useFinDePartida = (
  equipo: EquipoResumen | null,
  partida: string | null,
): FinDePartida => {
  const [estado, setEstado] = useState<Guardado>(VACIO);
  const [equipoFinal, setEquipoFinal] = useState<EquipoResumen | null>(null);
  const [descartada, setDescartada] = useState(false);

  // Al cambiar de partida no vale nada de lo aprendido de la anterior.
  useEffect(() => {
    setEstado(partida ? leer(partida) : VACIO);
    setEquipoFinal(null);
    setDescartada(false);
    decidido.current = false;
  }, [partida]);

  // El equipo cambia en cada lectura; se mira por referencia para no reaccionar
  // a lecturas que dicen lo mismo.
  const ultimo = useRef<EquipoResumen | null>(null);

  useEffect(() => {
    if (!partida || !equipo) return;
    if (ultimo.current === equipo) return;
    ultimo.current = equipo;

    setEstado((previo) => {
      // Se apuntan los que van apareciendo. La personalidad no cambia nunca, asi
      // que sirve para contar Pokemon distintos aunque entren y salgan del equipo.
      const vistos = new Set(previo.vistos);
      for (const ranura of equipo.ranuras) {
        if (!ranura.huevo) vistos.add(ranura.personalidad);
      }

      const siguiente: Guardado = {
        ...previo,
        vistos: [...vistos],
        terminada:
          previo.terminada ||
          (vistos.size >= MINIMO_PARA_CONTAR && equipoCaido(equipo)),
      };

      // Guardar el equipo del momento exacto: despues el jugador revive a
      // alguno en el Centro Pokemon y el cartel enseñaria algo que ya no fue.
      if (siguiente.terminada && !previo.terminada) setEquipoFinal(equipo);

      return siguiente;
    });
  }, [equipo, partida]);

  // Se guarda aqui y no dentro del updater: un updater tiene que ser puro, y
  // guardando desde fuera no hay forma de escribir un estado a medias.
  useEffect(() => {
    if (!partida) return;
    if (estado === VACIO) return;
    escribir(partida, estado);
  }, [partida, estado]);

  /**
   * Si el jugador ya eligio, para que cerrar el dialogo no vuelva a decidir.
   *
   * Hace falta por como funciona un <dialog>: al cerrarse dispara su evento
   * `close`, y ese evento esta atado a `descartar`. Sin esta marca, pulsar
   * "seguir jugando" cerraba el cartel y el cierre llamaba a descartar acto
   * seguido, que borraba la marca de terminada justo despues de ponerla. O sea
   * que la partida seguia contando para las estadisticas.
   */
  const decidido = useRef(false);

  const continuar = useCallback(() => {
    decidido.current = true;
    setDescartada(true);
    setEstado((previo) => ({ ...previo, continuada: true }));
  }, []);

  /**
   * Para un falso positivo: se cierra y se olvida que paso.
   *
   * Hace falta porque la regla puede equivocarse -las cajas no se leen, asi que
   * quien tenga Pokemon sanos guardados veria un fin de partida que no lo es- y
   * cuando se equivoca, el jugador necesita poder zanjarlo.
   */
  const descartar = useCallback(() => {
    // Si ya se eligio seguir o reiniciar, esto es solo el cierre del dialogo.
    if (decidido.current) return;
    decidido.current = true;
    setDescartada(true);
    setEstado((previo) => ({ ...previo, terminada: false }));
    setEquipoFinal(null);
  }, []);

  return {
    // Ya decidido, no se vuelve a preguntar: `continuada` sobrevive a recargar
    // la pagina, y sin mirarlo el cartel salia otra vez en cada arranque.
    terminada: estado.terminada && !estado.continuada && !descartada,
    equipoFinal,
    continuada: estado.continuada,
    continuar,
    descartar,
  };
};

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

// Aquí hubo una regla que exigía haber tenido DOS Pokémon distintos, para que
// el combate del laboratorio -donde solo tienes al inicial- quedara fuera por
// construcción.
//
// Estaba mal, y lo demostró el primero que lo jugó: salió con su inicial a
// buscar el segundo, se lo debilitaron antes de capturar nada, y el cartel no
// apareció. Perder antes de la primera captura no es un caso raro: es de las
// formas más normales de que se acabe una Nuzlocke.
//
// Así que la regla es la simple: si lo que tienes está debilitado, se acabó.
// El combate del laboratorio puede dar un cartel de más, y para eso está la ✕,
// que lo cierra sin dar nada por terminado. Un cartel de más se quita con un
// clic; un final que no se reconoce deja la partida contando como viva.

export type FinDePartida = {
  /** Si hay que enseñar el cartel ahora mismo. */
  terminada: boolean;
  /**
   * Como acabo: ganando o perdiendo.
   *
   * Por defecto 'derrota', que es el caso que se decide por regla nuestra. La
   * victoria solo se pone cuando el propio juego la canta, asi que no se
   * inventa nunca.
   */
  resultado: Resultado;
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

export type Resultado = 'victoria' | 'derrota';

type Guardado = {
  /** Como acabo, si acabo. */
  resultado: Resultado;
  /** Personalidades distintas vistas en el equipo. De aquí sale el mínimo. */
  vistos: number[];
  /** Si ya se dio por terminada, para no repetir el cartel en cada lectura. */
  terminada: boolean;
  continuada: boolean;
};

const VACIO: Guardado = { vistos: [], terminada: false, continuada: false, resultado: 'derrota' };

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
      resultado: guardado.resultado === 'victoria' ? 'victoria' : 'derrota',
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
  /**
   * Si el juego esta diciendo que has perdido.
   *
   * Es la señal buena, y la del equipo se queda como respaldo: al perder, el
   * Centro Pokemon te cura, asi que "todos a cero" dura unos segundos y entre
   * dos lecturas se puede escapar. El mensaje, en cambio, lo dice el juego en
   * el momento exacto.
   */
  derrota = false,
  /**
   * Si el juego esta diciendo que has ganado.
   *
   * Esta no es una regla nuestra como la del equipo caido: es el juego
   * ensenando el Salon de la Fama. Por eso manda sobre todo lo demas.
   */
  victoria = false,
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

      // La victoria manda: si el juego esta ensenando el Salon de la Fama, da
      // igual como este el equipo. Y lo que ya se decidio no se cambia, para
      // que una partida continuada no reescriba su propio final.
      const acabaAhora = victoria || derrota || equipoCaido(equipo);

      const siguiente: Guardado = {
        ...previo,
        vistos: [...vistos],
        terminada: previo.terminada || acabaAhora,
        resultado: previo.terminada
          ? previo.resultado
          : victoria
            ? 'victoria'
            : previo.resultado,
      };

      // Guardar el equipo del momento exacto: despues el jugador revive a
      // alguno en el Centro Pokemon y el cartel enseñaria algo que ya no fue.
      if (siguiente.terminada && !previo.terminada) setEquipoFinal(equipo);

      return siguiente;
    });
  }, [equipo, partida, derrota, victoria]);

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
    resultado: estado.resultado,
    equipoFinal,
    continuada: estado.continuada,
    continuar,
    descartar,
  };
};

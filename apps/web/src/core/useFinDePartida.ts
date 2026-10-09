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
import { parejaCaida } from '@emupoke/pokemon';

// ESTA REGLA SE HA EQUIVOCADO DOS VECES, UNA EN CADA DIRECCIÓN. Las dos están
// aquí porque la forma de la regla de ahora es la consecuencia de las dos, y sin
// ellas parece complicada de más.
//
//   1. Exigía haber tenido DOS Pokémon distintos, para que el combate del
//      laboratorio -donde solo tienes al inicial- quedara fuera por
//      construcción. Falló: alguien salió con su inicial a buscar el segundo, se
//      lo debilitaron antes de capturar nada, y no apareció nada. Perder antes
//      de la primera captura no es un caso raro: es de las formas más normales
//      de que se acabe una Nuzlocke.
//
//   2. Así que se quitó el mínimo y quedó la regla simple -si lo que tienes está
//      debilitado, se acabó-, confiando en que la ✕ limpiara el cartel de más.
//      También falló, y se vio igual de claro: el cartel salta en el combate del
//      laboratorio, encima del propio diálogo del rival. Un falso final en el
//      minuto dos no es un clic de molestia, es que el reto empieza roto.
//
// LO QUE SEPARA LOS DOS CASOS no es cuántos Pokémon tienes: es **quién lo dice**.
// Al perder de verdad, el juego te manda al Centro Pokémon y lo anuncia ("…fue
// corriendo a un CENTRO PKMN…"). Al perder en el laboratorio no pasa nada de
// eso: el rival se burla y te quedas donde estabas. O sea que el mensaje del
// juego distingue solo los dos casos, sin contar Pokémon.
//
// Así que hay dos caminos y no uno:
//
//   - **Lo dice el juego** -> se acabó, aunque solo tuvieras un Pokémon. Esto es
//     el caso (1), y es el camino bueno.
//   - **Lo deduce el equipo caído** -> respaldo, por si el mensaje no se
//     reconoce, y entonces sí se exigen dos Pokémon. Esto deja fuera el caso (2)
//     por construcción, porque en el laboratorio solo puedes tener uno.
//
// La ✕ sigue estando para lo que la regla no pueda saber -las cajas no se leen,
// así que quien guarde Pokémon sanos ahí vería un final que no lo es-, pero ya
// no se le pide que tape el combate del tutorial.

export type FinDePartida = {
  /** Si hay que enseñar el cartel ahora mismo. */
  terminada: boolean;
  /**
   * Si se acabo por el Soul Link y no por tu propia partida.
   *
   * Importa para contarlo: en ese caso tus Pokemon siguen vivos en el juego, y
   * un cartel que diga "se te cayo el equipo" no cuadra con lo que ves.
   */
  porElEnlace: boolean;
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
  /** Si lo que lo acabo fue el Soul Link y no tu propia partida. */
  porElEnlace: boolean;
  /** Personalidades distintas vistas en el equipo. De aquí sale el mínimo. */
  vistos: number[];
  /** Si ya se dio por terminada, para no repetir el cartel en cada lectura. */
  terminada: boolean;
  continuada: boolean;
};

const VACIO: Guardado = {
  vistos: [],
  terminada: false,
  continuada: false,
  resultado: 'derrota',
  porElEnlace: false,
};

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
      porElEnlace: guardado.porElEnlace === true,
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

/**
 * Cuántos Pokémon distintos hacen falta para fiarse del equipo caído.
 *
 * Dos, y el número sale de un sitio concreto: en el combate del laboratorio solo
 * puedes tener uno. No es un umbral elegido a ojo, es la forma de decir "esto no
 * es el tutorial" sin tener que reconocer el tutorial.
 *
 * Solo manda en el camino de respaldo. Cuando lo dice el juego, con uno basta.
 */
const MINIMO_PARA_DEDUCIRLO = 2;

/** Si todos los que hay están debilitados. Sin Pokémon no hay nada que decidir. */
/**
 * Si no le queda a nadie en pie, contando a los que mato el Soul Link.
 *
 * En un Soul Link los Pokemon van emparejados: si al companero se le debilita
 * el suyo, el tuyo tambien esta muerto para el reto **aunque en tu partida siga
 * vivo**. Eso no era un fin de partida y deberia serlo: puedes quedarte sin
 * nadie con quien seguir sin que tu juego se entere de nada.
 *
 * Se devuelve tambien POR QUE, porque el cartel tiene que explicarlo: decir
 * "tu equipo ha caido al completo" mientras el panel ensena un Pokemon con
 * todos sus PS es lo que confunde a quien lo ve.
 */
const equipoCaido = (
  equipo: EquipoResumen | null,
  caidosDelCompanero: ReadonlySet<string>,
): { caido: boolean; porElEnlace: boolean } => {
  const vivos = equipo?.ranuras ?? [];
  // Un huevo no cuenta ni a favor ni en contra: no pelea y no se debilita.
  const pelean = vivos.filter((r) => !r.huevo);
  if (pelean.length === 0) return { caido: false, porElEnlace: false };

  let porElEnlace = false;
  const caido = pelean.every((ranura) => {
    if (ranura.estado === 'debilitado') return true;
    if (parejaCaida(ranura.mote, caidosDelCompanero)) {
      porElEnlace = true;
      return true;
    }
    return false;
  });

  return { caido, porElEnlace: caido && porElEnlace };
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
  /**
   * Motes que han caido en el equipo del companero.
   *
   * Vacio cuando se juega solo, y entonces esto no cambia nada: sin companero
   * no hay parejas que se puedan morir en otra partida.
   */
  caidosDelCompanero: ReadonlySet<string> = new Set(),
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
      // El respaldo pide dos Pokémon; el mensaje del juego no pide ninguno.
      // El minimo de dos Pokemon guarda contra el combate del laboratorio, y eso
      // es cosa de TU partida. Una pareja caida la reporta el companero desde la
      // suya, y para que llegue tienen que coincidir el mote y que el suyo este
      // de verdad debilitado: es una condicion mucho mas concreta que "mi unico
      // Pokemon esta a cero", que en el tutorial pasa por guion. Asi que por ahi
      // no se exige el minimo, o un Soul Link de un solo Pokemon no acabaria
      // nunca, que es justo lo que se reporto.
      const sinNadie = equipoCaido(equipo, caidosDelCompanero);
      const loDeduzco =
        sinNadie.caido && (sinNadie.porElEnlace || vistos.size >= MINIMO_PARA_DEDUCIRLO);
      const acabaAhora = victoria || derrota || loDeduzco;

      const siguiente: Guardado = {
        ...previo,
        vistos: [...vistos],
        terminada: previo.terminada || acabaAhora,
        porElEnlace: previo.terminada ? previo.porElEnlace : sinNadie.porElEnlace,
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
    porElEnlace: estado.porElEnlace,
    equipoFinal,
    continuada: estado.continuada,
    continuar,
    descartar,
  };
};

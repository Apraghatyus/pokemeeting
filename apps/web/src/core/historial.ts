// Lo que queda de cada partida cuando se acaba.
//
// NO SE ENSENA EN NINGUN SITIO todavia, y eso es a proposito: se recoge ahora
// para que el dia que haya cuentas y perfiles exista un historial de verdad que
// contar. Un historial que empiece a llenarse el dia que se escribe su pantalla
// nace vacio, y las partidas de antes ya no se pueden recuperar: una partida
// terminada no se vuelve a jugar.
//
// QUE SE GUARDA Y POR QUE ESO. Como acabo -ganando o perdiendo, y si fue por el
// enlace de un Soul Link-, por donde se habia llegado -las medallas- y el equipo
// EXACTO del momento en que se acabo, con sus movimientos. Sin los movimientos,
// "perdi con un Pidgey de nivel 40" no cuenta nada; con ellos se ve con que se
// jugaba de verdad.
//
// LO QUE NO SE GUARDA: nada de la ROM. Numeros de especie y de movimiento, que
// es lo mismo que ya viaja por el cable, y el mote, que lo escribio el jugador.
// El nombre de cada cosa lo pondra quien lo ensene, con su propia copia del
// juego, igual que se hace en el panel del equipo.
//
// Vive en este navegador, como el resto. Cuando haya cuentas, esto es lo que se
// subira.

import type { EquipoResumen } from '@emupoke/protocol';

const CLAVE = 'emupoke.historial';

/**
 * Cuantas partidas terminadas se guardan.
 *
 * Hay tope porque esto va a localStorage, que es pequeno y lo comparte con las
 * partidas guardadas y el diario de los intercambios. Cincuenta finales son
 * muchas mas de las que nadie juega antes de que existan los perfiles, y
 * ocupan unos pocos kilobytes.
 */
export const MAX_HISTORIAL = 50;

export type PokemonDeLaHistoria = {
  especie: number;
  mote: string;
  nivel: number;
  /** Sus cuatro movimientos, o vacio si no se pudieron leer. */
  movimientos: number[];
  /** Si estaba debilitado al acabar, que es lo que cuenta como caido. */
  caido: boolean;
};

export type PartidaTerminada = {
  id: string;
  /** El fichero de la copia, que es lo que une esto con la partida guardada. */
  partida: string;
  /** Cuando se acabo. */
  cuando: number;
  resultado: 'victoria' | 'derrota';
  /**
   * Si lo que la acabo fue una pareja caida en la partida del companero.
   *
   * En un Soul Link eso es un final distinto de perder en tu juego, y contarlo
   * igual seria perderse la mitad de la historia.
   */
  porElEnlace: boolean;
  /** Cuantas medallas llevaba, o null si no se supo leerlas. */
  medallas: number | null;
  /** El equipo del momento exacto en que se acabo. */
  equipo: PokemonDeLaHistoria[];
};

const leerTodas = (): PartidaTerminada[] => {
  try {
    const crudo = globalThis.localStorage?.getItem(CLAVE);
    const datos: unknown = crudo ? JSON.parse(crudo) : [];
    return Array.isArray(datos) ? (datos as PartidaTerminada[]) : [];
  } catch {
    // Un historial que no se entiende no puede llevarse por delante la partida
    // de nadie: se empieza de cero y ya.
    return [];
  }
};

/** Las partidas terminadas, de la mas reciente a la mas vieja. */
export const historial = (): PartidaTerminada[] =>
  leerTodas().sort((a, b) => b.cuando - a.cuando);

/**
 * Apunta una partida terminada.
 *
 * Se descarta si ya estaba apuntada: el cartel de fin puede aparecer mas de una
 * vez -se cierra, se sigue jugando, vuelve a caer el equipo- y el historial
 * cuenta finales, no veces que se vio el cartel.
 */
export const apuntarPartidaTerminada = (
  partida: string,
  resultado: 'victoria' | 'derrota',
  porElEnlace: boolean,
  medallas: number | null,
  equipo: EquipoResumen | null,
): PartidaTerminada | null => {
  if (!partida) return null;

  const id = `${partida}:${resultado}:${porElEnlace ? 'enlace' : 'propio'}`;
  const todas = leerTodas();
  if (todas.some((p) => p.id === id)) return null;

  const registro: PartidaTerminada = {
    id,
    partida,
    cuando: Date.now(),
    resultado,
    porElEnlace,
    medallas,
    equipo: (equipo?.ranuras ?? [])
      // Un huevo no tiene nada que contar: ni especie que ensenar ni
      // movimientos que mirar.
      .filter((r) => !r.huevo)
      .map((r) => ({
        especie: r.especie,
        mote: r.mote,
        nivel: r.nivel,
        movimientos: [...(r.movimientos ?? [])],
        caido: r.estado === 'debilitado',
      })),
  };

  // Las mas viejas se van cuando no caben. Se tira por fecha y no por orden de
  // llegada: el reloj del aparato puede haber cambiado entre medias.
  const guardadas = [...todas, registro].sort((a, b) => b.cuando - a.cuando).slice(0, MAX_HISTORIAL);

  try {
    globalThis.localStorage?.setItem(CLAVE, JSON.stringify(guardadas));
  } catch {
    // Sin sitio para apuntarlo, se juega igual. Esto no puede estorbar a nadie.
    return null;
  }
  return registro;
};

/** Borra el historial entero. Para cuando haya donde pedirlo. */
export const olvidarHistorial = (): void => {
  try {
    globalThis.localStorage?.removeItem(CLAVE);
  } catch {
    // Si no se puede, no se puede.
  }
};

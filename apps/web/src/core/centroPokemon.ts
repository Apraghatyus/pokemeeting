// Las reglas del Centro Pokemon, que a diferencia del resto SE HACEN CUMPLIR.
//
// 1. LA ENFERMERA NO CURA CON UN MUERTO EN EL EQUIPO. Si hay un Pokemon
//    debilitado -muerto, en Nuzlocke- primero hay que dejarlo en el PC o
//    liberarlo. Lo mismo vale para revivirlo con un objeto.
// 2. NO SE SALE DEL CENTRO llevando un muerto, ni, en Nivelada, uno que pase
//    del tope de nivel del siguiente lider. Hay que guardarlo o liberarlo antes.
//
// COMO SE IMPIDE, sin tocar el juego: el equipo se mira cada pocos segundos
// guardando un estado, y el ultimo estado BUENO se conserva. Si en la lectura
// siguiente se ve que la regla se ha roto -el muerto esta en pie, o el jugador
// ya esta en la calle-, se vuelve a cargar ese estado: el jugador aparece otra
// vez donde estaba un momento antes, con un aviso que dice por que. No se
// escribe nada en la partida que el juego no hubiera escrito ya.
//
// SABER QUE ESTO ES UN CENTRO. Ningun numero lo dice. Lo que si pasa es que
// todos los Centros de una region comparten la misma disposicion por dentro.
// Asi que se aprende la primera vez que la enfermera cura al equipo entero: la
// disposicion de ese sitio, si la comparten varios mapas, es la del Centro. La
// casa del jugador tambien cura, pero es unica y no cuela. Hasta esa primera
// cura la regla de salir no puede vigilarse; la de curar, si.
//
// Todo esto es puro: recibe dos lecturas y dice que hacer. La parte que carga
// estados vive en `useEquipo`.

import type { EquipoResumen, PokemonResumen } from '@emupoke/protocol';
import { esCentro, TIPO_INTERIOR, type MapaInfo } from '@emupoke/pokemon';

/** Lo que se sabe de la partida en un momento. */
export type Lectura = {
  equipo: EquipoResumen | null;
  mapa: MapaInfo | null;
};

export type ReglasDelCentro = {
  /** Si un debilitado esta muerto (Nuzlocke y Nivelada, con el reto vivo). */
  muertoEsMuerto: boolean;
  /** Personalidades de los que ya han caido, sin contar el laboratorio. */
  muertos: readonly number[];
  /** El tope de nivel que hay que respetar, o null si no hay (o no se sabe). */
  tope: number | null;
  /** La disposicion de los Centros de este juego, si ya se aprendio. */
  disposicionDelCentro: number | null;
};

const vivos = (equipo: EquipoResumen | null): PokemonResumen[] =>
  (equipo?.ranuras ?? []).filter((p) => !p.huevo);

const nombre = (p: PokemonResumen): string => p.mote.trim() || 'ese Pokémon';

/**
 * Si entre dos lecturas se ha curado al equipo entero, como hace la enfermera.
 *
 * Todos con la vida llena ahora, y al menos uno que antes no la tenia. Una
 * pocion cura a uno; esto pide que el resto ya este lleno, que es justo lo que
 * deja la enfermera.
 */
export const seCuroElEquipo = (antes: Lectura | null, ahora: Lectura): boolean => {
  const ahoraVivos = vivos(ahora.equipo);
  if (!antes || ahoraVivos.length === 0) return false;
  if (!ahoraVivos.every((p) => p.psMax !== undefined && p.ps === p.psMax && p.estado === null)) {
    return false;
  }
  const previos = new Map(vivos(antes.equipo).map((p) => [p.personalidad, p]));
  return ahoraVivos.some((p) => {
    const previo = previos.get(p.personalidad);
    return previo !== undefined && (previo.ps !== previo.psMax || previo.estado !== null);
  });
};

/** El primer muerto que va en el equipo, si hay alguno. */
const muertoEnElEquipo = (lectura: Lectura, reglas: ReglasDelCentro): PokemonResumen | null =>
  vivos(lectura.equipo).find(
    (p) => p.estado === 'debilitado' && reglas.muertos.includes(p.personalidad),
  ) ?? null;

/**
 * Decide si hay que deshacer lo que acaba de pasar.
 *
 * Devuelve el aviso para el jugador, o null si todo esta en orden.
 */
export const juzgar = (
  antes: Lectura | null,
  ahora: Lectura,
  reglas: ReglasDelCentro,
): string | null => {
  if (!antes) return null;

  // --- 1. un muerto que vuelve a estar en pie ---
  if (reglas.muertoEsMuerto) {
    const previos = new Map(vivos(antes.equipo).map((p) => [p.personalidad, p]));
    const revivido = vivos(ahora.equipo).find((p) => {
      const previo = previos.get(p.personalidad);
      return (
        p.estado !== 'debilitado' &&
        previo?.estado === 'debilitado' &&
        reglas.muertos.includes(p.personalidad)
      );
    });
    if (revivido) {
      const enElCentro =
        ahora.mapa !== null && esCentro(ahora.mapa, reglas.disposicionDelCentro);
      return enElCentro || seCuroElEquipo(antes, ahora)
        ? `La enfermera no atiende con ${nombre(revivido)} debilitado en el equipo. Déjalo en el PC o libéralo antes de curar.`
        : `${nombre(revivido)} está muerto: no se puede revivir. Déjalo en el PC o libéralo.`;
    }
  }

  // --- 2. salir del Centro con alguien que no deberia ---
  const desde = antes.mapa;
  const hasta = ahora.mapa;
  if (!desde || !hasta || !esCentro(desde, reglas.disposicionDelCentro)) return null;
  const otroMapa = desde.grupo !== hasta.grupo || desde.numero !== hasta.numero;
  // Subir a la planta de arriba sigue siendo estar en el Centro: es un
  // interior de la misma zona.
  const sigueDentro = hasta.zona === desde.zona && hasta.tipo === TIPO_INTERIOR;
  if (!otroMapa || sigueDentro) return null;

  if (reglas.muertoEsMuerto) {
    const muerto = muertoEnElEquipo(ahora, reglas);
    if (muerto) {
      return `No puedes salir del Centro con ${nombre(muerto)} debilitado. Déjalo en el PC o libéralo.`;
    }
  }
  if (reglas.tope !== null) {
    const pasado = vivos(ahora.equipo).find((p) => p.nivel > reglas.tope!);
    if (pasado) {
      return `No puedes salir del Centro con ${nombre(pasado)} en nivel ${pasado.nivel}: el tope es ${reglas.tope}. Déjalo en el PC o libéralo.`;
    }
  }
  return null;
};

const claveCentro = (juego: string) => `emupoke.centro.${juego}`;

/** La disposicion de los Centros aprendida para este juego, si la hay. */
export const leerDisposicionDelCentro = (juego: string): number | null => {
  try {
    const valor = Number(globalThis.localStorage?.getItem(claveCentro(juego)));
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
};

export const guardarDisposicionDelCentro = (juego: string, disposicion: number): void => {
  try {
    globalThis.localStorage?.setItem(claveCentro(juego), String(disposicion));
  } catch {
    // Sin almacenamiento se vuelve a aprender la proxima vez.
  }
};

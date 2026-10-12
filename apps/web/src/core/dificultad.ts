// Las tres dificultades: como se llaman, que reglas tienen y que enciende cada
// una en el programa.
//
// Viven aqui y no en la pantalla que las enseña porque las lee mas de una: el
// menu del aleatorizador las ofrece, el panel decide con ellas que marcar y el
// ranking las explica. Si cada una tuviera su copia, el dia que cambie una regla
// una de las tres diria otra cosa.
//
// LO QUE NO HACE NINGUNA: impedir. El programa mira la partida y avisa; no le
// quita nada al jugador ni escribe en su juego para obligarle. Ver "vigilar no
// es impedir" en docs/ideas-pendientes.md.

import type { Dificultad, EquipoResumen } from '@emupoke/protocol';

export type InfoDeDificultad = {
  id: Dificultad;
  nombre: string;
  coletilla: string;
  reglas: string[];
};

export const DIFICULTADES: readonly InfoDeDificultad[] = [
  {
    id: 'normal',
    nombre: 'Normal',
    coletilla: 'Captura libre',
    reglas: [
      'Captura lo que quieras, cuando quieras',
      'El nivel de los lideres no afecta',
      'Las tiendas venden Revivir',
    ],
  },
  {
    id: 'nuzlocke',
    nombre: 'Nuzlocke',
    coletilla: '3 reglas',
    reglas: [
      'Solo el primer Pokemon de cada ruta',
      'Debilitado = muerto (PC o liberado)',
      'No curar ni salir del Centro con debilitados en el equipo',
      'Sin Revivir en las tiendas',
    ],
  },
  {
    id: 'nivelada',
    nombre: 'Nivelada',
    coletilla: 'La mas dura',
    reglas: [
      'Todo lo de Nuzlocke',
      'Tope de nivel del proximo lider',
      'Sin repetir tipo primario (ambos jugadores)',
    ],
  },
];

export const infoDe = (dificultad: Dificultad): InfoDeDificultad =>
  DIFICULTADES.find((d) => d.id === dificultad) ?? DIFICULTADES[0]!;

/**
 * Lo que vigila el programa en cada una.
 *
 * Todo se apaga cuando la partida ya termino: seguir jugando despues de caer es
 * jugar, no competir, y ahi no hay reglas que cumplir ni nada que contar.
 */
export type Reglas = {
  /** Apagar la ficha de quien se pasa del tope del lider que toca. */
  topeDeNivel: boolean;
  /** Avisar de dos Pokemon con el mismo tipo primario, contando los dos equipos. */
  tipoPrimarioUnico: boolean;
  /** Avisar de una segunda captura en una zona que ya tenia la suya. */
  primeraCaptura: boolean;
  /** Avisar de un Pokemon que cayo y vuelve a estar en pie. */
  muertoEsMuerto: boolean;
};

export const reglasActivas = (dificultad: Dificultad, terminada: boolean): Reglas => ({
  topeDeNivel: !terminada && dificultad === 'nivelada',
  tipoPrimarioUnico: !terminada && dificultad === 'nivelada',
  // Las dos de Nuzlocke valen tambien en Nivelada, que es "todo lo de
  // Nuzlocke" y algo mas.
  primeraCaptura: !terminada && dificultad !== 'normal',
  muertoEsMuerto: !terminada && dificultad !== 'normal',
});

/**
 * Los tipos primarios que se repiten, contando los dos equipos a la vez.
 *
 * Es la regla de la Nivelada: no puede haber dos Pokemon con el mismo tipo
 * PRIMARIO, ni en tu equipo ni entre el tuyo y el de tu companero. Solo cuenta
 * el primero: un Roca/Agua es Roca y no choca con el Agua del otro.
 *
 * Se comparan numeros de tipo, y cada equipo trae los de SU copia del juego.
 * Es lo unico que hace la regla comprobable: en dos copias aleatorizadas por
 * separado la misma especie tiene tipos distintos. Los numeros de tipo, en
 * cambio, son los mismos en todas las ROMs.
 *
 * Los huevos no cuentan: no se pueden sacar a pelear y su tipo no se ve.
 */
export const tiposPrimariosRepetidos = (
  ...equipos: (EquipoResumen | null | undefined)[]
): Set<number> => {
  const cuantos = new Map<number, number>();
  for (const equipo of equipos) {
    for (const pokemon of equipo?.ranuras ?? []) {
      if (pokemon.huevo || !pokemon.tipos) continue;
      const primario = pokemon.tipos[0];
      cuantos.set(primario, (cuantos.get(primario) ?? 0) + 1);
    }
  }
  return new Set([...cuantos].filter(([, n]) => n > 1).map(([tipo]) => tipo));
};

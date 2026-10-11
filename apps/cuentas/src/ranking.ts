// El ranking: todas las partidas terminadas de todo el mundo, en una tabla.
//
// Es la razon por la que existen las cuentas. Un historial en tu navegador te
// dice como te va a ti; esto es lo que permite compararse, que es lo que de
// verdad quiere alguien que juega Nuzlockes con un amigo.
//
// TRES DECISIONES QUE CONVIENE NO DESHACER:
//
// 1. Las descartadas NO cuentan para el porcentaje, pero se cuentan y se
//    ensenan. Si descartar fuera gratis e invisible, bastaria con borrar lo
//    que va mal antes de la pantalla de derrota para quedarse en el 100%. El
//    numero de al lado es lo que hace que el porcentaje signifique algo.
//
// 2. "Sola" incluye las partidas de las que no se sabe el modo. Se empezo a
//    apuntar tarde, asi que hay finales antiguos con el modo a nulo. Esconder
//    esas partidas haria desaparecer historial de verdad; contarlas como solas
//    puede equivocarse con alguna de Soul Link antigua, y ese es el error
//    menos malo de los dos. Lo nuevo siempre llega con su modo puesto.
//
// 3. El juego se mira primero en el propio final y, si no esta, en la partida
//    de la que salio. Los finales viejos no lo llevan, pero su partida si,
//    mientras no se haya borrado.

import { pool } from './base.ts';

/** Cuantas partidas recientes se mandan de cada jugador. */
const ULTIMAS = 3;

/** Y cuantos jugadores como mucho. */
const MAX_JUGADORES = 100;

export type PokemonDelRanking = {
  especie: number;
  mote: string;
  nivel: number;
  caido: boolean;
  /**
   * Sus cuatro movimientos, por numero.
   *
   * Numeros y no nombres, igual que la especie: el nombre lo pone quien mira,
   * con SU copia del juego. Es la misma frontera de siempre, y aqui ademas
   * hace falta -los nombres cambian con el idioma de cada copia-.
   */
  movimientos: number[];
};

export type PartidaDelRanking = {
  cuando: string;
  resultado: 'victoria' | 'derrota' | 'descartada';
  juego: string | null;
  modo: 'sola' | 'soullink' | null;
  companero: string | null;
  medallas: number | null;
  equipo: PokemonDelRanking[];
};

export type JugadorDelRanking = {
  usuario: string;
  apodo: string;
  victorias: number;
  derrotas: number;
  descartadas: number;
  /** Victorias y derrotas. Las descartadas no entran. */
  partidas: number;
  /** De 0 a 100, o null si todavia no hay suficientes para que signifique algo. */
  porcentaje: number | null;
  ultimas: PartidaDelRanking[];
};

export type Filtros = {
  modo: 'sola' | 'soullink' | null;
  juego: string | null;
  dificultad: string | null;
};

/**
 * Cuantas partidas hacen falta para ensenar un porcentaje.
 *
 * Con tres jugadas, un 33% no dice nada y parece que si. Hasta entonces se
 * manda null y la interfaz ensena la cuenta cruda. Es la misma regla que ya
 * tenia el historial del navegador.
 */
const MINIMO_PARA_EL_PORCENTAJE = 5;

/** Los juegos que aparecen en el historial, para poder filtrar por ellos. */
export const juegosConPartidas = async (): Promise<string[]> => {
  const { rows } = await pool.query<{ juego: string }>(
    `select distinct coalesce(f.juego, p.juego) as juego
       from partidas_terminadas f
       left join partidas p on p.id = f.partida_id
      where coalesce(f.juego, p.juego) is not null
      order by 1`,
  );
  return rows.map((f) => f.juego);
};

export const ranking = async (filtros: Filtros): Promise<JugadorDelRanking[]> => {
  // Las condiciones se montan a trozos para no acabar con una consulta llena
  // de "or $n is null", que es imposible de leer y de optimizar.
  const condiciones: string[] = [];
  const valores: unknown[] = [];

  if (filtros.modo === 'soullink') {
    condiciones.push(`f.modo = 'soullink'`);
  } else if (filtros.modo === 'sola') {
    // Ver la decision 2 de arriba: lo que no se sabe cuenta como sola.
    condiciones.push(`f.modo is distinct from 'soullink'`);
  }

  if (filtros.juego) {
    valores.push(filtros.juego);
    condiciones.push(`coalesce(f.juego, p.juego) = $${valores.length}`);
  }

  if (filtros.dificultad) {
    valores.push(filtros.dificultad);
    condiciones.push(`f.dificultad = $${valores.length}`);
  }

  const donde = condiciones.length > 0 ? `where ${condiciones.join(' and ')}` : '';

  const { rows } = await pool.query<{
    usuario: string;
    apodo: string;
    victorias: string;
    derrotas: string;
    descartadas: string;
    ultimas: PartidaDelRanking[] | null;
  }>(
    `
    with finales as (
      select f.*,
             coalesce(f.juego, p.juego) as juego_real,
             row_number() over (partition by f.usuario_id order by f.cuando desc) as reciente
        from partidas_terminadas f
        left join partidas p on p.id = f.partida_id
        ${donde}
    ),
    cuentas as (
      select usuario_id,
             count(*) filter (where resultado = 'victoria')   as victorias,
             count(*) filter (where resultado = 'derrota')     as derrotas,
             count(*) filter (where resultado = 'descartada')  as descartadas
        from finales
       group by usuario_id
    ),
    recientes as (
      select f.usuario_id,
             json_agg(
               json_build_object(
                 'cuando', f.cuando,
                 'resultado', f.resultado,
                 'juego', f.juego_real,
                 'modo', f.modo,
                 'companero', f.companero,
                 'medallas', f.medallas,
                 'equipo', coalesce(e.equipo, '[]'::json)
               ) order by f.cuando desc
             ) as ultimas
        from finales f
        left join lateral (
          select json_agg(
                   json_build_object(
                     'especie', k.especie, 'mote', k.mote,
                     'nivel', k.nivel, 'caido', k.caido,
                     'movimientos', k.movimientos
                   ) order by k.orden
                 ) as equipo
            from pokemon_del_final k
           where k.final_id = f.id
        ) e on true
       where f.reciente <= ${ULTIMAS}
       group by f.usuario_id
    )
    select u.usuario, u.apodo,
           c.victorias, c.derrotas, c.descartadas,
           r.ultimas
      from cuentas c
      join usuarios u on u.id = c.usuario_id
      left join recientes r on r.usuario_id = c.usuario_id
     order by
       -- Por porcentaje, pero quien tiene dos partidas no se pone por delante
       -- de quien lleva cincuenta: a igualdad de porcentaje manda quien mas ha
       -- jugado, y con menos de ${MINIMO_PARA_EL_PORCENTAJE} se ordena por victorias.
       case when c.victorias + c.derrotas >= ${MINIMO_PARA_EL_PORCENTAJE}
            then c.victorias::float / nullif(c.victorias + c.derrotas, 0)
            else -1 end desc,
       c.victorias desc,
       u.apodo asc
     limit ${MAX_JUGADORES}
    `,
    valores,
  );

  return rows.map((f) => {
    const victorias = Number(f.victorias);
    const derrotas = Number(f.derrotas);
    const partidas = victorias + derrotas;
    return {
      usuario: f.usuario,
      apodo: f.apodo,
      victorias,
      derrotas,
      descartadas: Number(f.descartadas),
      partidas,
      porcentaje:
        partidas >= MINIMO_PARA_EL_PORCENTAJE ? Math.round((victorias / partidas) * 100) : null,
      ultimas: f.ultimas ?? [],
    };
  });
};

// Subir lo que ya esta en el navegador.
//
// Esto es la razon de que el historial se empezara a recoger antes de que
// hubiera donde guardarlo. Si al iniciar sesion por primera vez no subiera lo
// de antes, todas las partidas jugadas hasta hoy se quedarian en el navegador
// de cada uno y aquel esfuerzo no habria servido de nada.
//
// SE PUEDE REPETIR. Entrar desde el portatil y luego desde el movil sube dos
// veces lo mismo, y tiene que dar el mismo resultado que subirlo una. Por eso
// todo va por una llave estable y se escribe con "on conflict": la segunda vez
// actualiza, no duplica.
//
// LO QUE NO SUBE: la ROM, la copia aleatorizada y el guardado. De una partida
// sube su SEMILLA, que son cuatro campos de texto con los que su dueno puede
// volver a generarla desde su propia ROM. Eso es lo que permite que esto tenga
// base de datos sin repartir el juego de nadie.

import {
  MAX_SUBIDA_FINALES,
  MAX_SUBIDA_PARTIDAS,
  type FinalParaSubir,
  type PartidaParaSubir,
  type ResultadoDeSubida,
} from '@emupoke/protocol';
import type { PoolClient } from 'pg';
import { pool } from './base.ts';

/** Lo mas largo que se admite en un campo de texto cualquiera. */
const MAX_TEXTO = 300;
/** Y en un equipo: seis, como en el juego. */
const MAX_EQUIPO = 6;

const recortar = (valor: unknown, largo = MAX_TEXTO): string | null =>
  typeof valor === 'string' && valor.length > 0 ? valor.slice(0, largo) : null;

const entero = (valor: unknown, minimo: number, maximo: number): number | null => {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null;
  const redondo = Math.trunc(valor);
  return redondo >= minimo && redondo <= maximo ? redondo : null;
};

/**
 * Una fecha que llega como numero del navegador.
 *
 * El reloj de un ordenador puede estar en cualquier sitio, incluido el ano
 * 1970 o el 2300. Lo que esta fuera de lo posible se cae a ahora: preferible
 * una fecha aproximada a una fila que rompe cualquier orden por tiempo.
 */
const fecha = (valor: unknown): Date => {
  const ms = typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
  const minimo = Date.UTC(2020, 0, 1);
  const maximo = Date.now() + 24 * 60 * 60 * 1000;
  return new Date(ms >= minimo && ms <= maximo ? ms : Date.now());
};

/**
 * Lo que identifica una partida.
 *
 * La semilla, que es lo mismo en cualquier aparato. El nombre del fichero solo
 * vale como ultimo recurso: se inventa con el reloj del navegador, asi que la
 * misma partida subida desde dos sitios tendria dos nombres. Las partidas
 * viejas y las hechas sin jjs no tienen semilla, y para esas no hay otra cosa.
 */
const llaveDePartida = (partida: PartidaParaSubir): string | null => {
  const semilla = recortar(partida.semilla, 120);
  if (semilla) return `semilla:${semilla}`;
  const fichero = recortar(partida.fichero);
  return fichero ? `fichero:${fichero}` : null;
};

const guardarPartida = async (
  cliente: PoolClient,
  usuarioId: string,
  partida: PartidaParaSubir,
): Promise<'nueva' | 'actualizada' | null> => {
  const llave = llaveDePartida(partida);
  const fichero = recortar(partida.fichero);
  if (!llave || !fichero) return null;

  const { rows } = await cliente.query<{ nueva: boolean }>(
    `insert into partidas
       (usuario_id, llave, fichero, nombre, juego, generacion,
        base_crc32, crc32, semilla, ajustes, cambiado, creada, jugada)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict (usuario_id, llave) do update set
       fichero = excluded.fichero,
       nombre = excluded.nombre,
       juego = excluded.juego,
       generacion = excluded.generacion,
       crc32 = excluded.crc32,
       ajustes = excluded.ajustes,
       cambiado = excluded.cambiado,
       -- La mas reciente de las dos: si se jugo en el movil despues que aqui,
       -- la buena es la del movil.
       jugada = greatest(partidas.jugada, excluded.jugada),
       subida = now()
     returning (xmax = 0) as nueva`,
    [
      usuarioId,
      llave,
      fichero,
      recortar(partida.nombre, 60),
      recortar(partida.juego, 80),
      entero(partida.generacion, 1, 9),
      recortar(partida.baseCrc32, 16),
      recortar(partida.crc32, 16),
      recortar(partida.semilla, 120),
      recortar(partida.ajustes, 2000),
      (Array.isArray(partida.cambiado) ? partida.cambiado : [])
        .slice(0, 30)
        .filter((c): c is string => typeof c === 'string')
        .map((c) => c.slice(0, 40)),
      fecha(partida.creada),
      fecha(partida.jugada),
    ],
  );

  return rows[0]?.nueva ? 'nueva' : 'actualizada';
};

const RESULTADOS = new Set(['victoria', 'derrota', 'descartada']);

const guardarFinal = async (
  cliente: PoolClient,
  usuarioId: string,
  final: FinalParaSubir,
): Promise<boolean> => {
  const llave = recortar(final.id, 400);
  if (!llave || !RESULTADOS.has(final.resultado)) return false;

  // El modo tiene que ser uno de los dos o nada: un nulo dice "no se sabe",
  // que es la verdad de las partidas apuntadas antes de que esto existiera.
  const modo = final.modo === 'sola' || final.modo === 'soullink' ? final.modo : null;

  const { rows } = await cliente.query<{ id: string }>(
    `insert into partidas_terminadas
       (usuario_id, partida_id, llave, cuando, resultado, por_el_enlace, medallas,
        juego, modo, companero)
     values (
       $1,
       -- Se ata a la partida de la que salio si todavia esta. Si se borro, la
       -- fila se queda igual: el historial sobrevive a la copia.
       (select id from partidas where usuario_id = $1 and fichero = $2 limit 1),
       $3, $4, $5, $6, $7, $8, $9, $10
     )
     on conflict (usuario_id, llave) do update set
       -- Lo que antes no se sabia y ahora si, se completa; lo que ya estaba no
       -- se pisa con un nulo. Asi volver a subir un historial viejo desde otro
       -- aparato no borra lo que se apunto bien.
       juego = coalesce(partidas_terminadas.juego, excluded.juego),
       modo = coalesce(partidas_terminadas.modo, excluded.modo),
       companero = coalesce(partidas_terminadas.companero, excluded.companero)
     returning (xmax = 0) as nueva, id`,
    [
      usuarioId,
      recortar(final.partida) ?? '',
      llave,
      fecha(final.cuando),
      final.resultado,
      final.porElEnlace === true,
      entero(final.medallas, 0, 8),
      recortar(final.juego, 80),
      modo,
      recortar(final.companero, 40),
    ],
  );

  // Con "do update" la fila vuelve siempre, asi que lo que dice si era nueva
  // es xmax: en una insercion de verdad vale 0.
  const fila = rows[0] as { nueva?: boolean; id?: string } | undefined;
  if (!fila?.id || fila.nueva !== true) return false;
  const id = fila.id;

  const equipo = (Array.isArray(final.equipo) ? final.equipo : []).slice(0, MAX_EQUIPO);
  for (const [orden, pokemon] of equipo.entries()) {
    const especie = entero(pokemon?.especie, 0, 2000);
    const nivel = entero(pokemon?.nivel, 1, 100);
    if (especie === null || nivel === null) continue;

    await cliente.query(
      `insert into pokemon_del_final (final_id, orden, especie, mote, nivel, movimientos, caido)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id,
        orden,
        especie,
        recortar(pokemon.mote, 20) ?? '',
        nivel,
        (Array.isArray(pokemon.movimientos) ? pokemon.movimientos : [])
          .slice(0, 4)
          .map((m) => entero(m, 0, 1000))
          .filter((m): m is number => m !== null),
        pokemon.caido === true,
      ],
    );
  }

  return true;
};

/**
 * Sube las partidas y los finales de alguien.
 *
 * Todo en una transaccion: o entra el lote entero o no entra nada. A medias
 * seria lo peor de los dos mundos, porque la proxima vez habria que adivinar
 * por donde se quedo.
 */
export const subir = async (
  usuarioId: string,
  partidas: PartidaParaSubir[],
  finales: FinalParaSubir[],
): Promise<ResultadoDeSubida> => {
  const cuenta: ResultadoDeSubida = {
    partidas: { nuevas: 0, actualizadas: 0 },
    finales: { nuevos: 0, repetidos: 0 },
  };

  const cliente = await pool.connect();
  try {
    await cliente.query('begin');

    // Las partidas primero: los finales se atan a ellas por el fichero, asi
    // que si fueran despues, una partida y su final subidos a la vez no se
    // encontrarian.
    for (const partida of partidas.slice(0, MAX_SUBIDA_PARTIDAS)) {
      const que = await guardarPartida(cliente, usuarioId, partida);
      if (que === 'nueva') cuenta.partidas.nuevas += 1;
      else if (que === 'actualizada') cuenta.partidas.actualizadas += 1;
    }

    for (const final of finales.slice(0, MAX_SUBIDA_FINALES)) {
      if (await guardarFinal(cliente, usuarioId, final)) cuenta.finales.nuevos += 1;
      else cuenta.finales.repetidos += 1;
    }

    await cliente.query('commit');
  } catch (error) {
    await cliente.query('rollback').catch(() => {});
    throw error;
  } finally {
    cliente.release();
  }

  return cuenta;
};

// La ficha de entrenador: quien eres, y con quien juegas.
//
// Tres cosas que viven juntas porque se enseñan juntas:
//
//   - El PERFIL: tu nombre, tu tag, tu lema, tu foto, y las cifras que salen
//     de tus partidas terminadas.
//   - Los AMIGOS: solicitudes, aceptar, quitar.
//   - La PRESENCIA: quien esta conectado y a que juega.
//
// LO QUE SE VE DE TI. Un amigo ve tu ficha entera y si estas jugando. No ve tu
// usuario de entrada ni, por supuesto, nada de tu contraseña. Quien no es
// amigo tuyo ve lo mismo que ya enseña el ranking, que es publico: apodo, tag
// y resultados.

import { pool } from './base.ts';

/** Cuantas cifras tiene un tag. Cuatro, como en Discord. */
const CIFRAS_DEL_TAG = 4;

/**
 * Cuanto se considera que alguien sigue conectado desde su ultimo latido.
 *
 * El navegador avisa cada 30 segundos. Noventa da margen para que se pierda un
 * latido -una pestaña en segundo plano, un bache de red- sin que la persona
 * parpadee a "desconectado" y vuelva.
 */
const SEGUNDOS_CONECTADO = 90;

export type Estado = 'en-partida' | 'disponible' | 'desconectado';

export type Amigo = {
  apodo: string;
  tag: string;
  estado: Estado;
  /** A que juega, si lo esta haciendo. */
  juego: string | null;
  /** Si tiene la foto puesta. La imagen se pide aparte. */
  conFoto: boolean;
};

export type Solicitud = {
  id: string;
  apodo: string;
  tag: string;
  conFoto: boolean;
};

export type Perfil = {
  usuario: string;
  apodo: string;
  tag: string;
  lema: string | null;
  favorito: number | null;
  conFoto: boolean;
  creada: string;
  /** Victorias y derrotas. Las descartadas no entran, como en el ranking. */
  partidas: number;
  victorias: number;
  derrotas: number;
  descartadas: number;
  porcentaje: number | null;
  /** El juego con mas partidas terminadas, y cuantas. */
  masJugado: { juego: string; partidas: number } | null;
};

/** Igual que en el ranking: con menos no significa nada. */
const MINIMO_PARA_EL_PORCENTAJE = 5;

/**
 * Un tag libre para ese apodo.
 *
 * Se intenta al azar unas cuantas veces en vez de buscar el primero libre: con
 * diez mil posibles y un puñado de personas con el mismo apodo, acierta a la
 * primera casi siempre, y asi los tags no salen correlativos -que es como se
 * adivina quien se registro antes-.
 */
export const tagLibre = async (apodo: string): Promise<string> => {
  for (let intento = 0; intento < 40; intento += 1) {
    const tag = String(Math.floor(Math.random() * 10 ** CIFRAS_DEL_TAG)).padStart(
      CIFRAS_DEL_TAG,
      '0',
    );
    const { rows } = await pool.query(
      'select 1 from usuarios where lower(apodo) = lower($1) and tag = $2',
      [apodo, tag],
    );
    if (rows.length === 0) return tag;
  }
  // Diez mil apodos iguales es imposible en la practica, pero si pasara, lo
  // honesto es decirlo en vez de dar un tag repetido.
  throw new Error('No queda ningun tag libre para ese nombre.');
};

/** La ficha de alguien, por su id. */
export const perfilDe = async (usuarioId: string): Promise<Perfil | null> => {
  const { rows } = await pool.query<{
    usuario: string;
    apodo: string;
    tag: string;
    lema: string | null;
    favorito: number | null;
    con_foto: boolean;
    creada: Date;
  }>(
    `select usuario, apodo, tag, lema, favorito, (avatar is not null) as con_foto, creada
       from usuarios where id = $1`,
    [usuarioId],
  );
  const fila = rows[0];
  if (!fila) return null;

  const cuentas = await pool.query<{
    victorias: string;
    derrotas: string;
    descartadas: string;
  }>(
    `select count(*) filter (where resultado = 'victoria')  as victorias,
            count(*) filter (where resultado = 'derrota')    as derrotas,
            count(*) filter (where resultado = 'descartada') as descartadas
       from partidas_terminadas where usuario_id = $1`,
    [usuarioId],
  );

  const mas = await pool.query<{ juego: string; cuantas: string }>(
    `select coalesce(f.juego, p.juego) as juego, count(*) as cuantas
       from partidas_terminadas f
       left join partidas p on p.id = f.partida_id
      where f.usuario_id = $1 and coalesce(f.juego, p.juego) is not null
      group by 1
      order by count(*) desc
      limit 1`,
    [usuarioId],
  );

  const victorias = Number(cuentas.rows[0]?.victorias ?? 0);
  const derrotas = Number(cuentas.rows[0]?.derrotas ?? 0);
  const partidas = victorias + derrotas;

  return {
    usuario: fila.usuario,
    apodo: fila.apodo,
    tag: fila.tag,
    lema: fila.lema,
    favorito: fila.favorito,
    conFoto: fila.con_foto,
    creada: fila.creada.toISOString(),
    partidas,
    victorias,
    derrotas,
    descartadas: Number(cuentas.rows[0]?.descartadas ?? 0),
    porcentaje:
      partidas >= MINIMO_PARA_EL_PORCENTAJE ? Math.round((victorias / partidas) * 100) : null,
    masJugado: mas.rows[0]
      ? { juego: mas.rows[0].juego, partidas: Number(mas.rows[0].cuantas) }
      : null,
  };
};

/** Cambia lo que se puede cambiar de la ficha. */
export const guardarPerfil = async (
  usuarioId: string,
  cambios: { apodo?: string; lema?: string | null; favorito?: number | null },
): Promise<void> => {
  if (cambios.apodo !== undefined) {
    // Al cambiar de apodo el tag puede chocar con alguien que ya se llamara
    // asi. Se busca uno libre para el nombre NUEVO; el viejo no vale.
    const { rows } = await pool.query<{ tag: string }>(
      'select tag from usuarios where id = $1',
      [usuarioId],
    );
    const actual = rows[0]?.tag;
    const { rows: choca } = await pool.query(
      'select 1 from usuarios where lower(apodo) = lower($1) and tag = $2 and id <> $3',
      [cambios.apodo, actual, usuarioId],
    );
    const tag = choca.length > 0 ? await tagLibre(cambios.apodo) : actual;
    await pool.query('update usuarios set apodo = $1, tag = $2 where id = $3', [
      cambios.apodo,
      tag,
      usuarioId,
    ]);
  }

  if (cambios.lema !== undefined) {
    await pool.query('update usuarios set lema = $1 where id = $2', [cambios.lema, usuarioId]);
  }
  if (cambios.favorito !== undefined) {
    await pool.query('update usuarios set favorito = $1 where id = $2', [
      cambios.favorito,
      usuarioId,
    ]);
  }
};

/** Guarda la foto de perfil. */
export const guardarAvatar = async (
  usuarioId: string,
  bytes: Buffer,
  tipo: string,
): Promise<void> => {
  await pool.query(
    'update usuarios set avatar = $1, avatar_tipo = $2, avatar_puesto = now() where id = $3',
    [bytes, tipo, usuarioId],
  );
};

/** La foto de alguien, buscandole por apodo y tag. */
export const avatarDe = async (
  apodo: string,
  tag: string,
): Promise<{ bytes: Buffer; tipo: string } | null> => {
  const { rows } = await pool.query<{ avatar: Buffer | null; avatar_tipo: string | null }>(
    'select avatar, avatar_tipo from usuarios where lower(apodo) = lower($1) and tag = $2',
    [apodo, tag],
  );
  const fila = rows[0];
  if (!fila?.avatar) return null;
  return { bytes: fila.avatar, tipo: fila.avatar_tipo ?? 'image/jpeg' };
};

/** Apunta que esa persona sigue aqui, y a que juega. */
export const latir = async (
  usuarioId: string,
  juego: string | null,
  enSala: boolean,
): Promise<void> => {
  await pool.query(
    `insert into presencia (usuario_id, visto, juego, en_sala)
     values ($1, now(), $2, $3)
     on conflict (usuario_id) do update
       set visto = now(), juego = excluded.juego, en_sala = excluded.en_sala`,
    [usuarioId, juego, enSala],
  );
};

const estadoDe = (visto: Date | null, juego: string | null): Estado => {
  if (!visto) return 'desconectado';
  const hace = (Date.now() - visto.getTime()) / 1000;
  if (hace > SEGUNDOS_CONECTADO) return 'desconectado';
  return juego ? 'en-partida' : 'disponible';
};

/** Los amigos de alguien y las solicitudes que tiene esperando. */
export const amigosDe = async (
  usuarioId: string,
): Promise<{ amigos: Amigo[]; solicitudes: Solicitud[] }> => {
  const { rows: amigos } = await pool.query<{
    apodo: string;
    tag: string;
    visto: Date | null;
    juego: string | null;
    con_foto: boolean;
  }>(
    `select u.apodo, u.tag, p.visto, p.juego, (u.avatar is not null) as con_foto
       from amistades a
       join usuarios u
         on u.id = case when a.menor = $1 then a.mayor else a.menor end
       left join presencia p on p.usuario_id = u.id
      where a.menor = $1 or a.mayor = $1
      order by u.apodo`,
    [usuarioId],
  );

  const { rows: solicitudes } = await pool.query<{
    id: string;
    apodo: string;
    tag: string;
    con_foto: boolean;
  }>(
    `select s.id, u.apodo, u.tag, (u.avatar is not null) as con_foto
       from solicitudes s
       join usuarios u on u.id = s.de_id
      where s.para_id = $1
      order by s.cuando desc`,
    [usuarioId],
  );

  return {
    amigos: amigos.map((f) => ({
      apodo: f.apodo,
      tag: f.tag,
      estado: estadoDe(f.visto, f.juego),
      // El juego solo se enseña si de verdad esta conectado: decir a que
      // jugaba alguien que se fue hace dos horas confunde mas que ayuda.
      juego: estadoDe(f.visto, f.juego) === 'desconectado' ? null : f.juego,
      conFoto: f.con_foto,
    })),
    solicitudes: solicitudes.map((f) => ({
      id: f.id,
      apodo: f.apodo,
      tag: f.tag,
      conFoto: f.con_foto,
    })),
  };
};

export class NoSePuede extends Error {}

/** Manda una solicitud a quien se llame asi. */
export const solicitar = async (usuarioId: string, apodo: string, tag: string): Promise<void> => {
  const { rows } = await pool.query<{ id: string }>(
    'select id from usuarios where lower(apodo) = lower($1) and tag = $2',
    [apodo, tag],
  );
  const otro = rows[0]?.id;
  if (!otro) throw new NoSePuede('No hay nadie que se llame asi.');
  if (otro === usuarioId) throw new NoSePuede('Ese eres tu.');

  const [menor, mayor] = usuarioId < otro ? [usuarioId, otro] : [otro, usuarioId];
  const { rows: ya } = await pool.query('select 1 from amistades where menor = $1 and mayor = $2', [
    menor,
    mayor,
  ]);
  if (ya.length > 0) throw new NoSePuede('Ya sois amigos.');

  // Si te habia mandado una a ti, aceptarla es lo que de verdad quieres: no
  // tiene sentido dejar dos solicitudes cruzadas esperandose.
  const { rows: suya } = await pool.query<{ id: string }>(
    'select id from solicitudes where de_id = $1 and para_id = $2',
    [otro, usuarioId],
  );
  if (suya[0]) {
    await responder(usuarioId, suya[0].id, true);
    return;
  }

  await pool.query(
    'insert into solicitudes (de_id, para_id) values ($1, $2) on conflict do nothing',
    [usuarioId, otro],
  );
};

/** Acepta o rechaza una solicitud. Solo quien la recibio puede. */
export const responder = async (
  usuarioId: string,
  solicitudId: string,
  aceptar: boolean,
): Promise<void> => {
  const { rows } = await pool.query<{ de_id: string }>(
    'delete from solicitudes where id = $1 and para_id = $2 returning de_id',
    [solicitudId, usuarioId],
  );
  const otro = rows[0]?.de_id;
  if (!otro) throw new NoSePuede('Esa solicitud ya no esta.');
  if (!aceptar) return;

  const [menor, mayor] = usuarioId < otro ? [usuarioId, otro] : [otro, usuarioId];
  await pool.query(
    'insert into amistades (menor, mayor) values ($1, $2) on conflict do nothing',
    [menor, mayor],
  );
};

/** Deja de ser amigo de alguien. Se va la amistad entera, no media. */
export const quitarAmigo = async (usuarioId: string, apodo: string, tag: string): Promise<void> => {
  const { rows } = await pool.query<{ id: string }>(
    'select id from usuarios where lower(apodo) = lower($1) and tag = $2',
    [apodo, tag],
  );
  const otro = rows[0]?.id;
  if (!otro) return;
  const [menor, mayor] = usuarioId < otro ? [usuarioId, otro] : [otro, usuarioId];
  await pool.query('delete from amistades where menor = $1 and mayor = $2', [menor, mayor]);
};

-- Las cuentas y lo que cuelga de ellas.
--
-- Lo que NO esta aqui, y no es un olvido: no hay tabla de ROMs, ni de
-- guardados, ni nada que contenga un byte de un juego. Una partida se
-- identifica por su semilla, que son cuatro campos de texto con los que
-- cualquiera puede volver a generar su propia copia desde la suya.

-- Quien eres.
create table usuarios (
  id            uuid primary key default gen_random_uuid(),
  -- Como lo escribio su dueno: es lo que se ensena.
  usuario       text not null,
  -- Y en minusculas, que es con lo que se busca y lo que no se puede repetir.
  -- "JuanCardona" y "juancardona" son la misma persona.
  normalizado   text not null unique,
  -- El resumen de la contrasena, nunca la contrasena. Formato propio, con el
  -- algoritmo y sus parametros dentro, para poder endurecerlo mas adelante sin
  -- dejar fuera a quien ya tenia cuenta.
  clave         text not null,
  -- Como sale en la sala y en el ranking. Admite acentos y espacios: no
  -- identifica a nadie.
  apodo         text not null,
  creada        timestamptz not null default now(),
  entrada       timestamptz
);

-- Las sesiones abiertas.
--
-- Se guarda el RESUMEN del testigo, no el testigo. Si alguien se lleva una
-- copia de esta tabla, no puede entrar con lo que hay dentro, igual que pasa
-- con las contrasenas.
create table sesiones (
  resumen       text primary key,
  usuario_id    uuid not null references usuarios(id) on delete cascade,
  creada        timestamptz not null default now(),
  vista         timestamptz not null default now(),
  caduca        timestamptz not null
);

create index sesiones_por_usuario on sesiones (usuario_id);
create index sesiones_por_caducidad on sesiones (caduca);

-- Las partidas aleatorizadas de cada uno.
create table partidas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references usuarios(id) on delete cascade,
  -- Lo que identifica una partida de verdad es su semilla. El nombre del
  -- fichero se inventa con el reloj del navegador y solo vale dentro de el,
  -- asi que sirve de llave unicamente cuando no hay semilla -las partidas
  -- viejas, las hechas sin jjs-.
  llave         text not null,
  fichero       text not null,
  nombre        text,
  juego         text,
  generacion    smallint,
  base_crc32    text,
  crc32         text,
  semilla       text,
  ajustes       text,
  cambiado      text[] not null default '{}',
  creada        timestamptz not null,
  jugada        timestamptz not null,
  subida        timestamptz not null default now(),
  -- Subir dos veces desde dos aparatos no puede duplicar nada: la segunda vez
  -- actualiza la fila que ya habia.
  unique (usuario_id, llave)
);

create index partidas_por_usuario on partidas (usuario_id, jugada desc);

-- Como acabo cada partida.
create table partidas_terminadas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references usuarios(id) on delete cascade,
  -- La partida de la que salio, si todavia existe. Se pone a null y no se
  -- borra la fila: el historial sobrevive a la copia, que es justo su gracia.
  partida_id    uuid references partidas(id) on delete set null,
  llave         text not null,
  cuando        timestamptz not null,
  -- 'descartada' es la partida que se borro antes de llegar a una pantalla de
  -- victoria o de derrota. No cuenta para el porcentaje, pero se cuenta: si
  -- descartar fuera gratis e invisible, en una Nuzlocke bastaria con borrar lo
  -- que va mal para quedarse en el 100%.
  resultado     text not null check (resultado in ('victoria', 'derrota', 'descartada')),
  -- Si lo que la acabo fue la pareja caida del companero.
  por_el_enlace boolean not null default false,
  medallas      smallint,
  -- Estos tres son los que hoy el navegador todavia no manda. Se dejan
  -- preparados y nulos a proposito: el dia que se apunten, entran sin tocar el
  -- esquema, y mientras tanto un nulo dice la verdad -no se sabe- en vez de
  -- inventarse un valor.
  juego         text,
  modo          text check (modo in ('sola', 'soullink')),
  companero     text,
  dificultad    text check (dificultad in ('normal', 'nuzlocke', 'nivelada')),
  subida        timestamptz not null default now(),
  unique (usuario_id, llave)
);

create index finales_por_usuario on partidas_terminadas (usuario_id, cuando desc);

-- El equipo exacto del momento en que se acabo.
--
-- En tabla y no en jsonb porque el ranking va a querer preguntar cosas como
-- "con que Pokemon pierde mas gente", y eso dentro de un json es incomodo.
create table pokemon_del_final (
  final_id      uuid not null references partidas_terminadas(id) on delete cascade,
  orden         smallint not null,
  -- Numeros, igual que lo que ya viaja por el cable entre dos jugadores. El
  -- nombre lo pone quien mire, con SU copia del juego.
  especie       integer not null,
  mote          text not null,
  nivel         smallint not null,
  movimientos   integer[] not null default '{}',
  caido         boolean not null default false,
  primary key (final_id, orden)
);

-- La ficha de entrenador y los amigos.
--
-- Dos cosas distintas que llegan juntas porque se enseñan juntas: la ficha es
-- quien eres y los amigos es con quien juegas.

-- --- LA FICHA ------------------------------------------------------------

alter table usuarios
  -- Cuatro cifras que distinguen a dos personas con el mismo apodo, como en
  -- Discord. Se escribe "Juan#0482" para añadir a alguien.
  --
  -- Hace falta porque el apodo NO es unico y no debe serlo: obligar a que lo
  -- fuera convertiria el nombre que te ponen tus amigos en un recurso que se
  -- agota, y el primero que llegue se queda con "Juan".
  add column tag text,
  -- Una linea tuya, debajo del nombre.
  add column lema text,
  -- Tu Pokemon favorito, por numero de especie. Numero y no nombre: el nombre
  -- lo pone quien mira, con su copia del juego, igual que en todo lo demas.
  add column favorito integer,
  -- La foto, tal cual. En la base y no en disco por una razon concreta: hasta
  -- ahora lo unico que habia que respaldar era un volcado de PostgreSQL, y
  -- esto lo mantiene asi. Son imagenes pequeñas -el navegador las recorta a
  -- 256 px antes de subirlas- y no se consultan por dentro.
  add column avatar bytea,
  add column avatar_tipo text,
  add column avatar_puesto timestamptz;

-- A quien ya tenia cuenta se le reparte un tag ahora.
update usuarios
   set tag = lpad((floor(random() * 10000))::int::text, 4, '0')
 where tag is null;

alter table usuarios alter column tag set not null;

-- Lo que no se puede repetir es la PAREJA apodo+tag: es lo que se escribe
-- para añadir a alguien, asi que dos personas con el mismo par serian
-- indistinguibles.
create unique index usuarios_apodo_tag on usuarios (lower(apodo), tag);

-- --- QUIEN ESTA CONECTADO ------------------------------------------------

-- Una fila por usuario, que se pisa en cada latido.
--
-- En su propia tabla y no en `usuarios` a proposito: esto se escribe cada
-- treinta segundos por cada persona conectada, y no conviene estar tocando la
-- fila que tiene la contraseña con esa frecuencia.
create table presencia (
  usuario_id  uuid primary key references usuarios(id) on delete cascade,
  visto       timestamptz not null default now(),
  -- A que esta jugando, si lo esta. Null es "esta aqui pero sin partida".
  juego       text,
  -- Si esta dentro de una sala con alguien.
  en_sala     boolean not null default false
);

create index presencia_por_visto on presencia (visto);

-- --- AMIGOS --------------------------------------------------------------

-- Una fila por amistad, no dos.
--
-- Se guarda siempre con el id menor primero. Asi "¿somos amigos?" es una sola
-- consulta y no hay forma de que exista media amistad: que A tenga a B pero B
-- no tenga a A es un estado que no deberia poder escribirse, y asi no se
-- puede.
create table amistades (
  menor   uuid not null references usuarios(id) on delete cascade,
  mayor   uuid not null references usuarios(id) on delete cascade,
  desde   timestamptz not null default now(),
  primary key (menor, mayor),
  check (menor < mayor)
);

create index amistades_por_mayor on amistades (mayor);

-- Las solicitudes pendientes.
--
-- Separadas de las amistades porque son otra cosa: una solicitud tiene
-- direccion -quien la manda y quien la recibe- y una amistad no.
create table solicitudes (
  id        uuid primary key default gen_random_uuid(),
  de_id     uuid not null references usuarios(id) on delete cascade,
  para_id   uuid not null references usuarios(id) on delete cascade,
  cuando    timestamptz not null default now(),
  -- Una sola solicitud viva entre dos personas, en cada sentido.
  unique (de_id, para_id),
  check (de_id <> para_id)
);

create index solicitudes_para on solicitudes (para_id, cuando desc);

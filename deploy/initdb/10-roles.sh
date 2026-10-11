#!/bin/sh
# Se ejecuta UNA sola vez, cuando el volumen esta vacio (primer arranque).
# Para volver a aplicarlo hay que borrar el volumen emupoke_base.
#
# Tres roles, cada uno con lo minimo:
#   emupoke_admin  superusuario. Solo por socket local (docker exec). Rechazado por red.
#   emupoke_app    dueno de la base "emupoke". Lo usa el servicio de cuentas.
#                  Sin SUPERUSER/CREATEDB/CREATEROLE: si alguien compromete
#                  la app, no puede leer otras bases ni escalar.
#   emupoke_dev    dueno de "emupoke_dev". Es la credencial que se comparte
#                  para desarrollar; no puede ni conectarse a la de produccion.
set -eu

: "${EMUPOKE_PG_APP_CLAVE:?falta}"
: "${EMUPOKE_PG_DEV_CLAVE:?falta}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_clave="$EMUPOKE_PG_APP_CLAVE" -v dev_clave="$EMUPOKE_PG_DEV_CLAVE" <<'SQL'
create role emupoke_app login nosuperuser nocreatedb nocreaterole noreplication
  connection limit 20 password
  :'app_clave';
create role emupoke_dev login nosuperuser nocreatedb nocreaterole noreplication
  connection limit 5 password
  :'dev_clave';

create database emupoke owner emupoke_app;
create database emupoke_dev owner emupoke_dev;

-- Por defecto cualquier rol puede conectarse a cualquier base. Se quita.
revoke all on database emupoke from public;
revoke all on database emupoke_dev from public;
revoke all on database postgres from public;
SQL

# pg_hba propio: el superusuario no entra por red, y nadie entra sin scram.
cat > "$PGDATA/pg_hba.conf" <<'HBA'
# TYPE  DATABASE     USER           ADDRESS   METHOD
local   all          all                      scram-sha-256
host    all          emupoke_admin  all       reject
host    emupoke      emupoke_app    all       scram-sha-256
host    emupoke_dev  emupoke_dev    all       scram-sha-256
host    all          all            all       reject
HBA

// La conexion con PostgreSQL y las migraciones.
//
// Hasta ahora este proyecto no guardaba NADA en ningun servidor, y esa era una
// de sus mejores propiedades. Esto la rompe a proposito y solo hasta donde hace
// falta: aqui viven cuentas, partidas terminadas y equipos. Numeros, motes y
// fechas. Ni una ROM, ni un guardado, ni un byte del juego.
//
// LAS MIGRACIONES SE APLICAN AL ARRANCAR. Son ficheros .sql numerados y se
// ejecutan en orden, cada uno dentro de su transaccion, apuntando cual se
// aplico en una tabla. Es la pieza mas aburrida posible, y eso es lo que se
// quiere: una base de datos que se migra sola al desplegar no da sorpresas el
// dia que hay que reinstalar el servidor desde cero.

import { readdir, readFile } from 'node:fs/promises';
import { Pool } from 'pg';

/**
 * Donde esta la base.
 *
 * Sin esto, el servicio de cuentas no arranca y las otras dos piezas siguen
 * funcionando. Es deliberado: jugar, verse y aleatorizar nunca han necesitado
 * una cuenta y no van a empezar a necesitarla ahora.
 */
const URL_BASE = process.env['DATABASE_URL'];

if (!URL_BASE) {
  // Se sale aqui mismo, sin rastro de pila: no es un fallo del programa, es
  // que falta configuracion, y un volcado de diez lineas hace parecer roto lo
  // que solo esta sin configurar.
  console.error(
    'Falta DATABASE_URL. El servicio de cuentas necesita una base PostgreSQL.\n' +
      'El resto del proyecto -emulador, salas, voz y aleatorizador- funciona sin el.\n' +
      'Como levantarla: docs/despliegue.md, apartado "La base de datos".',
  );
  process.exit(1);
}

export const pool = new Pool({
  connectionString: URL_BASE,
  // Diez sobran: esto atiende inicios de sesion, no partidas. Lo que de verdad
  // importa es que no sean ilimitadas, para que una avalancha no deje a
  // Postgres sin conexiones.
  max: 10,
  // Una consulta de cuentas que tarda cinco segundos es una consulta rota.
  statement_timeout: 5_000,
  idleTimeoutMillis: 30_000,
});

/** Para los mensajes de arranque, sin ensenar la contrasena. */
export const dondeEstaLaBase = (): string => {
  try {
    const url = new URL(URL_BASE);
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
  } catch {
    return 'la base configurada';
  }
};

const CARPETA = new URL('./migraciones/', import.meta.url);

/**
 * Aplica las migraciones que falten.
 *
 * Cada una va en su propia transaccion junto con el apunte de que se aplico:
 * o entran las dos cosas o no entra ninguna. Una migracion a medias con la
 * marca puesta es la peor forma de romper una base de datos.
 */
export const migrar = async (): Promise<string[]> => {
  await pool.query(`
    create table if not exists migraciones (
      nombre text primary key,
      aplicada timestamptz not null default now()
    )
  `);

  const hechas = new Set(
    (await pool.query<{ nombre: string }>('select nombre from migraciones')).rows.map(
      (f) => f.nombre,
    ),
  );

  const ficheros = (await readdir(CARPETA)).filter((f) => f.endsWith('.sql')).sort();
  const aplicadas: string[] = [];

  for (const fichero of ficheros) {
    if (hechas.has(fichero)) continue;
    const sql = await readFile(new URL(fichero, CARPETA), 'utf8');
    const cliente = await pool.connect();
    try {
      await cliente.query('begin');
      await cliente.query(sql);
      await cliente.query('insert into migraciones (nombre) values ($1)', [fichero]);
      await cliente.query('commit');
      aplicadas.push(fichero);
    } catch (error) {
      await cliente.query('rollback').catch(() => {});
      throw new Error(`La migracion ${fichero} fallo: ${(error as Error).message}`);
    } finally {
      cliente.release();
    }
  }

  return aplicadas;
};

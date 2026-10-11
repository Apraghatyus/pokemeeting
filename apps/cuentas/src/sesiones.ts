// Estar dentro: el testigo de sesion y su galleta.
//
// Un testigo al azar guardado en una tabla, y no un JWT. La razon es corta: un
// JWT no se puede cerrar. Si alguien te roba uno, vale hasta que caduque y no
// hay nada que hacer; esto se borra de una tabla y se acabo. "Cerrar sesion en
// todos los aparatos" aqui es un DELETE, y con un JWT es un problema de diseno.
//
// En la tabla se guarda el RESUMEN del testigo, igual que con las contrasenas.
// Una copia de la base no deja entrar a nadie.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { pool } from './base.ts';

/** Como se llama la galleta. */
export const GALLETA = 'emupoke_sesion';

/**
 * Cuanto dura una sesion.
 *
 * Noventa dias porque esto es para jugar: pedir la contrasena cada semana a
 * alguien que entra a mirar su historial es molestarle sin ganar gran cosa.
 * Cada uso la renueva, asi que quien entra a menudo no la ve caducar nunca y
 * quien no vuelve en tres meses tiene que escribirla otra vez.
 */
const DIAS = 90;

/** Con esto puesto, la galleta solo viaja por HTTPS. */
const SEGURA = process.env['CUENTAS_COOKIE_SEGURA'] === '1';

const resumir = (testigo: string): string =>
  createHash('sha256').update(testigo).digest('hex');

/**
 * Abre una sesion y devuelve el testigo, que solo existe en este momento.
 *
 * Despues de esto no hay forma de volver a saberlo: en la base queda su
 * resumen. Si se pierde, se abre otra.
 */
export const abrirSesion = async (usuarioId: string): Promise<string> => {
  const testigo = randomBytes(32).toString('base64url');
  const caduca = new Date(Date.now() + DIAS * 24 * 60 * 60 * 1000);
  await pool.query(
    'insert into sesiones (resumen, usuario_id, caduca) values ($1, $2, $3)',
    [resumir(testigo), usuarioId, caduca],
  );
  return testigo;
};

/** De quien es este testigo, o null si no vale o ya caduco. */
export const deQuienEs = async (testigo: string | null): Promise<string | null> => {
  if (!testigo) return null;
  const { rows } = await pool.query<{ usuario_id: string }>(
    `update sesiones
        set vista = now(),
            caduca = now() + interval '${DIAS} days'
      where resumen = $1 and caduca > now()
      returning usuario_id`,
    [resumir(testigo)],
  );
  return rows[0]?.usuario_id ?? null;
};

/** Cierra esta sesion. Las de los otros aparatos siguen abiertas. */
export const cerrarSesion = async (testigo: string | null): Promise<void> => {
  if (!testigo) return;
  await pool.query('delete from sesiones where resumen = $1', [resumir(testigo)]);
};

/** Recoge las caducadas. Nadie las mira ya, pero ocupan. */
export const barrerSesiones = async (): Promise<number> => {
  const { rowCount } = await pool.query('delete from sesiones where caduca < now()');
  return rowCount ?? 0;
};

/**
 * Saca el testigo de la cabecera Cookie.
 *
 * A mano y no con una libreria porque es una linea de texto con puntos y coma.
 * La comparacion del nombre es exacta para que "otra_emupoke_sesion" no cuele.
 */
export const galletaDeLaPeticion = (cabecera: string | undefined): string | null => {
  if (!cabecera) return null;
  for (const trozo of cabecera.split(';')) {
    const corte = trozo.indexOf('=');
    if (corte < 0) continue;
    if (trozo.slice(0, corte).trim() !== GALLETA) continue;
    const valor = trozo.slice(corte + 1).trim();
    return valor ? decodeURIComponent(valor) : null;
  }
  return null;
};

/**
 * La galleta que abre sesion.
 *
 * HttpOnly: el JavaScript de la pagina no puede leerla, asi que un fallo que
 * permitiera colar codigo en la pagina no se lleva la sesion de nadie.
 * SameSite=Lax: no se manda cuando la peticion la origina otro sitio, que es
 * lo que impide que una pagina cualquiera haga cosas en tu nombre.
 */
export const galletaDeSesion = (testigo: string): string =>
  [
    `${GALLETA}=${testigo}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${DIAS * 24 * 60 * 60}`,
    ...(SEGURA ? ['Secure'] : []),
  ].join('; ');

/** Y la que la borra. */
export const galletaVacia = (): string =>
  [
    `${GALLETA}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    ...(SEGURA ? ['Secure'] : []),
  ].join('; ');

/**
 * Compara dos textos sin que el tiempo diga cuanto coinciden.
 *
 * Lo usa la comprobacion del testigo contra la cabecera del formulario.
 */
export const igualesSinChivarse = (a: string, b: string): boolean => {
  const uno = Buffer.from(a);
  const otro = Buffer.from(b);
  return uno.length === otro.length && timingSafeEqual(uno, otro);
};

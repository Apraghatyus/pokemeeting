// El servicio de cuentas.
//
// La tercera pieza de servidor, al lado de las salas y del aleatorizador. Es
// la primera del proyecto que guarda algo, y conviene tener claro QUE guarda:
// un nombre, el resumen de una contrasena, un apodo, y las partidas terminadas
// de cada uno. Ni ROMs, ni guardados, ni un byte de ningun juego.
//
// JUGAR NO NECESITA CUENTA, y eso no va a cambiar. Si esta pieza no arranca
// -no hay base de datos, o esta caida-, el emulador, las salas, la voz y el
// aleatorizador siguen funcionando igual. La cuenta sirve para que el historial
// deje de vivir solo en un navegador y pueda haber un ranking; no para dejar
// entrar a nadie a su propio juego.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  limpiarApodo,
  normalizarUsuario,
  problemaDeLaClave,
  problemaDelUsuario,
  type Cuenta,
  type FinalParaSubir,
  type PartidaParaSubir,
} from '@emupoke/protocol';
import { dondeEstaLaBase, migrar, pool } from './base.ts';
import { claveCorrecta, resumirClave } from './claves.ts';
import { Cupo, deDondeViene, fallar, leerJson, responder, texto, CuerpoEnorme } from './http.ts';
import {
  abrirSesion,
  barrerSesiones,
  cerrarSesion,
  deQuienEs,
  galletaDeLaPeticion,
  galletaDeSesion,
  galletaVacia,
} from './sesiones.ts';
import { subir } from './subir.ts';
import { juegosConPartidas, ranking, type Filtros } from './ranking.ts';

const PORT = Number(process.env['PORT'] ?? 8789);
const HOST = process.env['HOST'] ?? '127.0.0.1';

/**
 * Cuantos intentos de entrar se admiten antes de parar. Hay DOS cupos, y el
 * que de verdad trabaja es el primero.
 *
 * POR CUENTA: diez por cuarto de hora. Quien se equivoca al escribir su
 * contrasena no llega ni de lejos; quien prueba una lista contra una cuenta
 * se para en el intento once. Este cupo vale siempre, porque el nombre de la
 * cuenta lo manda quien pregunta y no depende de la red.
 *
 * POR DIRECCION: cincuenta, que es un techo y no un cerrojo. Antes este era
 * el unico, y tenia un problema serio: la direccion solo es de verdad si el
 * proxy de delante esta bien configurado -ver EMUPOKE_PROXY_FIABLE-. Si no lo
 * esta, TODOS los visitantes llegan con la misma, el cupo pasa a ser comun, y
 * una persona equivocandose diez veces deja fuera a las demas. Lo peor es que
 * eso no se nota hasta que pasa.
 *
 * Asi que el peso lo lleva el cupo por cuenta, que no se puede estropear
 * configurando mal nada, y el de direccion se queda como red de seguridad con
 * el numero lo bastante alto como para que una instalacion mal configurada no
 * se cierre sola.
 */
const porCuenta = new Cupo(10, 15 * 60 * 1000);
const porDireccion = new Cupo(50, 15 * 60 * 1000);
/**
 * Y las cuentas nuevas, que si no cualquiera llena la base en una tarde.
 *
 * Veinte por hora y por direccion, por lo mismo de arriba: si el proxy no esta
 * bien configurado, esta cuenta la comparte TODO el mundo, y un numero bajo
 * dejaria sin poder registrarse a un grupo de amigos que se apunta junto. Para
 * frenar a quien lo automatice, veinte por hora sigue sobrando.
 *
 * Se puede subir con CUENTAS_MAX_ALTAS, y en desarrollo hace falta: las pruebas
 * abren una cuenta cada una -las partidas guardadas son de quien inicia sesion-
 * y todas salen de la misma direccion, asi que el cupo de produccion se agota
 * en una tanda. Lo que NO se hace es perdonar a las direcciones privadas: con
 * un proxy mal configurado, todo el mundo llega como una de ellas.
 */
const MAX_ALTAS = Number(process.env['CUENTAS_MAX_ALTAS'] ?? 20);
const altas = new Cupo(Number.isInteger(MAX_ALTAS) && MAX_ALTAS > 0 ? MAX_ALTAS : 20, 60 * 60 * 1000);

type Fila = {
  id: string;
  usuario: string;
  apodo: string;
  creada: Date;
};

const comoSeCuenta = (fila: Fila): Cuenta => ({
  id: fila.id,
  usuario: fila.usuario,
  apodo: fila.apodo,
  creada: fila.creada.toISOString(),
});

const buscarPorId = async (id: string): Promise<Fila | null> => {
  const { rows } = await pool.query<Fila>(
    'select id, usuario, apodo, creada from usuarios where id = $1',
    [id],
  );
  return rows[0] ?? null;
};

/** Quien hace la peticion, o null si no hay sesion. */
const quienEs = async (req: IncomingMessage): Promise<Fila | null> => {
  const id = await deQuienEs(galletaDeLaPeticion(req.headers.cookie));
  return id ? buscarPorId(id) : null;
};

/**
 * Que nada de fuera pueda hacer esto en tu nombre.
 *
 * La galleta ya es SameSite=Lax, que impide casi todo. Esto cierra el resto:
 * un formulario de otra pagina puede enviarse a ciegas contra este servidor,
 * pero NO puede poner una cabecera inventada. Para ponerla haria falta pedir
 * permiso antes, y ese permiso no se da.
 */
const vieneDeLaPagina = (req: IncomingMessage): boolean =>
  req.headers['x-emupoke'] === '1';

const registro = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  if (altas.pasado(deDondeViene(req))) {
    fallar(res, 429, 'Demasiadas cuentas nuevas desde aqui. Prueba dentro de un rato.');
    return;
  }

  const cuerpo = (await leerJson(req)) as Record<string, unknown>;
  const usuario = texto(cuerpo['usuario']) ?? '';
  const clave = typeof cuerpo['clave'] === 'string' ? cuerpo['clave'] : '';

  const malUsuario = problemaDelUsuario(usuario);
  if (malUsuario) {
    fallar(res, 400, malUsuario);
    return;
  }
  const malClave = problemaDeLaClave(clave);
  if (malClave) {
    fallar(res, 400, malClave);
    return;
  }

  // El apodo que ya usaba en las salas, si lo manda. Es lo que se vera en el
  // ranking, y por eso vale el nombre de usuario como respaldo.
  const apodo = limpiarApodo(texto(cuerpo['apodo'])) || usuario;

  const { rows } = await pool.query<Fila>(
    `insert into usuarios (usuario, normalizado, clave, apodo)
     values ($1, $2, $3, $4)
     on conflict (normalizado) do nothing
     returning id, usuario, apodo, creada`,
    [usuario, normalizarUsuario(usuario), await resumirClave(clave), apodo],
  );

  const fila = rows[0];
  if (!fila) {
    fallar(res, 409, 'Ese usuario ya esta cogido.');
    return;
  }

  console.log(`[cuentas] alta de ${fila.usuario}`);
  responder(res, 201, { cuenta: comoSeCuenta(fila) }, galletaDeSesion(await abrirSesion(fila.id)));
};

const entrar = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const demasiados = (): void =>
    fallar(res, 429, 'Demasiados intentos. Espera un rato antes de volver a probar.');

  const desde = deDondeViene(req);
  if (porDireccion.pasado(desde)) {
    demasiados();
    return;
  }

  const cuerpo = (await leerJson(req)) as Record<string, unknown>;
  const usuario = texto(cuerpo['usuario']) ?? '';
  const clave = typeof cuerpo['clave'] === 'string' ? cuerpo['clave'] : '';

  // Por cuenta, y antes de tocar la base: probar contrasenas contra una cuenta
  // se para aqui aunque quien lo intente venga de mil direcciones distintas.
  const cuenta = normalizarUsuario(usuario);
  if (porCuenta.pasado(cuenta)) {
    demasiados();
    return;
  }

  const { rows } = await pool.query<Fila & { clave: string }>(
    'select id, usuario, apodo, creada, clave from usuarios where normalizado = $1',
    [cuenta],
  );
  const fila = rows[0];

  // El mismo mensaje tanto si el usuario no existe como si la contrasena no
  // es esa. Decir "ese usuario no existe" le confirma a quien prueba cuales
  // SI existen, y eso es media contrasena regalada.
  const mal = (): void => fallar(res, 401, 'Usuario o contrasena incorrectos.');

  if (!fila) {
    mal();
    return;
  }
  if (!(await claveCorrecta(clave, fila.clave))) {
    mal();
    return;
  }

  // Quien entra bien no arrastra sus fallos, ni los suyos ni los que otro haya
  // hecho desde la misma direccion.
  porCuenta.olvidar(cuenta);
  porDireccion.olvidar(desde);
  await pool.query('update usuarios set entrada = now() where id = $1', [fila.id]);
  responder(res, 200, { cuenta: comoSeCuenta(fila) }, galletaDeSesion(await abrirSesion(fila.id)));
};

const subirTodo = async (
  req: IncomingMessage,
  res: ServerResponse,
  quien: Fila,
): Promise<void> => {
  const cuerpo = (await leerJson(req)) as Record<string, unknown>;
  const partidas = Array.isArray(cuerpo['partidas'])
    ? (cuerpo['partidas'] as PartidaParaSubir[])
    : [];
  const finales = Array.isArray(cuerpo['finales']) ? (cuerpo['finales'] as FinalParaSubir[]) : [];

  const cuenta = await subir(quien.id, partidas, finales);
  console.log(
    `[cuentas] ${quien.usuario} sube ${cuenta.partidas.nuevas} partidas y ` +
      `${cuenta.finales.nuevos} finales nuevos`,
  );
  responder(res, 200, cuenta);
};

const atender = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const ruta = (req.url ?? '/').split('?')[0];

  if (ruta === '/health') {
    // Comprueba la base de verdad: un servicio de cuentas que responde pero no
    // llega a su base no esta sano, esta mintiendo.
    await pool.query('select 1');
    responder(res, 200, { ok: true });
    return;
  }

  // El ranking se puede mirar SIN cuenta. Es una tabla de resultados, no datos
  // de nadie: pedir que te registres para ver quien va ganando seria poner una
  // puerta donde no hace falta.
  if (req.method === 'GET' && ruta === '/ranking') {
    const parametros = new URLSearchParams((req.url ?? '').split('?')[1] ?? '');
    const modo = parametros.get('modo');
    const filtros: Filtros = {
      modo: modo === 'sola' || modo === 'soullink' ? modo : null,
      juego: parametros.get('juego')?.slice(0, 80) || null,
      dificultad: parametros.get('dificultad')?.slice(0, 20) || null,
    };
    responder(res, 200, {
      jugadores: await ranking(filtros),
      juegos: await juegosConPartidas(),
    });
    return;
  }

  if (req.method === 'GET' && ruta === '/yo') {
    const quien = await quienEs(req);
    responder(res, 200, { cuenta: quien ? comoSeCuenta(quien) : null });
    return;
  }

  if (req.method !== 'POST') {
    fallar(res, 404, 'No hay nada en esa direccion.');
    return;
  }

  if (!vieneDeLaPagina(req)) {
    fallar(res, 403, 'Peticion no reconocida.');
    return;
  }

  switch (ruta) {
    case '/registro':
      await registro(req, res);
      return;
    case '/entrar':
      await entrar(req, res);
      return;
    case '/salir':
      await cerrarSesion(galletaDeLaPeticion(req.headers.cookie));
      responder(res, 200, { ok: true }, galletaVacia());
      return;
    case '/subir': {
      const quien = await quienEs(req);
      if (!quien) {
        fallar(res, 401, 'Hay que iniciar sesion.');
        return;
      }
      await subirTodo(req, res, quien);
      return;
    }
    default:
      fallar(res, 404, 'No hay nada en esa direccion.');
  }
};

const server = createServer((req, res) => {
  atender(req, res).catch((error: unknown) => {
    if (error instanceof CuerpoEnorme) {
      fallar(res, 413, error.message);
      return;
    }
    if (error instanceof SyntaxError) {
      fallar(res, 400, error.message);
      return;
    }
    // Lo que pasa de verdad va al registro del servidor; a quien pregunta se le
    // dice que fallo y ya. Un mensaje de Postgres contado hacia fuera describe
    // el esquema a quien no deberia conocerlo.
    console.error('[cuentas] fallo atendiendo', req.method, req.url, error);
    if (!res.headersSent) fallar(res, 500, 'Algo fallo en el servidor.');
  });
});

const arrancar = async (): Promise<void> => {
  const aplicadas = await migrar();
  if (aplicadas.length > 0) console.log(`[cuentas] migraciones aplicadas: ${aplicadas.join(', ')}`);

  setInterval(
    () => {
      barrerSesiones().catch(() => {});
      porCuenta.barrer();
      porDireccion.barrer();
      altas.barrer();
    },
    60 * 60 * 1000,
  ).unref();

  server.listen(PORT, HOST, () => {
    console.log(`servicio de cuentas escuchando en ${HOST}:${PORT} contra ${dondeEstaLaBase()}`);
  });
};

arrancar().catch((error: unknown) => {
  console.error('[cuentas] no arranca:', (error as Error).message);
  process.exit(1);
});

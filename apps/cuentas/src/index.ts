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

const PORT = Number(process.env['PORT'] ?? 8789);
const HOST = process.env['HOST'] ?? '127.0.0.1';

/**
 * Cuantos intentos de entrar se admiten antes de parar.
 *
 * Diez por cuarto de hora y por direccion. Quien se equivoca al escribir su
 * contrasena no llega ni de lejos; quien prueba una lista, se para en el
 * intento once.
 */
const intentos = new Cupo(10, 15 * 60 * 1000);
/** Y las cuentas nuevas, que si no cualquiera llena la base en una tarde. */
const altas = new Cupo(5, 60 * 60 * 1000);

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
  const desde = deDondeViene(req);
  if (intentos.pasado(desde)) {
    fallar(res, 429, 'Demasiados intentos. Espera un rato antes de volver a probar.');
    return;
  }

  const cuerpo = (await leerJson(req)) as Record<string, unknown>;
  const usuario = texto(cuerpo['usuario']) ?? '';
  const clave = typeof cuerpo['clave'] === 'string' ? cuerpo['clave'] : '';

  const { rows } = await pool.query<Fila & { clave: string }>(
    'select id, usuario, apodo, creada, clave from usuarios where normalizado = $1',
    [normalizarUsuario(usuario)],
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

  intentos.olvidar(desde);
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
      intentos.barrer();
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

// Hablar con el servicio de cuentas.
//
// Una cuenta aqui sirve para UNA cosa: que el historial deje de vivir solo en
// este navegador. No hace falta para jugar, ni para ver a nadie, ni para
// aleatorizar, y si el servicio esta caido la aplicacion entera sigue
// funcionando. Por eso todo lo de aqui falla en silencio hacia arriba: lo peor
// que puede pasar es que no se pueda iniciar sesion.
//
// La sesion viaja en una galleta HttpOnly que pone el servidor. Este fichero
// nunca ve el testigo, y por eso todas las peticiones llevan
// `credentials: 'include'`: sin eso el navegador no la manda.

import type {
  Cuenta,
  FinalParaSubir,
  PartidaParaSubir,
  ResultadoDeSubida,
} from '@emupoke/protocol';
import { historial } from './historial';
import { todasLasPartidas } from './partidas';

export type { Cuenta };

/**
 * Donde vive el servicio.
 *
 * Siempre en el mismo origen desde el que se sirvio la pagina, igual que las
 * salas. Asi la galleta es de este sitio y no hace falta permiso de origen
 * cruzado para nada.
 */
const RAIZ = '/cuentas';

/** Lo que devuelve el servidor cuando algo sale mal. */
export class FalloDeCuenta extends Error {}

const pedir = async <T>(ruta: string, opciones: RequestInit = {}): Promise<T> => {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${RAIZ}${ruta}`, {
      ...opciones,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        // Lo que impide que otra pagina haga esto en tu nombre: un formulario
        // de fuera no puede poner una cabecera inventada.
        'X-Emupoke': '1',
        ...opciones.headers,
      },
    });
  } catch {
    throw new FalloDeCuenta('No se puede hablar con el servidor de cuentas.');
  }

  const datos: unknown = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const mensaje = (datos as { error?: string }).error;
    throw new FalloDeCuenta(mensaje ?? 'Algo fallo al hablar con el servidor.');
  }
  return datos as T;
};

/** Quien soy, o null si no hay sesion. Tambien null si el servicio no esta. */
export const quienSoy = async (): Promise<Cuenta | null> => {
  try {
    const { cuenta } = await pedir<{ cuenta: Cuenta | null }>('/yo');
    return cuenta;
  } catch {
    // Sin servicio de cuentas no hay sesion, y no es un error que haya que
    // ensenar: quien solo quiere jugar no tiene por que enterarse.
    return null;
  }
};

export const crearCuenta = async (
  usuario: string,
  clave: string,
  apodo: string | null,
): Promise<Cuenta> => {
  const { cuenta } = await pedir<{ cuenta: Cuenta }>('/registro', {
    method: 'POST',
    body: JSON.stringify({ usuario, clave, apodo }),
  });
  return cuenta;
};

export const entrar = async (usuario: string, clave: string): Promise<Cuenta> => {
  const { cuenta } = await pedir<{ cuenta: Cuenta }>('/entrar', {
    method: 'POST',
    body: JSON.stringify({ usuario, clave }),
  });
  return cuenta;
};

export const salir = async (): Promise<void> => {
  await pedir('/salir', { method: 'POST' });
};

/**
 * Sube lo que haya en este navegador.
 *
 * Esto es lo que da sentido a todo lo demas. El historial se lleva recogiendo
 * desde antes de que existieran las cuentas justamente para que el dia que
 * alguien inicie sesion haya algo que contar, y ese dia es este: si esto no se
 * hiciera, las partidas de antes se quedarian aqui dentro para siempre.
 *
 * Se puede llamar las veces que haga falta. El servidor funde por una llave
 * estable, asi que subir desde el portatil y despues desde el movil deja lo
 * mismo que subir una sola vez.
 *
 * NO SUBE NI UN BYTE DEL JUEGO. De cada partida va su semilla -cuatro campos
 * de texto- y de cada final, numeros y motes. Las ROMs y los guardados se
 * quedan donde estan.
 */
export const subirLoDeAqui = async (): Promise<ResultadoDeSubida> => {
  const partidas: PartidaParaSubir[] = todasLasPartidas().map((p) => ({
    fichero: p.fichero,
    nombre: p.nombre,
    juego: p.juego,
    generacion: p.generacion,
    baseCrc32: p.baseCrc32,
    crc32: p.crc32,
    semilla: p.semilla,
    ajustes: p.ajustes,
    cambiado: p.cambiado,
    creada: p.creada,
    jugada: p.jugada,
  }));

  const finales: FinalParaSubir[] = historial().map((f) => ({
    id: f.id,
    partida: f.partida,
    cuando: f.cuando,
    resultado: f.resultado,
    porElEnlace: f.porElEnlace,
    medallas: f.medallas,
    equipo: f.equipo,
  }));

  return pedir<ResultadoDeSubida>('/subir', {
    method: 'POST',
    body: JSON.stringify({ partidas, finales }),
  });
};

// Como quieres que te llamen.
//
// Hasta ahora la ventana del companero decia "Tu companero" y su columna de
// equipo, "Equipo de tu companero". Funciona, pero con dos partidas en pantalla
// y dos columnas de seis fichas, poner el nombre de quien esta al otro lado es
// de las cosas que mas rapido hacen que esto parezca una sala y no un panel.
//
// NO ES UNA CUENTA. Es un apodo que se escribe al entrar en una sala y que se
// recuerda en este navegador para no tener que repetirlo. No se registra, no se
// comprueba que sea unico y no se guarda en ningun servidor: viaja al montar la
// sala y se queda ahi mientras dure.

import { limpiarApodo, MAX_APODO } from '@emupoke/protocol';

const CLAVE = 'emupoke.apodo';

export { MAX_APODO };

/** El apodo que se uso la ultima vez, o null si no hay ninguno. */
export const apodoGuardado = (): string | null => {
  try {
    return limpiarApodo(globalThis.localStorage?.getItem(CLAVE));
  } catch {
    // Sin almacenamiento se juega igual, solo que hay que escribirlo cada vez.
    return null;
  }
};

/** Lo recuerda para la proxima sala. Vacio lo olvida. */
export const guardarApodo = (valor: string): void => {
  const limpio = limpiarApodo(valor);
  try {
    if (limpio) globalThis.localStorage?.setItem(CLAVE, limpio);
    else globalThis.localStorage?.removeItem(CLAVE);
  } catch {
    // Si no se puede guardar, tampoco pasa nada.
  }
};

/**
 * Como llamar al companero: su apodo, o lo de siempre si no dijo ninguno.
 *
 * Esta aqui y no repartido por la interfaz porque sale en cuatro sitios -la
 * etiqueta de su ventana, su columna de equipo, su pestana y el cartel de
 * invitacion- y lo peor que puede pasar es que en uno diga su nombre y en otro
 * "tu companero".
 */
export const comoSeLlama = (apodo: string | null | undefined): string =>
  limpiarApodo(apodo) ?? 'Tu companero';

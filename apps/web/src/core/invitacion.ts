// Un enlace que lleva directo a la sala.
//
// EL PROBLEMA QUE RESUELVE. Dictar un codigo de seis letras y una contrasena
// por WhatsApp ya era incomodo, pero lo que de verdad frenaba a la gente era lo
// de despues: aunque entres en la sala, si tu companero juega una copia
// aleatorizada y tu no tienes su semilla, estais en dos mundos distintos. O sea
// que para jugar juntos habia que pasarse DOS cosas por separado -credenciales
// y semilla- y entender para que servia cada una.
//
// Asi que el enlace lleva a las dos. Quien lo abre solo tiene que poner su
// copia del juego y pulsar un boton: se le prepara el mismo mundo y entra en la
// sala.
//
// LA SEMILLA YA NO VIAJA DENTRO DEL ENLACE. Iba, y eran cien caracteres de
// base64 en medio de un mensaje de WhatsApp: el enlace ocupaba tres lineas y
// parecia cualquier cosa menos algo en lo que pulsar. Ahora la guarda la sala y
// quien abre el enlace la pide con el codigo.
//
// Lo que queda es "https://.../#SRVHXT:1": el codigo, dos puntos y la
// contrasena. Se parte por el PRIMER dos puntos y la contrasena va escapada, asi
// que una que lleve dos puntos dentro tampoco rompe nada.
//
// Los enlaces de antes se siguen entendiendo, con sus nombres y su semilla
// dentro: alguien puede tener uno guardado en el chat.
//
// LO QUE EL ENLACE NO LLEVA, Y ES LO IMPORTANTE: la ROM. Una semilla sin la ROM
// original no vale para nada, que es justo lo que se quiere. Cada uno tiene que
// tener su propia copia del juego, y el enlace se puede mandar por donde sea sin
// repartir el juego con el.
//
// POR QUE VA EN EL FRAGMENTO Y NO EN LA CONSULTA. Lo que va detras de `#` no
// sale del navegador: no se manda al servidor, asi que no acaba en sus
// registros ni en los de ningun intermediario. Con `?` la contrasena de la sala
// quedaria escrita en el registro de accesos de cualquier maquina por la que
// pase la peticion.
//
// Y una advertencia que conviene decir en voz alta: el enlace ES la llave.
// Lleva dentro la contrasena, porque sin ella no habria "entrar directamente",
// asi que quien lo tenga puede entrar. Es lo mismo que pasa con un enlace de
// reunion, pero mas vale saberlo.

import { descodificarSemilla, type Semilla } from './semilla';

/** Como se llama cada cosa dentro del fragmento. */
const SALA = 'sala';
const CLAVE = 'clave';
const SEMILLA = 'semilla';

/** Un codigo de sala son seis letras o digitos. */
const CODIGO_VALIDO = /^[A-Z0-9]{6}$/;

export type Invitacion = {
  /** El codigo de la sala a la que se entra. */
  sala: string;
  /** La contrasena, para no tener que pedirsela a quien ya la tiene. */
  clave: string;
  /**
   * El mundo que juega quien invita, o null si juega sin aleatorizar.
   *
   * Null es un caso normal y no un error: quien le da a "Jugar tal cual" no
   * tiene semilla que compartir, y entonces basta con que el otro ponga su
   * copia del juego.
   */
  semilla: Semilla | null;
};

/**
 * El enlace para pasarselo a alguien.
 *
 * Se arma sobre la direccion de esta misma pagina, asi que funciona igual en
 * produccion que detras de un tunel de pruebas.
 */
export const enlaceDeInvitacion = (invitacion: Invitacion): string => {
  const { origin, pathname } = globalThis.location;
  // La semilla no se mete: la guarda la sala y se pide con el codigo. Ver la
  // cabecera de este fichero.
  return `${origin}${pathname}#${invitacion.sala}:${encodeURIComponent(invitacion.clave)}`;
};

/**
 * Lee la invitacion de la direccion, si la hay.
 *
 * Devuelve null ante cualquier cosa que no cuadre. Un enlace a medias -el
 * codigo sin la contrasena, por ejemplo- no se trata como una invitacion
 * incompleta sino como ninguna: enseñar un cartel de "te han invitado" que
 * luego no deja entrar es peor que no enseñar nada.
 *
 * Una semilla que no se entiende SI deja pasar la invitacion, y a proposito: el
 * codigo y la contrasena siguen sirviendo para entrar en la sala, y es mejor
 * entrar y avisar de que no se pudo rehacer el mundo que no dejar entrar.
 */
export const leerInvitacion = (hash = globalThis.location?.hash ?? ''): Invitacion | null => {
  const crudo = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!crudo) return null;

  // La forma corta: SALA:clave. Se mira primero y por el primer dos puntos.
  const corte = crudo.indexOf(':');
  if (corte > 0 && !crudo.includes('=')) {
    const sala = crudo.slice(0, corte).toUpperCase();
    let clave = '';
    try {
      clave = decodeURIComponent(crudo.slice(corte + 1));
    } catch {
      // Un enlace cortado por el chat puede dejar un % a medias.
      return null;
    }
    if (!CODIGO_VALIDO.test(sala) || clave === '') return null;
    return { sala, clave, semilla: null };
  }

  // Y la de antes, con nombres y a veces con la semilla dentro.
  const datos = new URLSearchParams(crudo);
  const sala = (datos.get(SALA) ?? '').toUpperCase();
  const clave = datos.get(CLAVE) ?? '';
  if (!CODIGO_VALIDO.test(sala) || clave === '') return null;

  const texto = datos.get(SEMILLA);
  return { sala, clave, semilla: texto ? descodificarSemilla(texto) : null };
};

/** Direcciones que apuntan a la maquina de quien copia y no a la de su amigo. */
const SOLO_AQUI = ['localhost', '127.0.0.1', '::1'];

/**
 * Si el enlace sirve de algo para quien lo reciba.
 *
 * "localhost" apunta al ordenador de quien copia, asi que mandarlo seria
 * enganoso: a su amigo le abriria su propia maquina, o nada.
 */
export const direccionCompartible = (hostname = globalThis.location?.hostname ?? ''): boolean =>
  hostname !== '' && !SOLO_AQUI.includes(hostname);

/**
 * El mensaje que se copia al portapapeles para pasarselo a alguien.
 *
 * Lleva el enlace primero, porque es lo unico que hay que pulsar. Y lleva
 * ademas el codigo y la contrasena escritos, que no es redundancia: un enlace
 * puede llegar cortado por el chat, y quien lo recibe puede tener ya la pagina
 * abierta, y entonces lo que necesita es poder teclearlos.
 *
 * La ultima linea avisa de que hace falta su propia copia del juego. Va en el
 * mensaje y no solo en la pagina porque quien lo recibe puede no tenerla, y mas
 * vale que lo sepa antes de abrir nada.
 */
export const textoDeInvitacion = (invitacion: Invitacion, juego: string | null = null): string => {
  const lineas = [`Sala: ${invitacion.sala}`, `Contrasena: ${invitacion.clave}`];
  if (direccionCompartible()) lineas.unshift(`Juega conmigo: ${enlaceDeInvitacion(invitacion)}`);
  lineas.push(
    juego
      ? `Necesitas tu propia copia de ${juego}: el enlace no la lleva.`
      : 'Necesitas tu propia copia del juego: el enlace no la lleva.',
  );
  return lineas.join('\n');
};

/**
 * Quita la invitacion de la barra de direcciones.
 *
 * Se llama en cuanto se ha leido, por dos motivos. Uno: ahi queda la contrasena
 * de la sala a la vista de quien pase por detras, y en el historial del
 * navegador. Dos: sin esto, recargar la pagina a media partida volveria a
 * lanzar el cartel de "te han invitado" sobre una sala en la que ya se esta.
 *
 * Se usa replaceState y no se toca `location.hash`: asignar el hash deja una
 * entrada mas en el historial, y entonces el boton de atras devuelve a la
 * direccion con la contrasena dentro.
 */
export const olvidarInvitacion = (): void => {
  const { origin, pathname, search } = globalThis.location;
  globalThis.history?.replaceState(null, '', `${origin}${pathname}${search}`);
};

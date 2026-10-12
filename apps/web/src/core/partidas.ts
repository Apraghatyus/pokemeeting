// Registro de partidas aleatorizadas.
//
// Las ROMs generadas y sus guardados ya viven en el sistema de ficheros de
// mGBA, que los persiste en IndexedDB. Lo que falta es saber que es cada
// fichero: de que ROM salio, cuando se creo y que se aleatorizo en ella. Eso
// es lo que guarda esto.
//
// Antes se descartaba la copia anterior al generar una nueva. Funcionaba, pero
// tiraba partidas en las que alguien podia llevar horas. Ahora se conservan y
// se elige.

import { sinRevivirEn, type Dificultad } from '@emupoke/protocol';
import type { Semilla } from './semilla';

export type PartidaGuardada = {
  id: string;
  /** Nombre del fichero dentro del sistema de ficheros del nucleo. */
  fichero: string;
  /** Nombre de la ROM original de la que salio. */
  baseNombre: string;
  /** CRC de la ROM original: es lo que une una partida con su ROM. */
  baseCrc32: string;
  creada: number;
  jugada: number;
  semilla: string | null;
  /**
   * Los ajustes exactos, en el formato del propio randomizer.
   *
   * Junto con la semilla y la ROM base, esto es todo lo que hace falta para
   * volver a generar esta misma copia byte a byte. Por eso no se descarga
   * nada: la copia no se guarda fuera, se sabe rehacer.
   */
  ajustes: string | null;
  /**
   * CRC de la copia generada.
   *
   * Sirve para comprobar que una copia rehecha es de verdad la misma. Sin esa
   * comprobacion, un randomizer actualizado podria dar un mundo parecido pero
   * distinto, y el guardado dejaria de encajar sin que nadie supiera por que.
   */
  crc32: string | null;
  /** Apartados que se aleatorizaron. */
  cambiado: string[];
  /**
   * Como la llama el jugador.
   *
   * Es null en las partidas creadas antes de que se pudiera nombrarlas, y
   * entonces se cae a la lista de lo que se aleatorizo. Esa lista servia de
   * nombre y no lo era: todas las partidas acababan llamandose parecido
   * ("Pokemon iniciales, Equipos de los entrenadores...") y recortadas, asi que
   * distinguir dos de la misma ROM era imposible.
   */
  nombre: string | null;
  /**
   * De que juego es, para enseñarlo en la lista.
   *
   * El cupo de partidas es de tres EN TOTAL y lo comparten todos los juegos,
   * asi que en la lista conviven partidas de Rojo Fuego con otras de Cristal.
   * Sin decir cual es cual, dos partidas con el mismo nombre no se distinguen.
   *
   * Es null en las guardadas antes de que esto existiera, y entonces se cae al
   * nombre del fichero, que es lo unico que habia.
   */
  juego: string | null;
  /** Segunda o tercera. Acompaña al nombre del juego. */
  generacion: number | null;
  /**
   * Si esta partida es de Soul Link.
   *
   * Se marca cuando nace con compañero -quien entra por un enlace- y cuando se
   * invita a alguien a una que ya existia. No se deduce al terminar: el modo
   * es de la PARTIDA, no de como acabo. Una Soul Link que se juega un rato
   * sola sigue siendo una Soul Link.
   *
   * Es null en las de antes de que esto existiera, y eso dice la verdad: que
   * no se sabe.
   */
  soullink: boolean | null;
  /**
   * Si se dijo que NO a hacerla Soul Link. Se pregunta al jugar con alguien al
   * principio de la partida, y la respuesta se recuerda para no preguntar mas.
   */
  soullinkDescartado?: boolean;
  /**
   * Con quien se empezo la Soul Link: su cuenta, comprobada por el servidor de
   * salas. Null si el otro no tenia cuenta. Es con quien hay que seguirla, y
   * solo si se termina con esa misma persona cuenta en el ranking.
   */
  companeroSoullink?: string | null;
  /**
   * Con que reglas se juega: Normal, Nuzlocke o Nivelada. Se elige al crearla y
   * no cambia, igual que el modo: cambiarla a mitad seria otra partida.
   *
   * Opcional porque las partidas de antes no lo tienen, y entonces es null: no
   * se sabe. Para las reglas cuentan como Normal, que es como se jugaban.
   */
  dificultad?: Dificultad | null;
};

/** Con que reglas se juega una partida. Las de antes de que existieran, Normal. */
export const reglasDe = (partida: PartidaGuardada | undefined | null): Dificultad =>
  partida?.dificultad ?? 'normal';

/** La dificultad de la partida que corre en ese fichero. */
export const dificultadDe = (fichero: string | null): Dificultad =>
  reglasDe(fichero ? leerTodas().find((p) => p.fichero === fichero) : null);

/**
 * Que pedirle al randomizer sobre los de revivir al hacer o rehacer una copia.
 *
 * Sin dificultad -una partida o una semilla de antes de que existieran- no se
 * dice nada, y el servicio hace lo de entonces. Es lo que deja rehacerlas byte
 * a byte: con cualquier otra cosa saldria otra copia y el guardado no encajaria.
 */
export const sinRevivirDe = (dificultad: Dificultad | null | undefined): boolean | undefined =>
  dificultad ? sinRevivirEn(dificultad) : undefined;

/** La semilla de una partida, o null si no se puede rehacer. */
export const semillaDePartida = (partida: PartidaGuardada): Semilla | null =>
  sePuedeRehacer(partida) && partida.crc32
    ? {
        baseCrc32: partida.baseCrc32,
        crc32: partida.crc32,
        semilla: partida.semilla!,
        ajustes: partida.ajustes!,
        dificultad: partida.dificultad ?? null,
      }
    : null;

/**
 * Marca una partida como de Soul Link, con quien se empieza.
 *
 * El companero solo se apunta si no lo habia: la Soul Link es con quien se
 * empezo y eso no cambia despues.
 */
export const marcarSoullink = (fichero: string, companero: string | null = null): void => {
  escribirTodas(
    leerTodas().map((p) =>
      p.fichero === fichero
        ? {
            ...p,
            soullink: true,
            soullinkDescartado: false,
            companeroSoullink: p.companeroSoullink ?? companero,
          }
        : p,
    ),
  );
};

/** Con quien se empezo la Soul Link de esa partida, si se sabe. */
export const companeroDeSoullink = (fichero: string | null): string | null =>
  (fichero ? leerTodas().find((p) => p.fichero === fichero)?.companeroSoullink : null) ?? null;

/**
 * Apunta que esta partida NO es una Soul Link.
 *
 * Solo se ofrece al principio de la partida: ahi todavia no hay parejas que
 * romper. Despues el modo ya no cambia.
 */
export const descartarSoullink = (fichero: string): void => {
  escribirTodas(
    leerTodas().map((p) =>
      p.fichero === fichero ? { ...p, soullink: false, soullinkDescartado: true } : p,
    ),
  );
};

/**
 * Si esa partida se juega como Soul Link.
 *
 * - `si`: se eligio, o nacio de una invitacion.
 * - `no`: se dijo que no.
 * - `sin-decidir`: nadie lo ha preguntado todavia.
 *
 * Las de antes de que esto existiera (null) cuentan como `si`: abrir una sala
 * las marcaba solas, y asi se jugaban.
 */
export type ModoSoullink = 'si' | 'no' | 'sin-decidir';

export const modoSoullink = (fichero: string | null): ModoSoullink => {
  const partida = fichero ? leerTodas().find((p) => p.fichero === fichero) : undefined;
  if (!partida) return 'sin-decidir';
  if (partida.soullink === true || partida.soullink === null) return 'si';
  return partida.soullinkDescartado ? 'no' : 'sin-decidir';
};

/** Si esa partida es de Soul Link, mirando por su fichero. */
export const esSoullink = (fichero: string | null): boolean =>
  fichero !== null && leerTodas().some((p) => p.fichero === fichero && p.soullink === true);

/**
 * Si una partida se puede volver a generar desde su semilla.
 *
 * Las partidas creadas antes de que existiera la semilla no la tienen, y las
 * hechas sin jjs tampoco: en esos casos la copia vive solo en este navegador.
 */
export const sePuedeRehacer = (partida: PartidaGuardada): boolean =>
  Boolean(partida.semilla && partida.ajustes);

const CLAVE = 'emupoke.partidas';

/**
 * Cuantas partidas aleatorizadas se guardan como mucho.
 *
 * No es un capricho: cada copia es una ROM entera de 16 MB viviendo en el
 * almacenamiento del navegador. Sin tope se llena solo, y cuando el navegador
 * se queda sin sitio lo que falla no es esto sino los guardados, que es lo
 * ultimo que uno quiere perder.
 */
export const MAX_PARTIDAS = 3;

/**
 * Cuantas partidas puede guardar quien NO ha iniciado sesion: ninguna.
 *
 * Sin cuenta se puede aleatorizar y jugar -eso no se le quita a nadie- pero la
 * partida no se queda en la lista: al cerrar la pestaña se pierde. Las tres
 * ranuras son de quien tiene cuenta.
 *
 * ESTO HAY QUE DECIRLO ANTES, no despues. Alguien que juega diez horas y
 * descubre al recargar que no habia nada guardado no vuelve, y con razon. El
 * aviso va en la pantalla de crear, antes de generar nada.
 */
export const MAX_PARTIDAS_SIN_CUENTA = 0;

/** El cupo que le toca a quien esta mirando. */
export const cupoDePartidas = (conCuenta: boolean): number =>
  conCuenta ? MAX_PARTIDAS : MAX_PARTIDAS_SIN_CUENTA;

const leerTodas = (): PartidaGuardada[] => {
  try {
    const crudo = globalThis.localStorage?.getItem(CLAVE);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    return Array.isArray(datos) ? (datos as PartidaGuardada[]) : [];
  } catch {
    return [];
  }
};

const escribirTodas = (partidas: PartidaGuardada[]): void => {
  try {
    globalThis.localStorage?.setItem(CLAVE, JSON.stringify(partidas));
  } catch {
    // Sin almacenamiento la partida sigue jugandose, solo que no se recuerda.
  }
};

/** Todas las partidas guardadas, de la mas reciente a la mas vieja. */
export const todasLasPartidas = (): PartidaGuardada[] =>
  leerTodas().sort((a, b) => b.jugada - a.jugada);

/**
 * Partidas que corresponden a una ROM base, de la mas reciente a la mas vieja.
 *
 * Se filtran por CRC y no por nombre de fichero: el mismo juego puede llegar
 * con otro nombre y seguir siendo el mismo.
 */
export const partidasDe = (baseCrc32: string): PartidaGuardada[] =>
  leerTodas()
    .filter((p) => p.baseCrc32 === baseCrc32)
    .sort((a, b) => b.jugada - a.jugada);

/** Nombre de fichero unico para una copia nueva. */
export const nombreParaNueva = (baseNombre: string): string => {
  const sinExtension = baseNombre.replace(/\.gba$/i, '');
  // Sufijo corto derivado del momento: basta para no chocar y se lee bien.
  return `${sinExtension}-aleatoria-${Date.now().toString(36)}.gba`;
};

export const registrar = (partida: Omit<PartidaGuardada, 'id' | 'creada' | 'jugada'>): PartidaGuardada => {
  const ahora = Date.now();
  const nueva: PartidaGuardada = { ...partida, id: `${ahora.toString(36)}`, creada: ahora, jugada: ahora };
  escribirTodas([...leerTodas(), nueva]);
  return nueva;
};

/** Le cambia el nombre. Vacio vuelve a dejarla sin nombre propio. */
export const renombrar = (id: string, nombre: string): void => {
  const limpio = nombre.trim().slice(0, 40);
  escribirTodas(
    leerTodas().map((p) => (p.id === id ? { ...p, nombre: limpio === '' ? null : limpio } : p)),
  );
};

/**
 * Cambia la dificultad de una partida recien hecha.
 *
 * Solo tiene sentido en la pantalla que sale justo despues de aleatorizar: ahi
 * todavia no se ha jugado nada. Va con el CRC porque Normal deja los de revivir
 * en las tiendas y eso es otra copia, y la semilla tiene que poder rehacer la
 * que de verdad se juega.
 */
export const cambiarDificultad = (id: string, dificultad: Dificultad, crc32: string): void => {
  escribirTodas(leerTodas().map((p) => (p.id === id ? { ...p, dificultad, crc32 } : p)));
};

/**
 * Como se llama una partida en pantalla.
 *
 * Con nombre propio, el suyo. Sin el -las de antes de que esto existiera-, lo
 * que se aleatorizo, que es lo unico que habia.
 */
export const nombreDePartida = (partida: PartidaGuardada): string =>
  partida.nombre ?? resumirCambios(partida.cambiado);

/**
 * De que juego es, en palabras.
 *
 * Con el dato guardado, su nombre. Sin el -las partidas de antes-, el del
 * fichero sin la extension, que al menos lo deja reconocer.
 */
export const juegoDePartida = (partida: PartidaGuardada): string =>
  partida.juego ?? partida.baseNombre.replace(/\.[^.]+$/, '');

/** Marca una partida como jugada ahora, para que suba en la lista. */
export const tocar = (id: string): void => {
  escribirTodas(leerTodas().map((p) => (p.id === id ? { ...p, jugada: Date.now() } : p)));
};

export const olvidar = (id: string): void => {
  escribirTodas(leerTodas().filter((p) => p.id !== id));
};

/** Describe en una linea que se aleatorizo, para la lista. */
export const resumirCambios = (cambiado: string[]): string => {
  if (cambiado.length === 0) return 'sin cambios';
  if (cambiado.length <= 3) return cambiado.join(', ');
  return `${cambiado.slice(0, 2).join(', ')} y ${cambiado.length - 2} mas`;
};

/** Fecha corta y legible, del estilo "hoy 21:14" o "27 sept". */
export const cuando = (momento: number): string => {
  const fecha = new Date(momento);
  const hoy = new Date();
  const mismoDia =
    fecha.getDate() === hoy.getDate() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getFullYear() === hoy.getFullYear();

  return mismoDia
    ? `hoy ${fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}`
    : fecha.toLocaleDateString('es', { day: 'numeric', month: 'short' });
};

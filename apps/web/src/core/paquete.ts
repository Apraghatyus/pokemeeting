// Una partida entera en un solo fichero, para llevarsela a otro aparato.
//
// El problema que resuelve: el `.sav` guarda por donde vas, pero no en que
// mundo. Con una copia aleatorizada eso no vale de nada, porque el guardado
// solo encaja con la copia exacta con la que se jugo. Quien quisiera seguir en
// el movil se llevaba el guardado y no tenia donde cargarlo.
//
// Asi que el fichero lleva dos cosas: el guardado y la semilla -ROM base,
// semilla y ajustes- con la que se vuelve a generar esa copia exacta.
//
// Lo que NO lleva es la ROM. Y no es un descuido: es lo que permite que este
// fichero se pueda mover, copiar y guardar donde sea. Al cargarlo hay que tener
// la ROM original, que es tuya y ya la tienes; de ahi sale el mundo otra vez.
//
// El formato es a proposito de los que se pueden mirar con un editor de texto:
// dos lineas legibles y detras el guardado tal cual. Si algun dia esto se
// rompe, se ve de un vistazo por donde.

import type { Semilla } from './semilla';

const MARCA = 'EMUPOKE-PARTIDA-1';

export type Partida = {
  semilla: Semilla;
  /** El guardado del juego, tal cual lo escribio la consola. */
  sav: Uint8Array;
  /** Nombre con el que se enseña, normalmente el del juego. */
  nombre: string;
  /** Cuando se exporto, en milisegundos. */
  creada: number;
};

const SALTO = 0x0a;

/** Empaqueta una partida para descargarla. */
export const empaquetar = ({ semilla, sav, nombre }: Omit<Partida, 'creada'>): Uint8Array => {
  const cabecera = new TextEncoder().encode(
    `${MARCA}\n${JSON.stringify({ semilla, nombre, creada: Date.now() })}\n`,
  );
  const todo = new Uint8Array(cabecera.length + sav.length);
  todo.set(cabecera, 0);
  todo.set(sav, cabecera.length);
  return todo;
};

/**
 * Lee un fichero de partida.
 *
 * Devuelve null en vez de lanzar cuando no lo es: por aqui pasa cualquier
 * fichero que alguien arrastre, y un `.sav` suelto o una ROM tienen que dar un
 * "esto no es" tranquilo y no un error raro.
 */
export const leerPaquete = (bytes: Uint8Array): Partida | null => {
  const primerSalto = bytes.indexOf(SALTO);
  if (primerSalto < 0) return null;

  const marca = new TextDecoder().decode(bytes.subarray(0, primerSalto));
  if (marca.trim() !== MARCA) return null;

  const segundoSalto = bytes.indexOf(SALTO, primerSalto + 1);
  if (segundoSalto < 0) return null;

  let cabecera: { semilla?: Semilla; nombre?: string; creada?: number };
  try {
    cabecera = JSON.parse(
      new TextDecoder().decode(bytes.subarray(primerSalto + 1, segundoSalto)),
    ) as typeof cabecera;
  } catch {
    return null;
  }

  const semilla = cabecera.semilla;
  if (
    !semilla ||
    typeof semilla.baseCrc32 !== 'string' ||
    typeof semilla.crc32 !== 'string' ||
    typeof semilla.semilla !== 'string' ||
    typeof semilla.ajustes !== 'string'
  ) {
    return null;
  }

  const sav = bytes.slice(segundoSalto + 1);
  // Un guardado de GBA son 128 KB y uno de Game Boy menos, pero vacio no vale:
  // sin el, esto es una semilla con pasos de mas.
  if (sav.length === 0) return null;

  return {
    semilla,
    sav,
    nombre: typeof cabecera.nombre === 'string' ? cabecera.nombre : 'partida',
    creada: typeof cabecera.creada === 'number' ? cabecera.creada : Date.now(),
  };
};

/** Nombre de fichero para descargar, sin caracteres que molesten. */
export const nombreDeFichero = (nombre: string): string =>
  `${nombre.replace(/\.[^.]+$/, '').replace(/[^\w\s-]/g, '').trim() || 'partida'}.emupoke`;

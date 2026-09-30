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
};

/**
 * Si una partida se puede volver a generar desde su receta.
 *
 * Las partidas creadas antes de que existiera la receta no la tienen, y las
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

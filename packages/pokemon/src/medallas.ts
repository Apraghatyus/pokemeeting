// Las medallas conseguidas.
//
// Son banderas: bits sueltos en un byte. Eso las hace fáciles de leer y
// difíciles de **encontrar**, que es justo al revés que el equipo. El equipo se
// localiza por su checksum, que es una forma reconocible; un byte de banderas no
// se distingue de cualquier otro byte.
//
// Y en Rojo Fuego y Verde Hoja tampoco vale una dirección fija: esos juegos
// mueven sus bloques de guardado de sitio, que es la misma razón por la que el
// equipo se busca en vez de leerse de una constante.
//
// Así que la dirección hay que averiguarla comparando dos partidas, una antes y
// otra después de ganar un gimnasio. Para eso está `tools/buscar-medallas.mjs`.
// Mientras no se sepa, esto dice que no lo sabe en vez de inventárselo: enseñar
// cero medallas a quien tiene cuatro es peor que no enseñar nada.

import { desplazamientoDe } from './savestate';

/** Cuántas medallas hay en una región. Las ocho de siempre. */
export const TOTAL_MEDALLAS = 8;

/**
 * Dónde vive el byte de las medallas, por juego.
 *
 * Vacío a propósito: todavía no se ha medido ninguna. Añadir una entrada aquí
 * es lo único que hace falta para que funcione, y el valor sale de la
 * herramienta de búsqueda.
 *
 * No se pone "la dirección que dice internet" sin comprobarla: en este proyecto
 * las direcciones se validan contra una partida real antes de usarse, porque
 * leer el byte equivocado no falla, solo miente.
 */
export const DIRECCION_MEDALLAS: Readonly<Record<string, number>> = {};

export type Medallas = {
  /** Cuántas lleva, o null si de este juego todavía no se sabe leerlas. */
  cuantas: number | null;
  /** Una por medalla: true si está conseguida. Vacío si no se sabe. */
  conseguidas: boolean[];
};

export const SIN_SABER: Medallas = { cuantas: null, conseguidas: [] };

/**
 * Lee las medallas de un estado.
 *
 * El byte tiene que ser un prefijo de bits -las medallas se ganan en orden, así
 * que solo puede valer 0, 1, 3, 7...- y si no lo es, se devuelve "no se sabe".
 * Esa comprobación es lo que convierte una dirección equivocada en un hueco
 * honesto en vez de en un número inventado.
 */
export const leerMedallas = (estado: Uint8Array, codigoJuego: string): Medallas => {
  const direccion = DIRECCION_MEDALLAS[codigoJuego.slice(0, 3).toUpperCase()];
  if (direccion === undefined) return SIN_SABER;

  const donde = desplazamientoDe(direccion);
  if (!donde) return SIN_SABER;

  const byte = estado[donde.offset];
  if (byte === undefined) return SIN_SABER;

  // Las medallas se ganan en orden: cualquier otra cosa es que no es este byte.
  if ((byte & (byte + 1)) !== 0) return SIN_SABER;

  const conseguidas = Array.from({ length: TOTAL_MEDALLAS }, (_, i) => (byte & (1 << i)) !== 0);
  return { cuantas: conseguidas.filter(Boolean).length, conseguidas };
};

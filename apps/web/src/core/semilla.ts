// La semilla de una partida aleatorizada.
//
// Una copia aleatorizada no se guarda fuera del navegador ni se descarga: se
// sabe rehacer. Con la ROM original, la semilla y los ajustes exactos, el
// randomizer produce la misma copia byte a byte, y eso esta comprobado
// comparando el fichero entero, no una muestra.
//
// La semilla es ese trio convertido en una linea de texto que el jugador puede
// guardar donde quiera. Sirve para dos cosas: recuperar tu propio mundo si
// este navegador se queda sin datos o si juegas desde otro ordenador, y darle
// a tu companero exactamente el mismo mundo que el tuyo.
//
// Desde que hay dificultades lleva tambien la de la partida, como un sexto
// campo al final. Va aqui porque cambia la copia -los de revivir salen o no de
// las tiendas- y porque asi viaja sola en la invitacion de un Soul Link: los
// dos tienen que jugar con las mismas reglas. Las semillas de antes, de cinco
// campos, se siguen leyendo, y entonces no hay dificultad: se rehacen como se
// hicieron.
//
// Lo que NO lleva es la ROM. Una semilla sin la ROM original no vale para nada,
// que es justo lo que se quiere: se puede compartir sin repartir el juego.

import { esDificultad, type Dificultad } from '@emupoke/protocol';

/** Marca de version al principio: si algun dia cambia el formato, se sabra. */
const MARCA = 'EMUPOKE1';

const SEPARADOR = '.';

export type Semilla = {
  /** CRC de la ROM original. Sin la misma ROM base la semilla no aplica. */
  baseCrc32: string;
  semilla: string;
  /** Ajustes en el formato del randomizer. */
  ajustes: string;
  /** CRC de la copia generada, para comprobar que lo rehecho es lo mismo. */
  crc32: string;
  /** Con que reglas se juega. Null en las semillas de antes de que existieran. */
  dificultad?: Dificultad | null;
};

export const codificarSemilla = (semilla: Semilla): string =>
  [
    MARCA,
    semilla.baseCrc32,
    semilla.crc32,
    semilla.semilla,
    semilla.ajustes,
    // Sin dificultad se escribe como antes, con cinco campos.
    ...(semilla.dificultad ? [semilla.dificultad] : []),
  ].join(SEPARADOR);

/**
 * Lee una semilla pegada por el jugador.
 *
 * Se limpian espacios y saltos de linea porque una semilla viaja por chat o por
 * correo, y volver de ahi con un salto de linea en medio es lo normal. Los
 * ajustes del randomizer son base64, que no usa el punto, asi que partir por
 * puntos es seguro aunque la cadena de ajustes sea larga.
 */
export const descodificarSemilla = (texto: string): Semilla | null => {
  const limpio = texto.replace(/\s+/g, '');
  const partes = limpio.split(SEPARADOR);
  if (partes.length !== 5 && partes.length !== 6) return null;

  const [marca, baseCrc32, crc32, semilla, ajustes, dificultad] = partes;
  if (dificultad !== undefined && !esDificultad(dificultad)) return null;
  if (marca !== MARCA) return null;
  if (!baseCrc32 || !crc32 || !semilla || !ajustes) return null;
  if (!/^[0-9a-f]{8}$/i.test(baseCrc32) || !/^[0-9a-f]{8}$/i.test(crc32)) return null;
  if (!/^\d+$/.test(semilla)) return null;

  return {
    baseCrc32: baseCrc32.toLowerCase(),
    crc32: crc32.toLowerCase(),
    semilla,
    ajustes,
    dificultad: dificultad ?? null,
  };
};

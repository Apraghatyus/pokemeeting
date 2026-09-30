// La receta de una partida aleatorizada.
//
// Una copia aleatorizada no se guarda fuera del navegador ni se descarga: se
// sabe rehacer. Con la ROM original, la semilla y los ajustes exactos, el
// randomizer produce la misma copia byte a byte, y eso esta comprobado
// comparando el fichero entero, no una muestra.
//
// La receta es ese trio convertido en una linea de texto que el jugador puede
// guardar donde quiera. Sirve para dos cosas: recuperar tu propio mundo si
// este navegador se queda sin datos o si juegas desde otro ordenador, y darle
// a tu companero exactamente el mismo mundo que el tuyo.
//
// Lo que NO lleva es la ROM. Una receta sin la ROM original no vale para nada,
// que es justo lo que se quiere: se puede compartir sin repartir el juego.

/** Marca de version al principio: si algun dia cambia el formato, se sabra. */
const MARCA = 'EMUPOKE1';

const SEPARADOR = '.';

export type Receta = {
  /** CRC de la ROM original. Sin la misma ROM base la receta no aplica. */
  baseCrc32: string;
  semilla: string;
  /** Ajustes en el formato del randomizer. */
  ajustes: string;
  /** CRC de la copia generada, para comprobar que lo rehecho es lo mismo. */
  crc32: string;
};

export const codificarReceta = (receta: Receta): string =>
  [MARCA, receta.baseCrc32, receta.crc32, receta.semilla, receta.ajustes].join(SEPARADOR);

/**
 * Lee una receta pegada por el jugador.
 *
 * Se limpian espacios y saltos de linea porque una receta viaja por chat o por
 * correo, y volver de ahi con un salto de linea en medio es lo normal. Los
 * ajustes del randomizer son base64, que no usa el punto, asi que partir por
 * puntos es seguro aunque la cadena de ajustes sea larga.
 */
export const descodificarReceta = (texto: string): Receta | null => {
  const limpio = texto.replace(/\s+/g, '');
  const partes = limpio.split(SEPARADOR);
  if (partes.length !== 5) return null;

  const [marca, baseCrc32, crc32, semilla, ajustes] = partes;
  if (marca !== MARCA) return null;
  if (!baseCrc32 || !crc32 || !semilla || !ajustes) return null;
  if (!/^[0-9a-f]{8}$/i.test(baseCrc32) || !/^[0-9a-f]{8}$/i.test(crc32)) return null;
  if (!/^\d+$/.test(semilla)) return null;

  return {
    baseCrc32: baseCrc32.toLowerCase(),
    crc32: crc32.toLowerCase(),
    semilla,
    ajustes,
  };
};

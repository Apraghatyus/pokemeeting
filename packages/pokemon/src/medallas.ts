// Las medallas conseguidas.
//
// AQUI HUBO UN CAMINO EQUIVOCADO Y CONVIENE SABERLO, porque es el que parece
// obvio: buscarlas en la memoria del juego, como el equipo. No funciona. Las
// medallas son banderas -bits sueltos- y un byte de banderas no se distingue de
// cualquier otro byte, asi que no se puede localizar por su forma. Y Rojo Fuego
// coloca su bloque de guardado donde le cabe: medido en una partida real estaba
// en 0x0200148c, dentro del monton, asi que tampoco vale una direccion fija.
//
// Lo que SI tiene forma es el fichero de guardado. Son catorce secciones de
// 4096 bytes, cada una con su identificador y una firma al final, y por duplicado
// para que un corte a mitad de guardar no se lleve la partida. Reconstruyendo el
// bloque desde ahi, el byte de las medallas cae siempre en el mismo sitio.
//
// LO QUE ESTO CUESTA, y hay que decirlo: el juego escribe en el fichero de
// guardado cuando el jugador guarda, no al ganar la medalla. Asi que esto
// ensena las medallas **a fecha del ultimo guardado**. En una Nuzlocke, donde se
// guarda cada dos pasos, es poca diferencia; pero si alguien gana la octava y
// mira sin guardar, vera siete.

/** Cuantas medallas hay en una region. Las ocho de siempre. */
export const TOTAL_MEDALLAS = 8;

/**
 * Donde vive el byte de las medallas dentro del bloque de guardado, por juego.
 *
 * El numero sale de las banderas: la primera medalla es la bandera 0x820, y como
 * las ocho van seguidas y empiezan en un multiplo de ocho, ocupan un byte
 * entero. 0x0EE0 -donde empiezan las banderas- mas 0x820/8 da 0x0FE4.
 *
 * COMPROBADO contra una partida real y contra el propio juego: su tarjeta de
 * entrenador decia "MEDALLAS 1" en Mt. Moon, y ahi ese byte vale 0x01. No es un
 * detalle menor: se probaron otros dos sitios que tambien cumplian la regla de
 * los bits -uno daba 2 medallas y otro 8-, y los descarto el juego, no una
 * suposicion.
 *
 * Solo esta Rojo Fuego porque es el unico que se ha podido comprobar. Verde Hoja
 * usa el mismo formato casi con total seguridad, pero "casi" no basta: con una
 * partida suya y su tarjeta de entrenador se confirma en un minuto.
 */
export const MEDALLAS_EN_BLOQUE1: Readonly<Record<string, number>> = {
  BPR: 0x0fe4,
};

/** Lo que mide cada seccion del fichero de guardado, con su pie incluido. */
const TAMANO_SECCION = 4096;
/** Lo que de verdad son datos: el resto es el pie con identificador y firma. */
const DATOS_POR_SECCION = 3968;
/** Marca que el juego escribe al final de cada seccion suya. */
const FIRMA = 0x08012025;
/** Cuantas secciones tiene cada copia del guardado. */
const SECCIONES_POR_COPIA = 14;
/** Las cuatro que forman el bloque donde viven las banderas. */
const SECCIONES_DEL_BLOQUE1 = [1, 2, 3, 4];

export type Medallas = {
  /** Cuantas lleva, o null si de este juego todavia no se sabe leerlas. */
  cuantas: number | null;
  /** Una por medalla: true si esta conseguida. Vacio si no se sabe. */
  conseguidas: boolean[];
};

export const SIN_SABER: Medallas = { cuantas: null, conseguidas: [] };

/**
 * Rehace el bloque de guardado a partir del fichero.
 *
 * De las dos copias se coge la que tenga el contador mas alto, que es la buena:
 * el juego va alternando entre las dos a proposito.
 *
 * Devuelve null ante cualquier cosa rara -una copia incompleta, una firma que no
 * esta-. Un guardado que no se entiende tiene que acabar en "no lo se" y no en
 * un numero inventado.
 */
export const bloqueDeGuardado = (guardado: Uint8Array): Uint8Array | null => {
  if (guardado.length < TAMANO_SECCION * SECCIONES_POR_COPIA) return null;
  const vista = new DataView(guardado.buffer, guardado.byteOffset, guardado.byteLength);

  let mejorContador = -1;
  let mejores: Map<number, number> | null = null;

  const copias = Math.floor(guardado.length / (TAMANO_SECCION * SECCIONES_POR_COPIA));
  for (let copia = 0; copia < copias; copia += 1) {
    const secciones = new Map<number, number>();
    let contador = -1;

    for (let i = 0; i < SECCIONES_POR_COPIA; i += 1) {
      const base = (copia * SECCIONES_POR_COPIA + i) * TAMANO_SECCION;
      if (base + TAMANO_SECCION > guardado.length) break;
      if (vista.getUint32(base + 0x0ff8, true) !== FIRMA) continue;
      secciones.set(vista.getUint16(base + 0x0ff4, true), base);
      contador = vista.getUint32(base + 0x0ffc, true);
    }

    // Una copia a medias no vale: le faltaria justo la seccion que se mira.
    if (secciones.size === SECCIONES_POR_COPIA && contador > mejorContador) {
      mejorContador = contador;
      mejores = secciones;
    }
  }

  if (!mejores) return null;

  const bloque = new Uint8Array(DATOS_POR_SECCION * SECCIONES_DEL_BLOQUE1.length);
  for (const [orden, id] of SECCIONES_DEL_BLOQUE1.entries()) {
    const base = mejores.get(id);
    if (base === undefined) return null;
    bloque.set(guardado.subarray(base, base + DATOS_POR_SECCION), orden * DATOS_POR_SECCION);
  }
  return bloque;
};

/**
 * Lee las medallas del fichero de guardado.
 *
 * El byte tiene que ser un prefijo de bits -las medallas se ganan en orden, asi
 * que solo puede valer 0, 1, 3, 7...- y si no lo es, se devuelve "no se sabe".
 * Esa comprobacion es lo que convierte un guardado raro en un hueco honesto en
 * vez de en un numero inventado.
 */
export const leerMedallas = (guardado: Uint8Array | null, codigoJuego: string): Medallas => {
  if (!guardado) return SIN_SABER;

  const donde = MEDALLAS_EN_BLOQUE1[codigoJuego.slice(0, 3).toUpperCase()];
  if (donde === undefined) return SIN_SABER;

  const bloque = bloqueDeGuardado(guardado);
  if (!bloque) return SIN_SABER;

  const byte = bloque[donde];
  if (byte === undefined) return SIN_SABER;

  // Las medallas se ganan en orden: cualquier otra cosa es que no es este byte.
  if ((byte & (byte + 1)) !== 0) return SIN_SABER;

  const conseguidas = Array.from({ length: TOTAL_MEDALLAS }, (_, i) => (byte & (1 << i)) !== 0);
  return { cuantas: conseguidas.filter(Boolean).length, conseguidas };
};

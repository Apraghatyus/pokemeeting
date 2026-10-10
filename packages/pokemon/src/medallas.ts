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
// ESO COSTABA UNA COSA: el juego escribe en el fichero de guardado cuando el
// jugador guarda, no al ganar la medalla. Asi que las medallas se veian **a
// fecha del ultimo guardado**: ganabas a Brock, el juego decia "obtuviste la
// MEDALLA ROCA" y aqui seguia apagada hasta que te acordabas de guardar.
//
// POR ESO SE LEEN TAMBIEN DE LA MEMORIA, que es lo que se intento primero y no
// salio. Lo que fallaba era buscar el bloque en una direccion fija: Rojo Fuego
// lo coloca en un sitio distinto cada vez que carga -es su proteccion contra
// trucos- y medido en dos estados de la MISMA partida estaba en 0x02025ad8 y en
// 0x02025b00.
//
// Lo que si esta quieto es un puntero que lo sigue, en 0x020398ac. Se comprobo
// en tres estados reales, uno de ellos dentro de un combate, que es justo donde
// la direccion fija fallaba.
//
// Y COMO NO ME FIO DE UN PUNTERO ENCONTRADO A MANO, lo que diga la memoria solo
// se usa si cuadra con lo que dice el guardado: tiene que ser un prefijo de bits
// y no puede llevar MENOS medallas que el fichero, porque una medalla no se
// pierde. Si no cuadra, se usa el guardado como antes. Asi, un puntero que algun
// dia deje de valer no ensena una barbaridad: ensena lo de siempre.

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

/**
 * Donde vive, por juego, el puntero que sigue al bloque de guardado en memoria.
 *
 * El numero sale de buscar, en dos estados de la misma partida, una direccion
 * que apuntara cerca del bloque en los dos. Solo hubo una en toda la memoria.
 *
 * Lo que apunta no es exactamente el principio del bloque: las medallas caen
 * 0x1000 bytes mas alla, y asi se escribe -sin inventarse una resta que no se
 * ha comprobado-.
 */
export const PUNTERO_AL_BLOQUE: Readonly<Record<string, number>> = {
  BPR: 0x020398ac,
};

/** Del puntero a las medallas. Ver `PUNTERO_AL_BLOQUE`. */
const MEDALLAS_DESDE_PUNTERO = 0x1000;

/** Donde empieza la memoria principal dentro de un estado, y que direccion es. */
const EWRAM_EN_EL_ESTADO = 0x21000;
const EWRAM_TAMANO = 0x40000;
const EWRAM_BASE = 0x02000000;

/** Lee un entero de 32 bits de la memoria principal, o null si cae fuera. */
const leerEnMemoria = (estado: Uint8Array, direccion: number): number | null => {
  const dentro = direccion - EWRAM_BASE;
  if (dentro < 0 || dentro + 4 > EWRAM_TAMANO) return null;
  const donde = EWRAM_EN_EL_ESTADO + dentro;
  if (donde + 4 > estado.length) return null;
  return new DataView(estado.buffer, estado.byteOffset, estado.byteLength).getUint32(donde, true);
};

/** Lee un byte de la memoria principal, o null si cae fuera. */
const byteEnMemoria = (estado: Uint8Array, direccion: number): number | null => {
  const dentro = direccion - EWRAM_BASE;
  if (dentro < 0 || dentro >= EWRAM_TAMANO) return null;
  const donde = EWRAM_EN_EL_ESTADO + dentro;
  return donde < estado.length ? (estado[donde] ?? null) : null;
};

/**
 * Las medallas tal y como estan AHORA en la memoria del juego, sin guardar.
 *
 * Es lo que hace que la medalla se encienda en cuanto el juego dice que te la
 * dan, y no cuando te acuerdas de guardar.
 *
 * Devuelve null si de este juego no se sabe donde mirar, si el puntero no apunta
 * a la memoria principal o si lo que hay ahi no puede ser un byte de medallas.
 */
export const medallasEnMemoria = (estado: Uint8Array, codigoJuego: string): number | null => {
  const puntero = PUNTERO_AL_BLOQUE[codigoJuego.slice(0, 3).toUpperCase()];
  if (puntero === undefined) return null;

  const bloque = leerEnMemoria(estado, puntero);
  if (bloque === null || bloque < EWRAM_BASE || bloque >= EWRAM_BASE + EWRAM_TAMANO) return null;

  const byte = byteEnMemoria(estado, bloque + MEDALLAS_DESDE_PUNTERO);
  if (byte === null) return null;
  // Las medallas se ganan en orden: cualquier otra cosa es que ahi no estan.
  return (byte & (byte + 1)) === 0 ? byte : null;
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
/** Un byte de banderas, en medallas. Siempre sabe cuantas: el byte ya se valido. */
const deUnByte = (byte: number): Medallas & { cuantas: number } => {
  const conseguidas = Array.from({ length: TOTAL_MEDALLAS }, (_, i) => (byte & (1 << i)) !== 0);
  return { cuantas: conseguidas.filter(Boolean).length, conseguidas };
};

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

  return deUnByte(byte);
};

/**
 * Las medallas de verdad: las del guardado, y las de ahora si cuadran.
 *
 * La memoria manda cuando se puede leer, porque es la que esta al dia: la
 * medalla se enciende en cuanto el juego dice que te la da. Pero solo si lleva
 * al menos tantas como el fichero, porque una medalla no se pierde y una cuenta
 * mas baja solo puede significar que el puntero dejo de valer.
 *
 * Sin estado -o sin saber leerlo- se queda lo del guardado, que es lo que habia.
 */
export const medallasAhora = (
  guardado: Uint8Array | null,
  estado: Uint8Array | null,
  codigoJuego: string,
): Medallas => {
  const delFichero = leerMedallas(guardado, codigoJuego);
  if (!estado) return delFichero;

  const byte = medallasEnMemoria(estado, codigoJuego);
  if (byte === null) return delFichero;

  const enVivo = deUnByte(byte);
  if (delFichero.cuantas !== null && enVivo.cuantas < delFichero.cuantas) return delFichero;
  return enVivo;
};

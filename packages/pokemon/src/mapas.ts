// En que mapa esta el jugador ahora mismo.
//
// Lo que se busca es la ZONA (la "seccion de mapa" del juego: Ruta 3, Ciudad
// Celeste, Mt. Moon...), que es el mismo numero que cada Pokemon lleva dentro
// como sitio de captura. Con eso se pinta el mapa de rutas gastadas y se sabe
// donde anda cada uno. Y el MAPA concreto (grupo y numero), que distingue estar
// dentro del Centro Pokemon de estar en la calle de la ciudad: la zona es la
// misma en los dos.
//
// NO SE USAN DIRECCIONES ENCONTRADAS A MANO, a proposito. Las de las medallas
// costaron una tarde por juego y solo valen para Rojo Fuego. Esto va por forma,
// igual que el equipo, en dos pasos:
//
// 1. EN LA ROM, la tabla de mapas (`gMapGroups` en los proyectos de
//    decompilacion). Es una lista de grupos; cada grupo, una lista de punteros
//    a cabeceras de mapa; y cada cabecera tiene una forma muy reconocible:
//    cuatro punteros a la ROM seguidos (disposicion, eventos, guiones y
//    conexiones, esta ultima puede ser 0), y luego musica, disposicion, zona y
//    tipo de mapa con valores acotados. Veinte grupos seguidos con esa forma
//    no se dan por casualidad.
//
// 2. EN LA MEMORIA, la copia de la cabecera del mapa actual (`gMapHeader`). El
//    juego la copia entera al entrar en cada mapa, asi que basta buscar en la
//    memoria principal una cabecera que sea IDENTICA a una de la tabla. La
//    direccion se recuerda; si deja de cuadrar, se vuelve a buscar.
//
// Vale para los cinco juegos de tercera generacion sin tocar nada, y si algo
// no cuadra devuelve "no se sabe" en vez de inventarse un sitio.

import { REGIONES, TAMANO_ESTADO } from './savestate';

/** Lo que mide una cabecera de mapa en la ROM. */
export const ANCHO_CABECERA = 0x1c;

/** Por debajo de esto no es la tabla de mapas: los juegos tienen 33 o mas grupos. */
const MIN_GRUPOS = 20;
/** Un grupo con mas mapas que esto no es un grupo. */
const MAX_MAPAS_POR_GRUPO = 400;
/** Las zonas van de 0 a 0xD5 en Esmeralda, el que mas tiene. */
const MAX_ZONA = 0xd5;
/** Los tipos de mapa van de 0 a 9 (ciudad, ruta, interior, subterraneo...). */
const MAX_TIPO = 9;

/** Tipos de mapa del juego que interesan aqui. */
export const TIPO_INTERIOR = 8;

const ROM_BASE = 0x08000000;

export type MapaInfo = {
  grupo: number;
  numero: number;
  /** La seccion de mapa: lo que se llama "zona" en todo el programa. */
  zona: number;
  /** Tipo de mapa del juego. 8 es interior. */
  tipo: number;
  /** Puntero a la disposicion del mapa. La comparten los mapas iguales por dentro. */
  disposicion: number;
};

export type TablaMapas = {
  /** Donde empieza la tabla en la ROM. */
  offset: number;
  /** Cuantos grupos tiene. */
  grupos: number;
  /** Todos los mapas, con su cabecera como llave. */
  porCabecera: ReadonlyMap<string, MapaInfo>;
  /** Cuantos mapas comparten cada disposicion. */
  usosDeDisposicion: ReadonlyMap<number, number>;
  /** Un mapa por su grupo y numero. */
  mapa: (grupo: number, numero: number) => MapaInfo | null;
};

const u32 = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)) >>> 0) +
  bytes[offset + 3]! * 0x1000000;

/** Si un numero es un puntero dentro de esta ROM. */
const enRom = (rom: Uint8Array, valor: number): boolean =>
  valor >= ROM_BASE && valor < ROM_BASE + rom.length && (valor & 3) === 0;

/** Si en ese sitio de un bloque hay algo con forma de cabecera de mapa. */
const formaDeCabecera = (
  bytes: Uint8Array,
  offset: number,
  esRom: (valor: number) => boolean,
): boolean => {
  if (offset < 0 || offset + ANCHO_CABECERA > bytes.length) return false;
  const disposicion = u32(bytes, offset);
  const eventos = u32(bytes, offset + 4);
  const guiones = u32(bytes, offset + 8);
  const conexiones = u32(bytes, offset + 12);
  if (!esRom(disposicion) || !esRom(eventos) || !esRom(guiones)) return false;
  if (conexiones !== 0 && !esRom(conexiones)) return false;
  const idDisposicion = bytes[offset + 0x12]! | (bytes[offset + 0x13]! << 8);
  if (idDisposicion === 0 || idDisposicion > 0x400) return false;
  return bytes[offset + 0x14]! <= MAX_ZONA && bytes[offset + 0x17]! <= MAX_TIPO;
};

/**
 * La llave de una cabecera: lo que la distingue de las demas.
 *
 * Guiones, conexiones y los ocho bytes de musica, disposicion, zona, cueva,
 * tiempo y tipo. Se deja fuera el puntero a la disposicion y el de eventos,
 * que el juego puede cambiar en la copia de memoria en algun mapa especial; lo
 * que queda sigue siendo unico de cada mapa.
 */
const llave = (bytes: Uint8Array, offset: number): string => {
  let salida = '';
  for (let i = 8; i < 0x18; i += 1) salida += bytes[offset + i]!.toString(16).padStart(2, '0');
  return salida;
};

/**
 * Busca la tabla de mapas en la ROM.
 *
 * Se recorre de cuatro en cuatro buscando una racha de punteros a grupos cuya
 * primera entrada sea una cabecera. Tarda unas decenas de milisegundos y se
 * hace una vez por ROM.
 */
export const encontrarTablaMapas = (rom: Uint8Array): TablaMapas | null => {
  const esRom = (valor: number) => enRom(rom, valor);
  const aOffset = (puntero: number) => puntero - ROM_BASE;

  /** Si en ese sitio empieza un grupo: su primera entrada apunta a una cabecera. */
  const empiezaGrupo = (offset: number): boolean => {
    if (offset < 0 || offset + 4 > rom.length) return false;
    const primera = u32(rom, offset);
    return esRom(primera) && formaDeCabecera(rom, aOffset(primera), esRom);
  };

  for (let offset = 0; offset + 4 * MIN_GRUPOS <= rom.length; offset += 4) {
    const primero = u32(rom, offset);
    if (!esRom(primero) || !empiezaGrupo(aOffset(primero))) continue;

    let grupos = 0;
    while (offset + 4 * (grupos + 1) <= rom.length) {
      const puntero = u32(rom, offset + 4 * grupos);
      if (!esRom(puntero) || !empiezaGrupo(aOffset(puntero))) break;
      grupos += 1;
    }
    if (grupos < MIN_GRUPOS) continue;

    const inicios = Array.from({ length: grupos }, (_, g) => aOffset(u32(rom, offset + 4 * g)));
    const porCabecera = new Map<string, MapaInfo>();
    const porSitio = new Map<string, MapaInfo>();
    const usosDeDisposicion = new Map<number, number>();

    for (const [grupo, inicio] of inicios.entries()) {
      // Los grupos van seguidos en la ROM: uno acaba donde empieza el siguiente.
      // Sin ese limite, el ultimo mapa de un grupo se leeria tambien como el
      // primero del siguiente.
      const siguientes = inicios.filter((otro) => otro > inicio);
      const tope = siguientes.length > 0 ? Math.min(...siguientes) : Infinity;

      for (let numero = 0; numero < MAX_MAPAS_POR_GRUPO; numero += 1) {
        const donde = inicio + 4 * numero;
        if (donde >= tope || donde + 4 > rom.length) break;
        const puntero = u32(rom, donde);
        if (!esRom(puntero)) break;
        const cabecera = aOffset(puntero);
        if (!formaDeCabecera(rom, cabecera, esRom)) break;

        const info: MapaInfo = {
          grupo,
          numero,
          zona: rom[cabecera + 0x14]!,
          tipo: rom[cabecera + 0x17]!,
          disposicion: u32(rom, cabecera),
        };
        const clave = llave(rom, cabecera);
        if (!porCabecera.has(clave)) porCabecera.set(clave, info);
        porSitio.set(`${grupo}.${numero}`, info);
        usosDeDisposicion.set(info.disposicion, (usosDeDisposicion.get(info.disposicion) ?? 0) + 1);
      }
    }

    return {
      offset,
      grupos,
      porCabecera,
      usosDeDisposicion,
      mapa: (grupo, numero) => porSitio.get(`${grupo}.${numero}`) ?? null,
    };
  }

  return null;
};

export type MapaEnMemoria = MapaInfo & {
  /** Donde esta la copia de la cabecera dentro de la memoria principal. */
  direccion: number;
};

/**
 * El mapa en el que esta el jugador, leido de un estado.
 *
 * @param pista donde se encontro la vez anterior. Se mira primero ahi, y solo
 *              si ya no cuadra se recorre la memoria entera.
 */
export const mapaActual = (
  estado: Uint8Array,
  tabla: TablaMapas,
  pista: number | null = null,
): MapaEnMemoria | null => {
  if (estado.length !== TAMANO_ESTADO) return null;
  const { inicio, tamano } = REGIONES.ewram;
  const memoria = estado.subarray(inicio, inicio + tamano);
  const esRom = (valor: number) => valor >= ROM_BASE && valor < ROM_BASE + 0x2000000;

  const probar = (offset: number): MapaEnMemoria | null => {
    if (!formaDeCabecera(memoria, offset, esRom)) return null;
    const info = tabla.porCabecera.get(llave(memoria, offset));
    return info ? { ...info, direccion: 0x02000000 + offset } : null;
  };

  if (pista !== null) {
    const encontrado = probar(pista - 0x02000000);
    if (encontrado) return encontrado;
  }
  for (let offset = 0; offset + ANCHO_CABECERA <= memoria.length; offset += 4) {
    const encontrado = probar(offset);
    if (encontrado) return encontrado;
  }
  return null;
};

/**
 * Si un mapa es un Centro Pokemon por dentro.
 *
 * No hay un numero que lo diga, pero si una costumbre muy fuerte: todos los
 * Centros de una region usan LA MISMA disposicion, y es un interior. Asi que
 * la pista es la disposicion del sitio donde la enfermera curo al equipo,
 * siempre que la compartan varios mapas: la casa del jugador tambien cura, y
 * es unica. Ver `aprenderCentro`.
 */
export const esCentro = (mapa: MapaInfo, disposicionDelCentro: number | null): boolean =>
  disposicionDelCentro !== null && mapa.disposicion === disposicionDelCentro;

/** A partir de cuantos mapas con la misma disposicion se cree que es un Centro. */
export const MIN_CENTROS = 5;

/**
 * Decide si el sitio donde se acaba de curar el equipo es un Centro Pokemon.
 *
 * Devuelve la disposicion a recordar, o null si no lo parece.
 */
export const aprenderCentro = (mapa: MapaInfo, tabla: TablaMapas): number | null =>
  mapa.tipo === TIPO_INTERIOR && (tabla.usosDeDisposicion.get(mapa.disposicion) ?? 0) >= MIN_CENTROS
    ? mapa.disposicion
    : null;

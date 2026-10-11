// Leer de la ROM las tablas que el intercambio necesita.
//
// No se usan direcciones fijas: cambian entre versiones e idiomas, y una copia
// aleatorizada o un hack pueden moverlas. Se localizan por su forma y se
// confirman contra nombres conocidos.

import { FIN, leerTexto, pareceNombre } from './texto';

/** El guion, en el juego de caracteres del juego. Marca el movimiento 0. */
const GUION = 0xae;

/** Cada nombre de especie ocupa once bytes, rellenos con el terminador. */
export const ANCHO_NOMBRE = 11;

/** Huecos de especie en tercera generacion, contando los vacios. */
export const ESPECIES_GEN3 = 412;

/**
 * Nombres que sirven de ancla, con su numero interno.
 *
 * Los nombres de especie son iguales en todos los idiomas occidentales, asi
 * que valen para confirmar que la tabla esta donde creemos. Y valen tambien
 * con una copia aleatorizada: el randomizer cambia los datos de cada especie,
 * no como se llama.
 */
const ANCLAS: ReadonlyArray<readonly [numero: number, nombre: string]> = [
  [1, 'BULBASAUR'],
  [4, 'CHARMANDER'],
  [25, 'PIKACHU'],
  [151, 'MEW'],
];

const entradaValida = (rom: Uint8Array, offset: number): boolean => {
  const entrada = rom.subarray(offset, offset + ANCHO_NOMBRE);
  if (entrada.length < ANCHO_NOMBRE) return false;
  if (!pareceNombre(entrada)) return false;
  // Un nombre de verdad termina antes de agotar el hueco.
  const fin = entrada.indexOf(FIN);
  return fin > 0 && fin <= ANCHO_NOMBRE;
};

/** Cada nombre de movimiento ocupa trece bytes, rellenos con el terminador. */
export const ANCHO_MOVIMIENTO = 13;

/** Huecos de movimiento en tercera generacion, contando el relleno inicial. */
export const MOVIMIENTOS_GEN3 = 355;

export type TablaMovimientos = {
  /** Donde empieza el movimiento 0, que es el hueco de relleno. */
  offset: number;
  nombre: (movimiento: number) => string;
};

/**
 * Localiza la tabla de nombres de movimiento dentro de una ROM.
 *
 * POR QUE NO SE PODIA ANTES, que es lo que costo: esto se intento con la misma
 * tecnica que los nombres de especie -buscar una racha larga de entradas que
 * parezcan un nombre- y no encontraba nada. La causa no estaba aqui sino en la
 * tabla de caracteres: le faltaban las mayusculas acentuadas y la dieresis, asi
 * que "IMITACION" o "LENGUETAZO" se daban por basura y la racha se partia en
 * trozos cortos. Con esos caracteres puestos, la racha sale entera.
 *
 * Y NO SE PUEDE ANCLAR EN UN NOMBRE CONOCIDO, que es como se confirma la de
 * especies: los Pokemon se llaman igual en todos los idiomas occidentales y los
 * movimientos no -"Tackle" es "PLACAJE" aqui y otra cosa en frances-. El ancla
 * es otra: el movimiento 0 no existe y el juego guarda ahi un guion suelto.
 *
 * Eso resuelve ademas el desplazamiento de una entrada, que es el mismo fallo
 * que avisa la tabla de especies: la racha encontrada empieza DENTRO de la
 * tabla anterior -la ultima especie, CHIMECHO- porque tambien parece un nombre.
 * Medido en Rojo Fuego: la racha sale en 0x2427F3 y la tabla empieza en
 * 0x242800, trece bytes mas alla. Buscando el guion se cae en el sitio.
 */
export const encontrarTablaMovimientos = (rom: Uint8Array): TablaMovimientos | null => {
  const ancho = ANCHO_MOVIMIENTO;
  /** Cuantos nombres seguidos hacen falta para creerselo. */
  const suficientes = 300;

  const entradaValida = (offset: number): boolean => {
    const entrada = rom.subarray(offset, offset + ancho);
    if (entrada.length < ancho) return false;
    if (!pareceNombre(entrada)) return false;
    const terminador = entrada.indexOf(FIN);
    return terminador > 0 && terminador <= ancho;
  };

  for (let offset = 0; offset + ancho * suficientes < rom.length; offset += 1) {
    // El ancla: un guion y, pegado, el terminador. Buscar eso byte a byte es
    // mucho mas preciso que buscar una racha y luego intentar cuadrarla, que
    // fue el primer intento: la racha empieza DENTRO de la tabla anterior -la
    // ultima especie tambien parece un nombre- y en Esmeralda se colaba ademas
    // desplazada un byte, que se veia como "ESTRUCTOR" en vez de "DESTRUCTOR".
    // El relleno son guiones -uno en Rojo Fuego, DOS en Esmeralda- seguidos del
    // terminador, asi que se cuentan en vez de dar por hecho que hay uno. Y se
    // ancla en el PRIMERO: con dos, empezar por el segundo deja la tabla corrida
    // un byte y se lee "ESTRUCTOR" donde dice "DESTRUCTOR".
    if (rom[offset] !== GUION || rom[offset - 1] === GUION) continue;
    let guiones = 0;
    while (guiones < 4 && rom[offset + guiones] === GUION) guiones += 1;
    if (rom[offset + guiones] !== FIN) continue;

    // Y que ese guion sea de verdad el PRINCIPIO de una entrada.
    //
    // En Esmeralda el ancla sola no basta: hay un guion un byte mas adelante
    // del sitio bueno y la tabla salia corrida, con "ESTRUCTOR" donde dice
    // "DESTRUCTOR". Lo que lo distingue es lo que hay justo antes de cada
    // entrada: con la tabla bien alineada es siempre relleno -el terminador o
    // ceros-, y con un byte de mas es la letra anterior de un nombre.
    let alineada = true;
    for (let i = 1; i <= 20 && alineada; i += 1) {
      const antes = rom[offset + i * ancho - 1];
      if (antes !== FIN && antes !== 0) alineada = false;
    }
    if (!alineada) continue;

    let seguidas = 0;
    while (seguidas < MOVIMIENTOS_GEN3 && entradaValida(offset + (seguidas + 1) * ancho)) {
      seguidas += 1;
    }
    if (seguidas < suficientes) continue;

    return {
      offset,
      nombre: (movimiento: number): string =>
        movimiento > 0 && movimiento < MOVIMIENTOS_GEN3
          ? leerTexto(rom.subarray(offset + movimiento * ancho, offset + (movimiento + 1) * ancho))
          : '',
    };
  }

  return null;
};

export type TablaNombres = {
  /** Donde empieza la especie 0. */
  offset: number;
  /** Cuantas anclas coincidieron: 4 es confianza plena. */
  anclasVerificadas: number;
  nombre: (especie: number) => string;
  /**
   * El nombre tal y como esta en la ROM, sin traducir.
   *
   * Hace falta para escribir un mote: si un Haunter sin mote propio evoluciona
   * al intercambiarlo, su nuevo mote tiene que ser "GENGAR" escrito en el juego
   * de caracteres del juego y en el idioma de ESTA copia. Copiar los bytes de
   * aqui evita traducir en los dos sentidos y acertar en ninguno.
   */
  bytes: (especie: number) => Uint8Array;
};

/**
 * Localiza la tabla de nombres de especie dentro de una ROM.
 *
 * Cuidado con el desplazamiento de una entrada, que es el fallo que tuvo la
 * primera version: la especie 0 es un hueco de relleno que no parece un
 * nombre, asi que un barrido ingenuo empieza a contar en la 1 y devuelve
 * IVYSAUR donde deberia decir BULBASAUR. En un dialogo de intercambio eso
 * seria grave, porque le diria al jugador que esta entregando otra cosa.
 *
 * Por eso no basta con encontrar una racha larga: hay que confirmarla contra
 * nombres conocidos, y probar tambien una entrada antes por si el relleno
 * inicial se quedo fuera.
 */
export const encontrarTablaNombres = (rom: Uint8Array): TablaNombres | null => {
  const suficientes = 80;

  for (let offset = 0; offset + ANCHO_NOMBRE * suficientes < rom.length; offset += 1) {
    let seguidas = 0;
    while (seguidas < suficientes && entradaValida(rom, offset + seguidas * ANCHO_NOMBRE)) {
      seguidas += 1;
    }
    if (seguidas < suficientes) continue;

    // La racha puede empezar en la especie 0 o en la 1, segun si el relleno
    // inicial paso el filtro. Se prueban las dos y gana la que cuadre.
    for (const inicio of [offset, offset - ANCHO_NOMBRE]) {
      if (inicio < 0) continue;
      const nombre = (especie: number): string =>
        leerTexto(rom.subarray(inicio + especie * ANCHO_NOMBRE, inicio + (especie + 1) * ANCHO_NOMBRE));

      const aciertos = ANCLAS.filter(([numero, esperado]) => nombre(numero) === esperado).length;
      if (aciertos >= 3) {
        const bytes = (especie: number): Uint8Array =>
          rom.slice(inicio + especie * ANCHO_NOMBRE, inicio + (especie + 1) * ANCHO_NOMBRE);
        return { offset: inicio, anclasVerificadas: aciertos, nombre, bytes };
      }
    }

    // Esta racha no era: seguir buscando despues de ella.
    offset += seguidas * ANCHO_NOMBRE;
  }

  return null;
};

/** Cada especie tiene 28 bytes de datos base. */
export const ANCHO_ESTADISTICAS = 28;

/**
 * Los datos base de una especie: lo que el randomizer cambia y el nombre no.
 *
 * Esto es lo que hace que un intercambio entre copias aleatorizadas por
 * separado sea interesante en vez de un error: el Pokemon que llega conserva su
 * especie y su nombre, pero en la ROM que lo recibe esa especie puede tener
 * otras estadisticas, otro tipo y otra habilidad.
 */
export type EstadisticasBase = {
  ps: number;
  ataque: number;
  defensa: number;
  velocidad: number;
  ataqueEspecial: number;
  defensaEspecial: number;
  tipos: readonly [number, number];
  habilidades: readonly [number, number];
  /** Suma de las seis: la medida rapida de lo fuerte que es una especie. */
  total: number;
};

export type TablaEstadisticas = {
  /** Donde empieza la especie 0. */
  offset: number;
  /** Cuantas entradas seguidas son validas. */
  especies: number;
  estadisticas: (especie: number) => EstadisticasBase | null;
};

// Topes de los campos que no son estadisticas. El randomizer se mueve dentro de
// ellos, asi que sirven de filtro tanto en una ROM original como en una
// aleatorizada, que es justo lo que hace falta aqui.
const TIPOS = 17;
const CRECIMIENTO = 5;
const GRUPO_HUEVO = 15;
const HABILIDADES = 77;

const entradaEstadisticasValida = (rom: Uint8Array, offset: number): boolean => {
  if (offset + ANCHO_ESTADISTICAS > rom.length) return false;
  const e = rom.subarray(offset, offset + ANCHO_ESTADISTICAS);
  // Ninguna especie de verdad tiene una estadistica a cero.
  for (let i = 0; i < 6; i += 1) if (e[i]! < 1) return false;
  if (e[6]! > TIPOS || e[7]! > TIPOS) return false;
  if (e[19]! > CRECIMIENTO) return false;
  if (e[20]! > GRUPO_HUEVO || e[21]! > GRUPO_HUEVO) return false;
  if (e[22]! > HABILIDADES || e[23]! > HABILIDADES) return false;
  // Los dos ultimos bytes son relleno y estan siempre a cero: es la condicion
  // que descarta cualquier otra tabla de 28 bytes de la ROM.
  return e[26] === 0 && e[27] === 0;
};

/**
 * Localiza la tabla de datos base de las especies.
 *
 * Igual que con los nombres, la especie 0 es un hueco -aqui, 28 bytes a cero- y
 * no pasa el filtro, asi que la racha encontrada empieza en la especie 1. Se
 * comprueba si justo antes hay una entrada vacia para recuperar el origen; sin
 * eso, todas las estadisticas saldrian corridas una especie.
 *
 * No se usan anclas de especies conocidas a proposito: en una copia
 * aleatorizada no coincidiria ninguna, y esta funcion tiene que servir
 * exactamente para ese caso.
 */
export const encontrarTablaEstadisticas = (rom: Uint8Array): TablaEstadisticas | null => {
  const suficientes = 350;

  for (let offset = 0; offset + ANCHO_ESTADISTICAS * suficientes < rom.length; offset += 4) {
    let seguidas = 0;
    while (entradaEstadisticasValida(rom, offset + seguidas * ANCHO_ESTADISTICAS)) seguidas += 1;
    if (seguidas < suficientes) {
      offset += Math.max(0, seguidas - 1) * ANCHO_ESTADISTICAS;
      continue;
    }

    const anterior = offset - ANCHO_ESTADISTICAS;
    const huecoDetras =
      anterior >= 0 && rom.subarray(anterior, offset).every((byte) => byte === 0);
    const inicio = huecoDetras ? anterior : offset;

    const estadisticas = (especie: number): EstadisticasBase | null => {
      const off = inicio + especie * ANCHO_ESTADISTICAS;
      if (especie < 0 || !entradaEstadisticasValida(rom, off)) return null;
      const e = rom.subarray(off, off + ANCHO_ESTADISTICAS);
      const [ps, ataque, defensa, velocidad, ataqueEspecial, defensaEspecial] = e as unknown as number[];
      return {
        ps: ps!,
        ataque: ataque!,
        defensa: defensa!,
        velocidad: velocidad!,
        ataqueEspecial: ataqueEspecial!,
        defensaEspecial: defensaEspecial!,
        tipos: [e[6]!, e[7]!],
        habilidades: [e[22]!, e[23]!],
        total: ps! + ataque! + defensa! + velocidad! + ataqueEspecial! + defensaEspecial!,
      };
    };

    return { offset: inicio, especies: seguidas + (huecoDetras ? 1 : 0), estadisticas };
  }

  return null;
};

/** Nombres de los tipos, para poder explicar un intercambio en palabras. */
export const TIPOS_GEN3: readonly string[] = [
  'Normal', 'Lucha', 'Volador', 'Veneno', 'Tierra', 'Roca', 'Bicho', 'Fantasma', 'Acero',
  '???', 'Fuego', 'Agua', 'Planta', 'Electrico', 'Psiquico', 'Hielo', 'Dragon', 'Siniestro',
];

/** Como se lee un tipo doble: "Planta/Veneno", o solo uno si se repite. */
export const describirTipos = (tipos: readonly [number, number]): string => {
  const nombre = (t: number) => TIPOS_GEN3[t] ?? `#${t}`;
  return tipos[0] === tipos[1] ? nombre(tipos[0]) : `${nombre(tipos[0])}/${nombre(tipos[1])}`;
};

/**
 * Traduce el numero interno de especie al de la Pokedex nacional.
 *
 * Hacen falta los dos. El interno es el que usa el juego en memoria, y es el
 * que leemos de una partida. El nacional es el que usa todo el mundo fuera del
 * juego, empezando por cualquier coleccion de sprites.
 *
 * La conversion NO es una resta, aunque lo parezca: las 251 primeras coinciden
 * y a partir de ahi los de Hoenn van en su orden regional. Comprobado, que es
 * como se descubrio: la especie interna 411 es CHIMECHO, que es la 358
 * nacional, no la 386 que daria restar un desplazamiento fijo.
 *
 * La tabla esta en la ROM, asi que no hay que mantener aqui una lista de
 * ciento treinta y cinco numeros que ademas habria que revisar por idioma.
 */
export type TablaDex = {
  offset: number;
  /** El numero nacional, o 0 si esa especie no existe. */
  nacional: (especie: number) => number;
};

/** Cuantas especies seguidas tienen que cuadrar para dar la tabla por buena. */
const IDENTIDAD = 251;

export const encontrarTablaDex = (rom: Uint8Array): TablaDex | null => {
  const u16 = (i: number): number => rom[i]! | (rom[i + 1]! << 8);

  // La firma es inmejorable: para las especies de las dos primeras
  // generaciones, el numero interno y el nacional son el mismo, asi que la
  // tabla empieza con 1, 2, 3, 4... en enteros de dos bytes.
  for (let offset = 0; offset + 2 * (IDENTIDAD + 160) < rom.length; offset += 2) {
    if (u16(offset) !== 1 || u16(offset + 2) !== 2) continue;

    let seguidas = 0;
    while (seguidas < IDENTIDAD && u16(offset + seguidas * 2) === seguidas + 1) seguidas += 1;
    if (seguidas < IDENTIDAD) continue;

    // La tabla esta indexada desde la especie 1, no desde la 0.
    const nacional = (especie: number): number =>
      especie < 1 ? 0 : u16(offset + (especie - 1) * 2);

    // Confirmacion con el primero de Hoenn, que es donde las dos numeraciones
    // dejan de coincidir y donde fallaria cualquier atajo.
    if (nacional(277) !== 252) continue;

    return { offset, nacional };
  }

  return null;
};

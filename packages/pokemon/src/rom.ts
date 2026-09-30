// Leer de la ROM las tablas que el intercambio necesita.
//
// No se usan direcciones fijas: cambian entre versiones e idiomas, y una copia
// aleatorizada o un hack pueden moverlas. Se localizan por su forma y se
// confirman contra nombres conocidos.

import { FIN, leerTexto, pareceNombre } from './texto';

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

export type TablaNombres = {
  /** Donde empieza la especie 0. */
  offset: number;
  /** Cuantas anclas coincidieron: 4 es confianza plena. */
  anclasVerificadas: number;
  nombre: (especie: number) => string;
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
        return { offset: inicio, anclasVerificadas: aciertos, nombre };
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

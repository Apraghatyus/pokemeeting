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

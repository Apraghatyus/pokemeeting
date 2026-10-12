// El bolsillo de Poke Balls de la mochila.
//
// Sirve para una sola cosa: saber que el jugador ha LANZADO una Poke Ball. En
// un combate, si el bolsillo cambia, es que se ha gastado una. No hace falta
// saber cuantas quedan -el juego cifra las cantidades con una llave que vive en
// otro bloque-: basta con ver que los bytes cambian.
//
// DONDE ESTA. Dentro del primer bloque de guardado, que el juego tiene en
// memoria y en Rojo Fuego mueve de sitio cada vez que carga (ver
// `medallas.ts`). No se busca por una direccion: se busca por FORMA.
//
//   - El bloque empieza con la posicion del jugador y, cuatro bytes despues, el
//     grupo y el numero del mapa donde esta. Ese mapa ya se sabe (`mapas.ts`).
//   - Y a una distancia fija, distinta en cada juego, va el bolsillo: una lista
//     de huecos de cuatro bytes con el numero del objeto -las Poke Balls son del
//     1 al 12- seguidos, sin huecos vacios en medio.
//
// Las dos cosas a la vez, en la misma distancia, no se dan por casualidad. Si
// no aparece, "no se sabe", y la regla que lo usa no hace nada.
//
// Las distancias salen de los proyectos de decompilacion (pokefirered,
// pokeemerald, pokeruby).

import { REGIONES, TAMANO_ESTADO } from './savestate';

/** Donde va el bolsillo dentro del bloque, y cuantos huecos tiene, por juego. */
const BOLSILLO: Readonly<Record<string, { desde: number; huecos: number }>> = {
  BPR: { desde: 0x430, huecos: 13 },
  BPG: { desde: 0x430, huecos: 13 },
  BPE: { desde: 0x650, huecos: 16 },
  AXV: { desde: 0x600, huecos: 16 },
  AXP: { desde: 0x600, huecos: 16 },
};

/** La ultima Poke Ball que existe en tercera generacion: la Honor Ball. */
const ULTIMA_BALL = 12;

export type BolsilloDeBalls = {
  /** Donde empieza el bloque de guardado en memoria, para mirar ahi primero. */
  bloque: number;
  /** Los bytes del bolsillo, como texto: si cambian, se ha gastado o ganado alguna. */
  firma: string;
  /** Cuantos tipos de Poke Ball lleva. */
  tipos: number;
};

const u16 = (b: Uint8Array, i: number): number => b[i]! | (b[i + 1]! << 8);

/** Cuantos huecos ocupados tiene, o null si eso no es un bolsillo de Poke Balls. */
const tiposEnElBolsillo = (memoria: Uint8Array, inicio: number, huecos: number): number | null => {
  if (inicio + huecos * 4 > memoria.length) return null;
  let ocupados = 0;
  let vacioVisto = false;
  for (let i = 0; i < huecos; i += 1) {
    const objeto = u16(memoria, inicio + i * 4);
    if (objeto > ULTIMA_BALL) return null;
    if (objeto === 0) {
      vacioVisto = true;
      continue;
    }
    // El juego los tiene juntos al principio: uno despues de un hueco vacio
    // es que esto no es el bolsillo.
    if (vacioVisto) return null;
    ocupados += 1;
  }
  return ocupados;
};

/**
 * El bolsillo de Poke Balls, o null si no se encuentra.
 *
 * @param mapa  donde esta el jugador ahora: lo que hace reconocible el bloque
 * @param pista donde estaba el bloque la vez anterior
 */
export const bolsilloDeBalls = (
  estado: Uint8Array,
  codigoJuego: string,
  mapa: { grupo: number; numero: number },
  pista: number | null = null,
): BolsilloDeBalls | null => {
  const forma = BOLSILLO[codigoJuego.slice(0, 3).toUpperCase()];
  if (!forma || estado.length !== TAMANO_ESTADO) return null;
  const { inicio, tamano } = REGIONES.ewram;
  const memoria = estado.subarray(inicio, inicio + tamano);

  const probar = (bloque: number): BolsilloDeBalls | null => {
    if (bloque < 0 || bloque + forma.desde + forma.huecos * 4 > memoria.length) return null;
    if (memoria[bloque + 4] !== mapa.grupo || memoria[bloque + 5] !== mapa.numero) return null;
    const tipos = tiposEnElBolsillo(memoria, bloque + forma.desde, forma.huecos);
    // Sin ninguna Poke Ball no hay nada que vigilar, y un bolsillo vacio no
    // dice que esto sea el bloque.
    if (tipos === null || tipos === 0) return null;
    let firma = '';
    for (let i = 0; i < forma.huecos * 4; i += 1) {
      firma += memoria[bloque + forma.desde + i]!.toString(16).padStart(2, '0');
    }
    return { bloque: 0x02000000 + bloque, firma, tipos };
  };

  if (pista !== null) {
    const encontrado = probar(pista - 0x02000000);
    if (encontrado) return encontrado;
  }
  for (let bloque = 0; bloque + forma.desde < memoria.length; bloque += 4) {
    const encontrado = probar(bloque);
    if (encontrado) return encontrado;
  }
  return null;
};

// Los Pokemon que evolucionan al intercambiarse.
//
// EL PROBLEMA. En el juego de verdad, un Haunter que cambias de consola llega
// al otro lado convertido en Gengar: la evolucion la dispara el propio
// intercambio. Aqui el intercambio no pasa por el juego -son cien bytes que
// salen de una partida y entran en otra- asi que esa evolucion no ocurre sola.
// Hay que hacerla nosotros o el Haunter se queda Haunter para siempre, que es
// justo lo que no se puede hacer con un Pokemon que SOLO evoluciona asi.
//
// DE DONDE SALE LA LISTA. De la ROM, no de una lista escrita a mano. Son doce
// especies en un juego sin tocar, pero el aleatorizador puede cambiar a que
// evoluciona cada una, y una lista fija diria que Haunter se convierte en
// Gengar en una copia donde se convierte en otra cosa. Es la misma razon por la
// que los topes de los gimnasios y los nombres de los movimientos se leen del
// fichero: lo que vale es lo que diga ESTA copia.
//
// COMO SE ENCUENTRA LA TABLA. Por su forma, no por su direccion. Son 412
// especies con cinco huecos cada una, y cada hueco son ocho bytes:
//
//     u16 metodo | u16 parametro | u16 especie destino | u16 relleno
//
// Lo que la hace reconocible es lo estricta que es: el relleno es cero en los
// 2060 huecos, un metodo a cero obliga a que el hueco entero este a cero, el
// metodo cabe en 1..15 y el destino en 1..411. Dieciseis mil bytes seguidos
// cumpliendo todo eso no aparecen por casualidad: en los cinco juegos
// comprobados -Rojo Fuego, Verde Hoja, Esmeralda, Rubi y Zafiro- la busqueda
// encuentra UNA sola posicion, y es la que dice el propio aleatorizador en su
// fichero de direcciones.

import { ESPECIES_GEN3 } from './rom';

/** Huecos de evolucion por especie. */
const HUECOS = 5;
/** Y lo que ocupa cada uno. */
const TAM = 8;
/** La tabla entera. */
const TAMANO = ESPECIES_GEN3 * HUECOS * TAM;

/**
 * El metodo mas alto que existe en tercera generacion es 15.
 *
 * Sirve de filtro al buscar: un numero mayor dice que esto no es la tabla.
 */
const MAX_METODO = 15;

/** Evoluciona al intercambiarlo, sin mas. */
export const AL_INTERCAMBIAR = 5;
/** Evoluciona al intercambiarlo si lleva puesto cierto objeto. */
export const AL_INTERCAMBIAR_CON_OBJETO = 6;

export type Evolucion = {
  metodo: number;
  /** Que hace falta: un nivel, un objeto... segun el metodo. */
  parametro: number;
  /** En que se convierte. */
  destino: number;
};

export type TablaEvoluciones = {
  /** Donde empieza, para poder decirlo en las pruebas. */
  direccion: number;
  /** Cuantas especies tienen al menos una evolucion. */
  conEvolucion: number;
  evolucionesDe: (especie: number) => Evolucion[];
};

const u16 = (b: Uint8Array, i: number): number => b[i]! | (b[i + 1]! << 8);

/**
 * Mira si en esta posicion hay una tabla de evoluciones bien formada.
 *
 * Devuelve cuantas especies evolucionan, o null en cuanto algo no cuadra. Se
 * sale al primer fallo a proposito: casi todas las posiciones de la ROM fallan
 * en los primeros bytes, y eso es lo que hace que recorrerla entera sea rapido.
 */
const cuantasEvolucionan = (rom: Uint8Array, base: number, especies: number): number | null => {
  let conEvolucion = 0;

  for (let especie = 0; especie < especies; especie += 1) {
    const inicio = base + especie * HUECOS * TAM;
    let tiene = false;

    for (let hueco = 0; hueco < HUECOS; hueco += 1) {
      const p = inicio + hueco * TAM;
      // El relleno es cero SIEMPRE. Es el filtro mas barato y el que mas
      // descarta: una de cada 65536 posiciones lo cumple por casualidad.
      if (u16(rom, p + 6) !== 0) return null;

      const metodo = u16(rom, p);
      const destino = u16(rom, p + 4);

      if (metodo === 0) {
        // Sin metodo no hay evolucion, y entonces el hueco entero esta a cero.
        if (destino !== 0 || u16(rom, p + 2) !== 0) return null;
        continue;
      }
      if (metodo > MAX_METODO) return null;
      if (destino === 0 || destino >= ESPECIES_GEN3) return null;
      tiene = true;
    }

    if (tiene) conEvolucion += 1;
  }

  return conEvolucion;
};

/**
 * Cuantas especies tienen que evolucionar para creerselo.
 *
 * En los juegos sin tocar son 172. El aleatorizador puede mover a donde
 * evoluciona cada una, pero no las quita, asi que un numero muy por debajo
 * significa que lo encontrado no es esta tabla.
 */
const MINIMO_CON_EVOLUCION = 50;

/** Y cuantas de las primeras treinta, para descartar rapido. */
const MINIMO_AL_PRINCIPIO = 10;

/**
 * Busca la tabla de evoluciones dentro de la ROM.
 *
 * Una sola pasada, en pasos de cuatro bytes -todo lo que compila el juego esta
 * alineado asi-, con el filtro barato delante: la especie 0 no existe y sus
 * cuarenta bytes estan a cero.
 */
export const encontrarTablaEvoluciones = (rom: Uint8Array): TablaEvoluciones | null => {
  const tope = rom.length - TAMANO;

  for (let base = 0; base < tope; base += 4) {
    // La especie 0 son cuarenta ceros. Mirar los cuatro primeros descarta casi
    // todo sin tocar los otros treinta y seis.
    if (rom[base] !== 0 || rom[base + 1] !== 0 || rom[base + 2] !== 0 || rom[base + 3] !== 0) {
      continue;
    }
    let vacia = true;
    for (let i = 4; i < HUECOS * TAM; i += 1) {
      if (rom[base + i] !== 0) {
        vacia = false;
        break;
      }
    }
    if (!vacia) continue;

    const cabeza = cuantasEvolucionan(rom, base, 30);
    if (cabeza === null || cabeza < MINIMO_AL_PRINCIPIO) continue;

    const todas = cuantasEvolucionan(rom, base, ESPECIES_GEN3);
    if (todas === null || todas < MINIMO_CON_EVOLUCION) continue;

    return {
      direccion: base,
      conEvolucion: todas,
      evolucionesDe: (especie) => {
        if (especie < 0 || especie >= ESPECIES_GEN3) return [];
        const inicio = base + especie * HUECOS * TAM;
        const salida: Evolucion[] = [];
        for (let hueco = 0; hueco < HUECOS; hueco += 1) {
          const p = inicio + hueco * TAM;
          const metodo = u16(rom, p);
          if (metodo === 0) continue;
          salida.push({ metodo, parametro: u16(rom, p + 2), destino: u16(rom, p + 4) });
        }
        return salida;
      },
    };
  }

  return null;
};

/**
 * En que se convierte esta especie al intercambiarla, o null si en nada.
 *
 * El objeto que lleva puesto importa: Scyther solo se convierte en Scizor si
 * viaja con la Garra Metal. Y el objeto NO se gasta, igual que en el juego:
 * Scizor se queda con su Garra Metal.
 */
export const alIntercambiar = (
  tabla: TablaEvoluciones | null,
  especie: number,
  objeto: number,
): number | null => {
  if (!tabla) return null;

  for (const evolucion of tabla.evolucionesDe(especie)) {
    if (evolucion.metodo === AL_INTERCAMBIAR) return evolucion.destino;
    if (evolucion.metodo === AL_INTERCAMBIAR_CON_OBJETO && evolucion.parametro === objeto) {
      return evolucion.destino;
    }
  }
  return null;
};

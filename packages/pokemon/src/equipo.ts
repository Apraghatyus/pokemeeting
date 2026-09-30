// El equipo Pokemon dentro de la memoria del juego.
//
// Leerlo y, sobre todo, escribirlo: eso es un intercambio. Se mueve un bloque
// de 100 bytes de una partida a otra, sin emular el cable link, que exigiria
// sincronia ciclo a ciclo entre dos emuladores por internet.

import { leerPokemon, pareceValido, TAMANO_EN_EQUIPO, TAMANO_EQUIPO, type PokemonGen3 } from './gen3';
import { escribirEn, region, type Region } from './savestate';

/**
 * Donde vive el equipo, por juego.
 *
 * Estas direcciones no se dan por buenas: son un punto de partida, y el
 * localizador las confirma buscando bloques validos. Si un hack las mueve, el
 * barrido las encuentra igual.
 */
export const DIRECCIONES_CONOCIDAS: Readonly<Record<string, { equipo: number; contador: number }>> = {
  // Comprobado contra una partida real de la edicion espanola: el equipo
  // aparecio exactamente aqui, con el contador a 1.
  BPR: { equipo: 0x02024284, contador: 0x02024029 },
  BPG: { equipo: 0x02024284, contador: 0x02024029 },
};

export type RanuraEquipo = {
  /** Posicion dentro del equipo, de 0 a 5. */
  indice: number;
  /** Direccion que veria el juego. */
  direccion: number;
  pokemon: PokemonGen3;
  /** Los 100 bytes tal cual, que son los que viajan en un intercambio. */
  bloque: Uint8Array;
};

export type Equipo = {
  direccion: number;
  ranuras: RanuraEquipo[];
};

/**
 * Busca el equipo en la memoria.
 *
 * El filtro es el checksum del propio Pokemon: la probabilidad de que cien
 * bytes cualesquiera cuadren por casualidad es de una entre 65536. Comprobado
 * sobre memoria real de una partida sin Pokemon, donde no encuentra nada, y
 * sobre una con equipo, donde lo encuentra en la direccion documentada.
 */
export const localizarEquipo = (estado: Uint8Array, cual: Region = 'ewram'): Equipo | null => {
  const memoria = region(estado, cual);
  const base = cual === 'ewram' ? 0x02000000 : 0x03000000;

  const candidatos: number[] = [];
  for (let off = 0; off + TAMANO_EN_EQUIPO <= memoria.length; off += 4) {
    if (pareceValido(memoria.subarray(off, off + TAMANO_EN_EQUIPO))) candidatos.push(off);
  }
  if (candidatos.length === 0) return null;

  // El equipo del jugador es el grupo mas largo de bloques seguidos separados
  // exactamente 100 bytes. Con un solo Pokemon no hay grupo, asi que se coge
  // el candidato de direccion mas alta: el equipo del jugador va despues del
  // equipo rival en memoria.
  let mejor = { inicio: candidatos[candidatos.length - 1]!, largo: 1 };
  for (const inicio of candidatos) {
    let largo = 1;
    while (
      largo < TAMANO_EQUIPO &&
      candidatos.includes(inicio + largo * TAMANO_EN_EQUIPO)
    ) {
      largo += 1;
    }
    if (largo > mejor.largo) mejor = { inicio, largo };
  }

  const ranuras: RanuraEquipo[] = [];
  for (let i = 0; i < mejor.largo; i += 1) {
    const off = mejor.inicio + i * TAMANO_EN_EQUIPO;
    const bloque = memoria.slice(off, off + TAMANO_EN_EQUIPO);
    ranuras.push({ indice: i, direccion: base + off, pokemon: leerPokemon(bloque), bloque });
  }

  return { direccion: base + mejor.inicio, ranuras };
};

export class IntercambioInvalidoError extends Error {}

/**
 * Comprueba que un bloque recibido se puede meter en esta partida.
 *
 * Es la parte que no se puede saltar. Un indice fuera de rango no produce un
 * Pokemon raro: produce un "Bad Egg" o cuelga el juego. Y lo que esta en juego
 * es la partida de alguien, asi que ante la duda se rechaza entero.
 */
export const validarRecibido = (
  bloque: Uint8Array,
  limites: { maxEspecie: number; maxMovimiento: number; maxObjeto: number },
): { ok: true } | { ok: false; motivo: string } => {
  if (bloque.length !== TAMANO_EN_EQUIPO) {
    return { ok: false, motivo: `Un Pokemon ocupa ${TAMANO_EN_EQUIPO} bytes y llegaron ${bloque.length}.` };
  }

  const p = leerPokemon(bloque);
  if (!p.valido) return { ok: false, motivo: 'El bloque llego danado: su checksum no cuadra.' };
  if (p.especie === 0 || p.especie > limites.maxEspecie) {
    return { ok: false, motivo: `La especie ${p.especie} no existe en tu copia del juego.` };
  }
  if (p.nivel < 1 || p.nivel > 100) {
    return { ok: false, motivo: `Un nivel de ${p.nivel} corromperia la tabla de estadisticas.` };
  }
  const movimientoMalo = p.movimientos.find((m) => m > limites.maxMovimiento);
  if (movimientoMalo !== undefined) {
    return { ok: false, motivo: `El movimiento ${movimientoMalo} no existe en tu copia del juego.` };
  }
  if (p.objeto > limites.maxObjeto) {
    return { ok: false, motivo: `El objeto ${p.objeto} no existe en tu copia del juego.` };
  }

  return { ok: true };
};

/**
 * Mete un Pokemon en una ranura del equipo.
 *
 * Devuelve un estado nuevo y no toca el original: si un intercambio se queda a
 * medias, la partida de quien lo hizo tiene que quedar exactamente como estaba.
 */
export const escribirEnRanura = (
  estado: Uint8Array,
  direccionEquipo: number,
  indice: number,
  bloque: Uint8Array,
): Uint8Array => {
  if (indice < 0 || indice >= TAMANO_EQUIPO) {
    throw new IntercambioInvalidoError(`El equipo tiene ${TAMANO_EQUIPO} ranuras y se pidio la ${indice}.`);
  }
  if (bloque.length !== TAMANO_EN_EQUIPO) {
    throw new IntercambioInvalidoError(`Un Pokemon ocupa ${TAMANO_EN_EQUIPO} bytes.`);
  }
  return escribirEn(estado, direccionEquipo + indice * TAMANO_EN_EQUIPO, bloque);
};

/**
 * Ajusta cuantos Pokemon dice el juego que hay en el equipo.
 *
 * Sin esto, un Pokemon escrito en la ranura siguiente existe en memoria pero
 * el juego no lo mira: el contador es lo que hace que aparezca.
 */
export const escribirContador = (
  estado: Uint8Array,
  direccionContador: number,
  cuantos: number,
): Uint8Array => {
  if (cuantos < 1 || cuantos > TAMANO_EQUIPO) {
    throw new IntercambioInvalidoError(`Un equipo tiene entre 1 y ${TAMANO_EQUIPO} Pokemon.`);
  }
  return escribirEn(estado, direccionContador, new Uint8Array([cuantos]));
};

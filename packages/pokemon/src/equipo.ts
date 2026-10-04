// El equipo Pokemon dentro de la memoria del juego.
//
// Leerlo y, sobre todo, escribirlo: eso es un intercambio. Se mueve un bloque
// de 100 bytes de una partida a otra, sin emular el cable link, que exigiria
// sincronia ciclo a ciclo entre dos emuladores por internet.

import { leerPokemon, pareceValido, TAMANO_EN_EQUIPO, TAMANO_EQUIPO, type PokemonGen3 } from './gen3';
import { desplazamientoDe, DIRECCION_BASE, escribirEn, region, type Region } from './savestate';

/**
 * Donde vive el equipo, por juego.
 *
 * Estas direcciones no se dan por buenas: son un punto de partida, y el
 * localizador las confirma buscando bloques validos. Si un hack las mueve, el
 * barrido las encuentra igual.
 *
 * Rubi y Zafiro son el caso raro: guardan el equipo en IWRAM, no en EWRAM como
 * los otros tres. Por eso el barrido mira las dos regiones y no solo una.
 *
 * Las de Rojo Fuego y Verde Hoja estan comprobadas contra una partida real.
 * Las otras tres vienen de la documentacion de la comunidad y aqui solo se
 * usan como pista: nada se escribe sin que `localizarContador` confirme que
 * el byte que hay en esa direccion es el numero de Pokemon que el barrido
 * encontro de verdad.
 */
export const DIRECCIONES_CONOCIDAS: Readonly<
  Record<string, { equipo: number; contador: number; region: Region }>
> = {
  // Comprobado contra una partida real de la edicion espanola: el equipo
  // aparecio exactamente aqui, con el contador a 1.
  BPR: { equipo: 0x02024284, contador: 0x02024029, region: 'ewram' },
  BPG: { equipo: 0x02024284, contador: 0x02024029, region: 'ewram' },
  AXV: { equipo: 0x03004360, contador: 0x03004350, region: 'iwram' },
  AXP: { equipo: 0x03004360, contador: 0x03004350, region: 'iwram' },
  BPE: { equipo: 0x020244ec, contador: 0x020244e9, region: 'ewram' },
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
  /** En que region aparecio. Rubi y Zafiro lo tienen en IWRAM. */
  region: Region;
  ranuras: RanuraEquipo[];
};

/** Donde puede estar un equipo, en el orden en que conviene mirar. */
const REGIONES_CON_EQUIPO: readonly Region[] = ['ewram', 'iwram'];

const buscarEn = (estado: Uint8Array, cual: Region): Equipo | null => {
  const memoria = region(estado, cual);
  const base = DIRECCION_BASE[cual];

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
    while (largo < TAMANO_EQUIPO && candidatos.includes(inicio + largo * TAMANO_EN_EQUIPO)) {
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

  return { direccion: base + mejor.inicio, region: cual, ranuras };
};

/**
 * Lee el equipo en una direccion concreta, si de verdad hay uno ahi.
 *
 * Devuelve null en cuanto el primer bloque no cuadra, asi que sirve para
 * confirmar una direccion documentada sin fiarse de ella.
 */
const leerEn = (estado: Uint8Array, direccion: number, cual: Region): Equipo | null => {
  const memoria = region(estado, cual);
  const base = DIRECCION_BASE[cual];
  const inicio = direccion - base;
  if (inicio < 0 || inicio + TAMANO_EN_EQUIPO > memoria.length) return null;

  const ranuras: RanuraEquipo[] = [];
  for (let i = 0; i < TAMANO_EQUIPO; i += 1) {
    const off = inicio + i * TAMANO_EN_EQUIPO;
    const bloque = memoria.slice(off, off + TAMANO_EN_EQUIPO);
    if (bloque.length < TAMANO_EN_EQUIPO || !pareceValido(bloque)) break;
    ranuras.push({ indice: i, direccion: base + off, pokemon: leerPokemon(bloque), bloque });
  }

  return ranuras.length > 0 ? { direccion, region: cual, ranuras } : null;
};

/**
 * Busca el equipo en la memoria.
 *
 * El filtro es el checksum del propio Pokemon: la probabilidad de que cien
 * bytes cualesquiera cuadren por casualidad es de una entre 65536. Comprobado
 * sobre memoria real de una partida sin Pokemon, donde no encuentra nada, y
 * sobre una con equipo, donde lo encuentra en la direccion documentada.
 *
 * **Con el codigo del juego se mira primero su direccion documentada**, y eso
 * no es una optimizacion: es lo que arregla el fallo de que durante un combate
 * apareciera en el panel el Pokemon contra el que estabas peleando.
 *
 * El motivo es que el equipo rival vive en memoria con exactamente la misma
 * forma que el tuyo, asi que por forma no se distinguen. El barrido elegia el
 * grupo mas largo de bloques seguidos, y contra un entrenador con mas Pokemon
 * que tu ese grupo es el **suyo**. Un entrenador con dos te robaba el panel si
 * tu llevabas uno. La direccion documentada si los distingue, porque es la del
 * jugador y de nadie mas.
 *
 * El barrido sigue estando detras, para los hacks que mueven el equipo y para
 * cuando no se sabe de que juego es.
 *
 * Sin decirle region mira EWRAM y IWRAM y se queda con el equipo mas largo,
 * porque los cinco juegos de tercera generacion no lo guardan en el mismo
 * sitio: Rubi y Zafiro usan IWRAM y los otros tres EWRAM.
 */
export const localizarEquipo = (
  estado: Uint8Array,
  cual?: Region,
  codigoJuego?: string,
): Equipo | null => {
  const conocida = codigoJuego
    ? DIRECCIONES_CONOCIDAS[codigoJuego.slice(0, 3).toUpperCase()]
    : undefined;
  if (conocida && (!cual || cual === conocida.region)) {
    const anclado = leerEn(estado, conocida.equipo, conocida.region);
    if (anclado) return anclado;
  }

  const donde = cual ? [cual] : REGIONES_CON_EQUIPO;
  let mejor: Equipo | null = null;
  for (const region of donde) {
    const hallado = buscarEn(estado, region);
    if (hallado && (!mejor || hallado.ranuras.length > mejor.ranuras.length)) mejor = hallado;
  }
  return mejor;
};

/**
 * Localiza el contador del equipo, comprobandolo antes de darlo por bueno.
 *
 * El contador es lo unico que no se puede encontrar por su forma: es un solo
 * byte y no hay nada que lo distinga de cualquier otro byte con el mismo
 * valor. Asi que se parte de la direccion documentada del juego y se
 * comprueba: si el byte que hay ahi no coincide con los Pokemon que el barrido
 * encontro, no es el contador, y se devuelve null en vez de escribir a ciegas
 * en la partida de alguien.
 */
export const localizarContador = (
  estado: Uint8Array,
  codigoJuego: string,
  equipo: Equipo,
): number | null => {
  const conocida = DIRECCIONES_CONOCIDAS[codigoJuego.slice(0, 3).toUpperCase()];
  if (!conocida) return null;

  const destino = desplazamientoDe(conocida.contador);
  if (!destino) return null;

  return estado[destino.offset] === equipo.ranuras.length ? conocida.contador : null;
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

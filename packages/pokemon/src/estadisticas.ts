// Recalcular las estadisticas de combate de un Pokemon.
//
// Hace falta justo por el motivo por el que existe este proyecto. Un Pokemon
// guarda sus estadisticas ya calculadas, y el juego solo las rehace cuando
// sube de nivel o evoluciona. Si llega de una copia aleatorizada distinta, las
// que trae son las que salieron de la ROM del que lo envio: se vio en una
// prueba real, un Charmander que llego con 18 PS maximos porque en la copia de
// origen su especie tenia 38 de PS base, cuando en la de destino tiene 47.
//
// Sin esto el Pokemon se acepta y se ve bien, pero arrastra numeros de otra
// partida hasta que sube de nivel. Con esto llega con lo que le toca aqui.

import { descifrarDatos, posicionDe, TAMANO_EN_EQUIPO } from './gen3';
import type { EstadisticasBase } from './rom';

/** Donde viven las estadisticas ya calculadas dentro del bloque de equipo. */
const COMBATE = {
  nivel: 0x54,
  psActuales: 0x56,
  psMaximos: 0x58,
  ataque: 0x5a,
  defensa: 0x5c,
  velocidad: 0x5e,
  ataqueEspecial: 0x60,
  defensaEspecial: 0x62,
} as const;

/**
 * Las cinco estadisticas que toca la naturaleza, en el orden del juego.
 *
 * La naturaleza es `personalidad % 25`: sube la que esta en `naturaleza / 5` y
 * baja la que esta en `naturaleza % 5`. Los PS nunca se ven afectados.
 */
const AFECTADAS = ['ataque', 'defensa', 'velocidad', 'ataqueEspecial', 'defensaEspecial'] as const;

export type EstadisticasCalculadas = {
  psMaximos: number;
  ataque: number;
  defensa: number;
  velocidad: number;
  ataqueEspecial: number;
  defensaEspecial: number;
};

/** Shedinja es la excepcion de toda la serie: siempre 1 PS. */
const SHEDINJA = 303;

const u16 = (b: Uint8Array, i: number): number => b[i]! | (b[i + 1]! << 8);
const escribirU16 = (b: Uint8Array, i: number, v: number): void => {
  b[i] = v & 0xff;
  b[i + 1] = (v >>> 8) & 0xff;
};

/** Los seis IV van apretados en cinco bits cada uno dentro de una palabra. */
export const leerIvs = (palabra: number): number[] =>
  [0, 5, 10, 15, 20, 25].map((desplazamiento) => (palabra >>> desplazamiento) & 0x1f);

export const calcularEstadisticas = (
  base: EstadisticasBase,
  nivel: number,
  ivs: readonly number[],
  esfuerzos: readonly number[],
  naturaleza: number,
  especie: number,
): EstadisticasCalculadas => {
  const comun = (valorBase: number, iv: number, ev: number) =>
    Math.floor(((2 * valorBase + iv + Math.floor(ev / 4)) * nivel) / 100);

  const psMaximos =
    especie === SHEDINJA ? 1 : comun(base.ps, ivs[0]!, esfuerzos[0]!) + nivel + 10;

  const sube = Math.floor(naturaleza / 5);
  const baja = naturaleza % 5;

  const resto = AFECTADAS.map((cual, i) => {
    const bruto = comun(base[cual], ivs[i + 1]!, esfuerzos[i + 1]!) + 5;
    // El juego aplica el 10% con enteros: primero multiplica, luego trunca.
    if (sube === baja) return bruto;
    if (i === sube) return Math.floor((bruto * 110) / 100);
    if (i === baja) return Math.floor((bruto * 90) / 100);
    return bruto;
  });

  return {
    psMaximos,
    ataque: resto[0]!,
    defensa: resto[1]!,
    velocidad: resto[2]!,
    ataqueEspecial: resto[3]!,
    defensaEspecial: resto[4]!,
  };
};

/**
 * Rehace las estadisticas de un bloque con los datos base de esta ROM.
 *
 * Los PS actuales se ajustan en proporcion, no se rellenan: un Pokemon herido
 * sigue herido despues de un intercambio, y uno debilitado sigue debilitado.
 * Curarlo de regalo seria un cambio en la partida que nadie ha pedido.
 */
export const recalcularEnBloque = (bloque: Uint8Array, base: EstadisticasBase): Uint8Array => {
  if (bloque.length !== TAMANO_EN_EQUIPO) return bloque.slice();

  const copia = bloque.slice();
  const personalidad =
    (copia[0]! | (copia[1]! << 8) | (copia[2]! << 16) | (copia[3]! << 24)) >>> 0;
  const datos = descifrarDatos(copia);
  const g = posicionDe(personalidad, 'G');
  const e = posicionDe(personalidad, 'E');
  const m = posicionDe(personalidad, 'M');

  const especie = u16(datos, g);
  const nivel = copia[COMBATE.nivel] ?? 1;
  const esfuerzos = [0, 1, 2, 3, 4, 5].map((i) => datos[e + i]!);
  const palabraIvs =
    (datos[m + 4]! | (datos[m + 5]! << 8) | (datos[m + 6]! << 16) | (datos[m + 7]! << 24)) >>> 0;

  const nuevas = calcularEstadisticas(
    base,
    nivel,
    leerIvs(palabraIvs),
    esfuerzos,
    personalidad % 25,
    especie,
  );

  const psAntes = u16(copia, COMBATE.psActuales);
  const maximosAntes = u16(copia, COMBATE.psMaximos);
  const psDespues =
    psAntes === 0 || maximosAntes === 0
      ? Math.min(psAntes, nuevas.psMaximos)
      : Math.min(nuevas.psMaximos, Math.round((psAntes / maximosAntes) * nuevas.psMaximos));

  escribirU16(copia, COMBATE.psActuales, psDespues);
  escribirU16(copia, COMBATE.psMaximos, nuevas.psMaximos);
  escribirU16(copia, COMBATE.ataque, nuevas.ataque);
  escribirU16(copia, COMBATE.defensa, nuevas.defensa);
  escribirU16(copia, COMBATE.velocidad, nuevas.velocidad);
  escribirU16(copia, COMBATE.ataqueEspecial, nuevas.ataqueEspecial);
  escribirU16(copia, COMBATE.defensaEspecial, nuevas.defensaEspecial);
  // El checksum cubre solo los datos cifrados, no la parte de combate: estas
  // estadisticas quedan fuera y no hay nada que rehacer.
  return copia;
};

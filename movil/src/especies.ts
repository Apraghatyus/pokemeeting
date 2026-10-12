// Nombres y tipos de cada especie, leidos de TU ROM.
//
// Lo mismo que hace la web (apps/web/src/core/useEspecies.ts) y con las mismas
// funciones de packages/pokemon: en una copia aleatorizada los tipos no son los
// de siempre, asi que no sirve una lista de internet.

import {
  encontrarTablaDex,
  encontrarTablaEstadisticas,
  encontrarTablaNombres,
  nacionalDeGen3,
} from '@emupoke/pokemon';

export type Especies = {
  nombre: (especie: number) => string;
  tipos: (especie: number) => readonly [number, number] | null;
  /** El numero de la Pokedex nacional, que es como se llaman los sprites. */
  nacional: (especie: number) => number;
};

export const SIN_ESPECIES: Especies = {
  nombre: especie => `#${especie}`,
  tipos: () => null,
  nacional: nacionalDeGen3,
};

export const leerEspecies = (rom: Uint8Array): Especies => {
  const nombres = encontrarTablaNombres(rom)?.nombre;
  const stats = encontrarTablaEstadisticas(rom);
  const dex = encontrarTablaDex(rom)?.nacional;
  return {
    nombre: especie => nombres?.(especie) ?? `#${especie}`,
    tipos: especie => stats?.estadisticas(especie)?.tipos ?? null,
    // Sin tabla, la fija de tercera: esa numeracion no la toca el aleatorizador.
    nacional: especie => dex?.(especie) ?? nacionalDeGen3(especie),
  };
};

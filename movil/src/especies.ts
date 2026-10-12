// Nombres y tipos de cada especie, leidos de TU ROM.
//
// Lo mismo que hace la web (apps/web/src/core/useEspecies.ts) y con las mismas
// funciones de packages/pokemon: en una copia aleatorizada los tipos no son los
// de siempre, asi que no sirve una lista de internet.

import {encontrarTablaEstadisticas, encontrarTablaNombres} from '@emupoke/pokemon';

export type Especies = {
  nombre: (especie: number) => string;
  tipos: (especie: number) => readonly [number, number] | null;
};

export const SIN_ESPECIES: Especies = {
  nombre: especie => `#${especie}`,
  tipos: () => null,
};

export const leerEspecies = (rom: Uint8Array): Especies => {
  const nombres = encontrarTablaNombres(rom)?.nombre;
  const stats = encontrarTablaEstadisticas(rom);
  return {
    nombre: especie => nombres?.(especie) ?? `#${especie}`,
    tipos: especie => stats?.estadisticas(especie)?.tipos ?? null,
  };
};

// El equipo, resumido para enseñarlo y para mandarselo al companero.
//
// Es la cara visible de todo lo que hay debajo: localizar la memoria dentro de
// un estado, descifrar cada Pokemon y traducir su mote. Lo que sale es un
// puñado de numeros y seis motes, sin un solo byte que venga de la ROM.
//
// Esa frontera es a proposito. El nombre de la especie y su sprite los pone
// cada lado con su propia copia del juego, asi que por el cable no cruza nada
// de Nintendo, igual que no cruza la ROM. Y funciona porque dos copias
// aleatorizadas de la misma edicion conservan la misma tabla de nombres: la
// especie 25 se llama PIKACHU en las dos, aunque una la haya hecho de Fuego.

import type { EquipoResumen, PokemonResumen } from '@emupoke/protocol';
import { leerPokemon, pareceValido, TAMANO_EN_EQUIPO, TAMANO_EQUIPO } from './gen3';
import { localizarEquipo, type Equipo } from './equipo';
import { desplazamientoDe, leerCabecera } from './savestate';
import { leerTexto } from './texto';

const u16 = (b: Uint8Array, i: number): number => b[i]! | (b[i + 1]! << 8);

/** Donde estan las estadisticas ya calculadas dentro del bloque de equipo. */
const PS_ACTUALES = 0x56;
const PS_MAXIMOS = 0x58;

const resumirBloque = (bloque: Uint8Array, ranura: number): PokemonResumen => {
  const p = leerPokemon(bloque);
  return {
    ranura,
    especie: p.especie,
    mote: leerTexto(p.moteBruto),
    nivel: p.nivel,
    ps: u16(bloque, PS_ACTUALES),
    psMaximos: u16(bloque, PS_MAXIMOS),
    huevo: p.esHuevo,
    personalidad: p.personalidad,
  };
};

/**
 * Lee el equipo de una partida y lo deja listo para enseñar o enviar.
 *
 * Devuelve tambien donde lo encontro: localizarlo cuesta recorrer la memoria
 * entera comprobando checksums, y esto se llama cada pocos segundos mientras
 * se juega. Con la direccion en la mano, las siguientes lecturas van directas.
 */
export const resumirEquipo = (
  estado: Uint8Array,
): { resumen: EquipoResumen; equipo: Equipo } | null => {
  const equipo = localizarEquipo(estado);
  if (!equipo) return null;

  return {
    equipo,
    resumen: {
      juego: leerCabecera(estado).codigoJuego,
      momento: Date.now(),
      ranuras: equipo.ranuras.map((r) => resumirBloque(r.bloque, r.indice)),
    },
  };
};

/**
 * Relee el equipo en una direccion que ya conocemos.
 *
 * Es la version barata, para repetirla mientras se juega: en vez de barrer
 * trescientos kilobytes de memoria, mira seis bloques de cien bytes.
 *
 * Devuelve null si lo que hay ahi ya no parece un equipo. Pasa, y no es un
 * error: entre dos lecturas el jugador puede haber reiniciado o cargado otra
 * partida, y entonces toca volver a buscarlo.
 */
export const releerEquipo = (
  estado: Uint8Array,
  direccion: number,
  codigoJuego: string,
): EquipoResumen | null => {
  const destino = desplazamientoDe(direccion);
  if (!destino) return null;

  const ranuras: PokemonResumen[] = [];
  for (let i = 0; i < TAMANO_EQUIPO; i += 1) {
    const inicio = destino.offset + i * TAMANO_EN_EQUIPO;
    const bloque = estado.subarray(inicio, inicio + TAMANO_EN_EQUIPO);
    // El equipo termina en el primer hueco: lo que venga despues es memoria de
    // otra cosa que puede parecerse a un Pokemon por casualidad.
    if (bloque.length < TAMANO_EN_EQUIPO || !pareceValido(bloque)) break;
    ranuras.push(resumirBloque(bloque, i));
  }

  if (ranuras.length === 0) return null;
  return { juego: codigoJuego, momento: Date.now(), ranuras };
};

/**
 * Si dos lecturas del equipo dicen lo mismo.
 *
 * Se compara para no mandar por la red lo mismo una y otra vez: entre dos
 * lecturas lo normal es que no haya cambiado nada. El momento no cuenta,
 * porque cambia siempre.
 */
export const mismoEquipo = (a: EquipoResumen | null, b: EquipoResumen | null): boolean => {
  if (a === null || b === null) return a === b;
  if (a.ranuras.length !== b.ranuras.length) return false;
  return a.ranuras.every((uno, i) => {
    const otro = b.ranuras[i]!;
    return (
      uno.personalidad === otro.personalidad &&
      uno.especie === otro.especie &&
      uno.nivel === otro.nivel &&
      uno.ps === otro.ps &&
      uno.psMaximos === otro.psMaximos &&
      uno.mote === otro.mote &&
      uno.huevo === otro.huevo
    );
  });
};

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

import type { EquipoResumen, EstadoPokemon, PokemonResumen } from '@emupoke/protocol';
import { leerPokemon, pareceValido, TAMANO_EN_EQUIPO, TAMANO_EQUIPO } from './gen3';
import { localizarEquipo, type Equipo } from './equipo';
import { desplazamientoDe, leerCabecera } from './savestate';
import { parseGameCode } from './games';
import { lectorPara, registrarLector } from './lectores';
import { leerTexto } from './texto';

const u16 = (b: Uint8Array, i: number): number => b[i]! | (b[i + 1]! << 8);

/** Donde estan las estadisticas ya calculadas dentro del bloque de equipo. */
const PS_ACTUALES = 0x56;
const PS_MAXIMOS = 0x58;

/**
 * El estado alterado, en una palabra de cuatro bytes.
 *
 * Los bits de abajo cuentan los turnos que le quedan de sueño, asi que
 * cualquiera de ellos encendido significa dormido. Los de arriba son una
 * bandera cada uno. Se mira en orden de gravedad porque solo se enseña uno.
 */
const leerEstado = (bloque: Uint8Array): EstadoPokemon | null => {
  const psMaximos = u16(bloque, PS_MAXIMOS);
  if (psMaximos > 0 && u16(bloque, PS_ACTUALES) === 0) return 'debilitado';

  const banderas = bloque[0x50] ?? 0;
  if ((banderas & 0x07) !== 0) return 'dormido';
  if ((banderas & 0x20) !== 0) return 'congelado';
  if ((banderas & 0x40) !== 0) return 'paralizado';
  if ((banderas & 0x10) !== 0) return 'quemado';
  // El veneno normal y el grave se enseñan igual: lo que importa es que esta
  // envenenado, y el detalle ya lo ve en su juego.
  if ((banderas & 0x88) !== 0) return 'envenenado';
  return null;
};

const resumirBloque = (bloque: Uint8Array, ranura: number): PokemonResumen => {
  const p = leerPokemon(bloque);
  return {
    ranura,
    especie: p.especie,
    mote: leerTexto(p.moteBruto),
    nivel: p.nivel,
    estado: leerEstado(bloque),
    // El tipo no esta en la partida sino en la ROM, que este lector no tiene.
    // Lo rellena quien si la tiene, antes de enseñarlo o de enviarlo.
    tipos: null,
    // No se ensenan: se guardan al terminar la partida, para el historial.
    movimientos: p.movimientos,
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
const resumirGen3 = (
  estado: Uint8Array,
): { resumen: EquipoResumen; equipo: Equipo } | null => {
  // El codigo del juego se saca antes de buscar y se le pasa: con el, el
  // localizador ancla en la direccion del equipo del JUGADOR en vez de elegir
  // por forma, que es lo que hacia que durante un combate saliera en el panel
  // el equipo del entrenador rival.
  const codigoJuego = leerCabecera(estado).codigoJuego;
  const equipo = localizarEquipo(estado, undefined, codigoJuego);
  if (!equipo) return null;

  return {
    equipo,
    resumen: {
      juego: codigoJuego,
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
const releerGen3 = (
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
 * El lector de tercera generacion, registrado para que lo encuentren los de
 * arriba sin saber que generacion es.
 *
 * Reconoce una partida por su forma: un estado de mGBA del tamano que sabemos
 * interpretar, de un juego que el catalogo dice que es de tercera. Un estado de
 * Game Boy Color no pasa por aqui, y cuando exista su lector no habra que
 * tocar nada de esto.
 */
registrarLector({
  nombre: 'tercera generacion',
  generacion: 3,
  sirve: (estado) => {
    try {
      return parseGameCode(leerCabecera(estado).codigoJuego).game?.generacion === 3;
    } catch {
      // leerCabecera se queja si el estado no tiene el tamano esperado, que es
      // justo lo que pasa con el de otra consola.
      return false;
    }
  },
  resumir: resumirGen3,
  releer: releerGen3,
});

/**
 * Lee el equipo de una partida, sea del juego que sea.
 *
 * Devuelve tambien donde lo encontro: localizarlo cuesta recorrer la memoria
 * entera comprobando checksums, y esto se llama cada pocos segundos mientras
 * se juega. Con la direccion en la mano, las siguientes lecturas van directas.
 */
export const resumirEquipo = (
  estado: Uint8Array,
): { resumen: EquipoResumen; equipo: Equipo } | null => lectorPara(estado)?.resumir(estado) ?? null;

/**
 * Relee el equipo en una direccion que ya conocemos.
 *
 * Es la version barata, para repetirla mientras se juega: en vez de barrer
 * trescientos kilobytes de memoria, mira seis bloques.
 */
export const releerEquipo = (
  estado: Uint8Array,
  direccion: number,
  codigoJuego: string,
): EquipoResumen | null =>
  lectorPara(estado)?.releer(estado, direccion, codigoJuego) ?? null;

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
  // Cambiar de Pokemon en combate no cambia el equipo, pero si lo que se
  // ensena. Sin esto el cambio no se repintaba ni se mandaba al companero.
  if ((a.peleando ?? null) !== (b.peleando ?? null)) return false;
  // Entrar o salir de un combate cambia como se ordena el panel, asi que dos
  // lecturas que solo difieran en eso NO dicen lo mismo.
  if ((a.enCombate ?? null) !== (b.enCombate ?? null)) return false;
  return a.ranuras.every((uno, i) => {
    const otro = b.ranuras[i]!;
    return (
      uno.personalidad === otro.personalidad &&
      uno.especie === otro.especie &&
      uno.nivel === otro.nivel &&
      uno.estado === otro.estado &&
      uno.mote === otro.mote &&
      uno.huevo === otro.huevo
    );
  });
};

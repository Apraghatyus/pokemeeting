// Quien sabe leer el equipo de cada juego.
//
// Todo lo que hay por encima de aqui -el resumen que viaja al companero, los
// paneles de la pantalla, el canal de datos- es igual para cualquier juego de
// Pokemon. Lo unico que cambia de una generacion a otra es como estan los
// bytes en memoria, y eso es mucho:
//
//   Segunda (Oro, Plata, Cristal):  48 bytes por Pokemon, sin cifrar, con los
//                                   motes y los nombres en listas aparte.
//   Tercera (Rubi ... Verde Hoja):  100 bytes, cifrados, con las cuatro
//                                   subestructuras en orden variable.
//   Cuarta (DS):                    136 bytes y otro cifrado, y ademas el
//                                   estado seria de otro emulador.
//
// No hay forma de escribir eso una sola vez. Lo que si se puede es que sea lo
// UNICO que haya que escribir: cada generacion aporta un lector y lo registra
// aqui, y nada mas arriba se entera. Añadir Oro y Plata sera escribir un
// fichero al lado de este, no tocar la interfaz ni la red.

import type { EquipoResumen } from '@emupoke/protocol';
import type { Equipo } from './equipo';

export type LectorDeEquipo = {
  /** Para los avisos: "de Oro todavia no se sabe leer el equipo". */
  nombre: string;
  generacion: 2 | 3 | 4;
  /**
   * Si este lector sabe leer esta partida.
   *
   * Se mira el estado, no el nombre del fichero: lo que importa es que la
   * memoria tenga la forma que este lector espera.
   */
  sirve: (estado: Uint8Array) => boolean;
  /** Busca el equipo desde cero. Caro: recorre la memoria. */
  resumir: (estado: Uint8Array) => { resumen: EquipoResumen; equipo: Equipo } | null;
  /** Relee en una direccion ya conocida. Barato: se repite mientras se juega. */
  releer: (estado: Uint8Array, direccion: number, juego: string) => EquipoResumen | null;
};

const registrados: LectorDeEquipo[] = [];

/** Añade un lector. Lo llama cada generacion al cargarse su modulo. */
export const registrarLector = (lector: LectorDeEquipo): void => {
  registrados.push(lector);
};

export const lectores = (): readonly LectorDeEquipo[] => registrados;

/**
 * El lector que sirve para esta partida, o null si ninguno.
 *
 * Que no haya ninguno no es un fallo: es un juego para el que todavia no se ha
 * escrito el lector, y la interfaz lo dice en vez de enseñar seis huecos.
 */
export const lectorPara = (estado: Uint8Array): LectorDeEquipo | null =>
  registrados.find((lector) => lector.sirve(estado)) ?? null;

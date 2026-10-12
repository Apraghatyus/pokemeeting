// Las dos reglas de Nuzlocke que se vigilan mirando el equipo.
//
// 1. SOLO EL PRIMERO DE CADA RUTA. Cada Pokemon lleva dentro la zona donde se
//    capturo, asi que no hay que apuntar nada a mano: si aparece un segundo
//    Pokemon de una zona que ya tenia el suyo, esa ruta estaba gastada.
//
// 2. DEBILITADO = MUERTO. Un Pokemon que cayo tiene que ir al PC o liberarse.
//    El juego no deja ver si alguien se curo en el Centro "con debilitados en
//    el equipo" -eso es un guion, no un dato-, pero si se ve el resultado: un
//    Pokemon que estuvo debilitado vuelve a estar en pie. Da igual si fue con un
//    Revivir o en el Centro: en los dos casos se ha usado a un muerto.
//
// POR QUE HAY MEMORIA Y NO BASTA CON MIRAR EL EQUIPO. Las dos reglas hablan de
// cosas que pueden irse del equipo. Un Pokemon liberado se lleva su zona con
// el, y sin apuntarla la ruta volveria a parecer libre. Y uno debilitado que se
// guarda en el PC y se cura alli no se ve: cuando vuelva al equipo, solo la
// memoria sabe que estaba muerto. Se guarda por partida, en este navegador.
//
// LO QUE NO SE CUENTA, a proposito:
// - Lo que llega por intercambio. Trae la zona de la partida del OTRO, y en un
//   Soul Link los dos capturan en la misma ruta: contarlo marcaria todos los
//   intercambios. Se reconoce porque su entrenador original no eres tu.
// - Lo que no se capturo en ninguna zona: huevos, intercambios del juego y
//   eventos. `lugar` ya llega a null para ellos.
// - El combate del laboratorio. Tu inicial cae ahi por guion y el juego lo
//   cura; contarlo como muerte marcaria a todo el mundo en el minuto dos. Por
//   eso una caida solo cuenta cuando ya se han visto dos Pokemon distintos, la
//   misma regla que usa el fin de partida. Si cae el unico que tienes fuera del
//   laboratorio, el equipo entero ha caido y eso ya es fin de partida.
//
// Como el resto de reglas, AVISA y no impide: se marca la ficha.

import { useEffect, useMemo, useState } from 'react';
import type { EquipoResumen } from '@emupoke/protocol';
import { zonaCanonica } from './zonas';

export type MemoriaDeReglas = {
  /** Tu numero de entrenador, el del primer equipo que se vio. */
  propio: number | null;
  /** Que Pokemon gasto cada zona, por personalidad. */
  rutas: Record<string, number>;
  /** Los que han caido alguna vez. */
  muertos: number[];
  /** Personalidades vistas en el equipo, para saber si ya se paso el laboratorio. */
  vistos: number[];
};

export type Infracciones = {
  /** Capturados en una zona que ya tenia el suyo. */
  rutaRepetida: ReadonlySet<number>;
  /** Estuvieron debilitados y vuelven a estar en pie. */
  revividos: ReadonlySet<number>;
};

export const MEMORIA_VACIA: MemoriaDeReglas = { propio: null, rutas: {}, muertos: [], vistos: [] };

const SIN_INFRACCIONES: Infracciones = { rutaRepetida: new Set(), revividos: new Set() };

/** Pasado esto se deja de apuntar a quien se ha visto: con dos ya basta. */
const MAX_VISTOS = 12;

/** El entrenador que mas se repite: en un equipo recien empezado, el tuyo. */
const entrenadorMasComun = (equipo: EquipoResumen): number | null => {
  const cuantos = new Map<number, number>();
  for (const p of equipo.ranuras) {
    if (p.huevo || p.entrenador === undefined) continue;
    cuantos.set(p.entrenador, (cuantos.get(p.entrenador) ?? 0) + 1);
  }
  let mejor: number | null = null;
  let veces = 0;
  for (const [id, n] of cuantos) if (n > veces) [mejor, veces] = [id, n];
  return mejor;
};

/**
 * Aplica las dos reglas a una lectura del equipo.
 *
 * Pura: recibe la memoria y devuelve la nueva, sin tocar nada. Es lo que deja
 * probarla sin navegador, y lo que hace que leer dos veces el mismo equipo de
 * siempre lo mismo.
 */
export const aplicarReglas = (
  memoria: MemoriaDeReglas,
  equipo: EquipoResumen | null,
): { memoria: MemoriaDeReglas; infracciones: Infracciones } => {
  const pokemon = (equipo?.ranuras ?? []).filter((p) => !p.huevo);
  if (!equipo || pokemon.length === 0) return { memoria, infracciones: SIN_INFRACCIONES };

  const propio = memoria.propio ?? entrenadorMasComun(equipo);
  const rutas = { ...memoria.rutas };
  const vistos = [...memoria.vistos];
  for (const p of pokemon) {
    if (!vistos.includes(p.personalidad) && vistos.length < MAX_VISTOS) vistos.push(p.personalidad);
  }

  // --- solo el primero de cada ruta ---
  const rutaRepetida = new Set<number>();
  for (const p of pokemon) {
    if (p.lugar === null || p.lugar === undefined) continue;
    // Lo que te llego por intercambio no lo capturaste tu.
    if (propio !== null && p.entrenador !== undefined && p.entrenador !== propio) continue;
    // Las zonas que el juego parte en dos -la segunda planta de una cueva- son
    // la misma para esto.
    const zona = String(zonaCanonica(p.lugar));
    const duenio = rutas[zona];
    if (duenio === undefined) rutas[zona] = p.personalidad;
    else if (duenio !== p.personalidad) rutaRepetida.add(p.personalidad);
  }

  // --- debilitado = muerto ---
  const muertos = [...memoria.muertos];
  const pasadoElLaboratorio = vistos.length >= 2;
  for (const p of pokemon) {
    if (p.estado === 'debilitado' && pasadoElLaboratorio && !muertos.includes(p.personalidad)) {
      muertos.push(p.personalidad);
    }
  }
  const revividos = new Set(
    pokemon
      .filter((p) => p.estado !== 'debilitado' && muertos.includes(p.personalidad))
      .map((p) => p.personalidad),
  );

  return {
    memoria: { propio, rutas, muertos, vistos },
    infracciones: { rutaRepetida, revividos },
  };
};

const clave = (partida: string) => `emupoke.reglas.${partida}`;

const leer = (partida: string): MemoriaDeReglas => {
  try {
    const crudo = globalThis.localStorage?.getItem(clave(partida));
    if (!crudo) return MEMORIA_VACIA;
    const datos = JSON.parse(crudo) as Partial<MemoriaDeReglas>;
    return {
      propio: typeof datos.propio === 'number' ? datos.propio : null,
      rutas: datos.rutas && typeof datos.rutas === 'object' ? datos.rutas : {},
      muertos: Array.isArray(datos.muertos) ? datos.muertos : [],
      vistos: Array.isArray(datos.vistos) ? datos.vistos : [],
    };
  } catch {
    return MEMORIA_VACIA;
  }
};

const escribir = (partida: string, memoria: MemoriaDeReglas): void => {
  try {
    globalThis.localStorage?.setItem(clave(partida), JSON.stringify(memoria));
  } catch {
    // Sin sitio no se recuerda, y se juega igual.
  }
};

/** Para cuando se borra una partida: su memoria ya no sirve de nada. */
export const olvidarReglas = (partida: string): void => {
  try {
    globalThis.localStorage?.removeItem(clave(partida));
  } catch {
    // Si no se puede, se queda; no estorba.
  }
};

/**
 * Vigila las dos reglas en la partida en curso.
 *
 * Con `activo` a false -dificultad Normal, o el reto ya acabado- no apunta
 * nada ni marca a nadie: lo que pase despues de acabar no cuenta.
 */
export const useReglasNuzlocke = (
  partida: string | null,
  equipo: EquipoResumen | null,
  activo: boolean,
): Infracciones & { memoria: MemoriaDeReglas } => {
  // La memoria va atada a SU partida. Al cambiar de partida hay un render en
  // el que todavia se tiene la de la anterior; sin esta marca se aplicaria a la
  // nueva y se guardaria con su nombre, mezclando las rutas de las dos.
  const [guardada, setGuardada] = useState<{ partida: string | null; memoria: MemoriaDeReglas }>({
    partida: null,
    memoria: MEMORIA_VACIA,
  });

  useEffect(() => {
    setGuardada({ partida, memoria: partida ? leer(partida) : MEMORIA_VACIA });
  }, [partida]);

  const lista = guardada.partida === partida;
  const memoria = guardada.memoria;
  const resultado = useMemo(
    () => (activo && partida && lista ? aplicarReglas(memoria, equipo) : null),
    [activo, partida, lista, memoria, equipo],
  );

  // Se guarda solo si cambio algo: cada lectura del equipo pasa por aqui y no
  // hace falta escribir el almacenamiento cada tres segundos para nada.
  const nueva = resultado?.memoria;
  useEffect(() => {
    if (!partida || !lista || !nueva || nueva === memoria) return;
    if (JSON.stringify(nueva) === JSON.stringify(memoria)) return;
    escribir(partida, nueva);
    setGuardada({ partida, memoria: nueva });
  }, [partida, lista, nueva, memoria]);

  return {
    ...(resultado?.infracciones ?? SIN_INFRACCIONES),
    // Lo apuntado: que zonas se gastaron y quien ha caido. Lo usan el mapa y
    // las reglas del Centro Pokemon.
    memoria: resultado?.memoria ?? memoria,
  };
};

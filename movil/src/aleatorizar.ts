// Aleatorizar desde la app, y rehacer una partida desde su semilla.
//
// El mismo servicio que la web (emupoke.aguaquim.com/randomizer) con el mismo
// formato: la subida la hace el modulo nativo para no pasar la ROM por
// JavaScript, y aqui se queda lo que es igual que en la web: apuntar la
// partida, su semilla, y comprobar que una copia rehecha es el mismo mundo.

import type {Dificultad} from '@emupoke/protocol';
import {parseGameCode} from '@emupoke/pokemon';
import {nombreParaNueva, registrar, sinRevivirDe} from '../../apps/web/src/core/partidas';
import {codificarSemilla, type Semilla} from '../../apps/web/src/core/semilla';
import {aBase64} from './base64';
import {ORIGEN} from './config';
import {Mgba, type Rom} from './nativo';

/** Una casilla del menu del aleatorizador, como la sirve el servicio. */
export type Opcion = {
  id: string;
  label: string;
  description: string;
  generaciones: number[];
  chocaCon?: string[];
};

/** Lo que viene marcado: la mezcla habitual, como en la web. */
export const DE_SERIE = ['salvajes', 'iniciales', 'entrenadores', 'movimientos'];

/** Las opciones que ofrece el servicio, o null si no responde. */
export const opcionesDelServicio = async (): Promise<Opcion[] | null> => {
  try {
    const r = await fetch(`${ORIGEN}/randomizer/health`);
    if (!r.ok) return null;
    const datos = (await r.json()) as {options?: Opcion[]};
    return datos.options ?? null;
  } catch {
    return null;
  }
};

export type PuestoEnCola = {delante: number; atendiendo: number; segundosPorCopia: number | null};

/** UTF-8 a texto: las cabeceras traen texto con acentos en base64. */
const utf8 = (base64: string): string => {
  const binario = atob(base64);
  let salida = '';
  for (let i = 0; i < binario.length; ) {
    const a = binario.charCodeAt(i++);
    if (a < 0x80) salida += String.fromCharCode(a);
    else if (a < 0xe0) salida += String.fromCharCode(((a & 31) << 6) | (binario.charCodeAt(i++) & 63));
    else if (a < 0xf0) {
      const b = binario.charCodeAt(i++);
      const c = binario.charCodeAt(i++);
      salida += String.fromCharCode(((a & 15) << 12) | ((b & 63) << 6) | (c & 63));
    } else {
      const b = binario.charCodeAt(i++);
      const c = binario.charCodeAt(i++);
      const d = binario.charCodeAt(i++);
      const punto = ((a & 7) << 18) | ((b & 63) << 12) | ((c & 63) << 6) | (d & 63);
      salida += String.fromCodePoint(punto);
    }
  }
  return salida;
};

const nuevoTicket = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

type Peticion = {
  options?: string[];
  settingsString?: string;
  seed?: string;
  sinRevivir?: boolean;
};

/** Pide la copia y va contando el puesto en la cola mientras espera. */
const pedir = async (base: Rom, peticion: Peticion, alEsperar?: (p: PuestoEnCola | null) => void) => {
  const ticket = nuevoTicket();
  let esperando = true;
  if (alEsperar) {
    void (async () => {
      while (esperando) {
        await new Promise<void>(sigue => setTimeout(() => sigue(), 1500));
        if (!esperando) break;
        try {
          const r = await fetch(`${ORIGEN}/randomizer/cola?ticket=${encodeURIComponent(ticket)}`);
          const datos = r.ok ? ((await r.json()) as {puesto: PuestoEnCola | null}) : null;
          if (esperando) alEsperar(datos?.puesto ?? null);
        } catch {
          // Que falle preguntar no rompe nada.
        }
      }
    })();
  }
  try {
    const nombre = nombreParaNueva(base.nombre);
    const r = await Mgba.aleatorizar(base.ruta, JSON.stringify({...peticion, ticket}), nombre, ORIGEN);
    return {
      ...r,
      ajustes: r.ajustes ? utf8(r.ajustes) : null,
      cambiado: r.resumen ? ((JSON.parse(utf8(r.resumen)) as {changed?: string[]}).changed ?? []) : [],
    };
  } finally {
    esperando = false;
  }
};

const juegoDe = async (rom: Rom) => {
  const datos = parseGameCode(await codigoDeJuego(rom)).game;
  return {label: datos?.label ?? null, generacion: datos?.generacion ?? null};
};

/** El codigo de juego de una ROM, de su cabecera, sin leerla entera. */
const codigoDeJuego = (rom: Rom): Promise<string> => Mgba.codigoDeJuego(rom.ruta);

/**
 * Aleatoriza una ROM y apunta la partida.
 *
 * Devuelve la ROM nueva y su semilla para invitar a alguien.
 */
export const aleatorizarNueva = async (
  base: Rom,
  opciones: string[],
  dificultad: Dificultad,
  alEsperar?: (p: PuestoEnCola | null) => void,
): Promise<{rom: Rom; semilla: string | null}> => {
  const crcBase = await Mgba.crc32(base.ruta);
  const r = await pedir(base, {options: opciones, sinRevivir: sinRevivirDe(dificultad)}, alEsperar);
  const crc = await Mgba.crc32(r.ruta);
  const juego = await juegoDe(base);
  registrar({
    soullink: false,
    dificultad,
    fichero: r.nombre,
    baseNombre: base.nombre,
    baseCrc32: crcBase,
    semilla: r.seed,
    ajustes: r.ajustes,
    crc32: crc,
    cambiado: r.cambiado,
    nombre: null,
    juego: juego.label,
    generacion: juego.generacion,
  });
  const semilla =
    r.reproducible && r.seed && r.ajustes
      ? codificarSemilla({baseCrc32: crcBase, crc32: crc, semilla: r.seed, ajustes: r.ajustes, dificultad})
      : null;
  return {rom: {ruta: r.ruta, nombre: r.nombre}, semilla};
};

/** La ROM base no es la de la semilla. */
export class OtraRomError extends Error {}

/**
 * Rehace el mundo de una semilla con la ROM original del jugador.
 *
 * Comprueba que sale EXACTAMENTE la misma copia: si no, el guardado no
 * encajaria y no seria el mismo Soul Link.
 */
export const rehacerDesdeSemilla = async (
  base: Rom,
  semilla: Semilla,
  soullink: boolean,
  alEsperar?: (p: PuestoEnCola | null) => void,
): Promise<Rom> => {
  const crcBase = await Mgba.crc32(base.ruta);
  if (crcBase !== semilla.baseCrc32) {
    throw new OtraRomError('Esa ROM no es la misma copia con la que se creó la partida. Elige la original.');
  }
  const r = await pedir(
    base,
    {settingsString: semilla.ajustes, seed: semilla.semilla, sinRevivir: sinRevivirDe(semilla.dificultad)},
    alEsperar,
  );
  const crc = await Mgba.crc32(r.ruta);
  if (crc !== semilla.crc32) {
    throw new Error('La copia rehecha no coincide con la de la partida, seguramente por una versión distinta del randomizer.');
  }
  const juego = await juegoDe(base);
  registrar({
    soullink: soullink ? true : null,
    dificultad: semilla.dificultad ?? null,
    fichero: r.nombre,
    baseNombre: base.nombre,
    baseCrc32: crcBase,
    semilla: semilla.semilla,
    ajustes: semilla.ajustes,
    crc32: crc,
    cambiado: r.cambiado,
    nombre: null,
    juego: juego.label,
    generacion: juego.generacion,
  });
  return {ruta: r.ruta, nombre: r.nombre};
};

/**
 * Trae una partida de otro aparato: un .emupoke de la web o de otra app.
 *
 * Igual que en la web: se rehace la copia desde la semilla, se comprueba que
 * es identica y el guardado se escribe ANTES de abrir la ROM, para que el
 * juego lo encuentre al arrancar.
 */
export const traerPartida = async (
  base: Rom,
  traida: {semilla: Semilla; sav: Uint8Array},
  alEsperar?: (p: PuestoEnCola | null) => void,
): Promise<Rom> => {
  // De otro aparato no se sabe si era de Soul Link: null, como en la web.
  const rom = await rehacerDesdeSemilla(base, traida.semilla, false, alEsperar);
  await Mgba.escribirGuardado(rom.nombre, aBase64(traida.sav));
  return rom;
};

// Lo que se lee de la partida cada pocos segundos, y lo que se deshace.
//
// Es el mismo camino que la web (apps/web/src/core/useEquipo.ts), con las
// mismas funciones de packages/pokemon: un savestate crudo y, de el, el equipo,
// si se ha perdido o ganado, las medallas, el mapa donde se esta, el rival del
// combate y el bolsillo de Poke Balls. La diferencia es de donde sale el
// estado: aqui lo da el emulador nativo, y es el mismo bloque de 0x61000 bytes.
//
// Y LO QUE SE DESHACE, igual que en la web: se guardan las lecturas buenas del
// ultimo minuto y, si una lectura rompe una regla que se hace cumplir, se
// vuelve a cargar una de ellas. Ver apps/web/src/core/reglasEnVivo.ts.

import {useEffect, useRef, useState} from 'react';
import type {EquipoResumen} from '@emupoke/protocol';
import {
  bolsilloDeBalls,
  enCombate,
  encontrarTablaMapas,
  enDerrota,
  enSalonDeLaFama,
  leerCabecera,
  mapaActual,
  medallasAhora,
  quienPelea,
  releerEquipo,
  resumirEquipo,
  rivalEnCombate,
  SIN_SABER,
  type MapaEnMemoria,
  type Medallas,
  type TablaMapas,
} from '@emupoke/pokemon';
import type {Lectura, Veredicto} from '../../apps/web/src/core/reglasEnVivo';
import {aBase64, desdeBase64} from './base64';
import type {Especies} from './especies';
import {Mgba} from './nativo';

/** Cada cuanto se mira. El mismo ritmo que la web. */
const CADA_MS = 3000;
/** Lecturas buenas que se guardan para poder volver: un minuto. */
const HISTORIAL = 20;
/** Si la misma regla salta otra vez en este tiempo, se vuelve mas atras. */
const REPETICION_MS = 60_000;

/** Quien decide si una lectura rompe una regla. Ver la web. */
export type Vigilante = (antes: Lectura | null, ahora: Lectura, tabla: TablaMapas | null) => Veredicto | null;

export type EstadoDeLaPartida = {
  equipo: EquipoResumen | null;
  /** Si el juego ha cantado la derrota: "fue corriendo a un CENTRO PKMN". */
  derrota: boolean;
  /** Si el juego esta enseñando el Salon de la Fama. */
  victoria: boolean;
  medallas: Medallas;
  /** Donde esta el jugador, o null si no se sabe. */
  mapa: MapaEnMemoria | null;
  /** La ultima vez que se deshizo algo por romper una regla. */
  deshecho: {motivo: string; momento: number} | null;
};

const VACIO: EstadoDeLaPartida = {
  equipo: null,
  derrota: false,
  victoria: false,
  medallas: SIN_SABER,
  mapa: null,
  deshecho: null,
};

export const useLectura = (
  jugando: boolean,
  especies: Especies,
  rom: Uint8Array | null,
  vigilanteRef: {current: Vigilante | null},
): EstadoDeLaPartida => {
  const [estado, setEstado] = useState<EstadoDeLaPartida>(VACIO);
  const direccion = useRef<number | null>(null);
  const juego = useRef('');
  const especiesRef = useRef(especies);
  especiesRef.current = especies;
  const tabla = useRef<{rom: Uint8Array; tabla: TablaMapas | null} | null>(null);
  const pistaMapa = useRef<number | null>(null);
  const pistaMochila = useRef<number | null>(null);
  const historial = useRef<{lectura: Lectura; base64: string; momento: number}[]>([]);
  const ultimoDeshecho = useRef<{motivo: string; momento: number; veces: number} | null>(null);

  useEffect(() => {
    setEstado(VACIO);
    direccion.current = null;
    pistaMapa.current = null;
    pistaMochila.current = null;
    historial.current = [];
    ultimoDeshecho.current = null;
    if (!jugando) return;
    let vivo = true;
    let mirando = false;

    const mirar = async () => {
      if (mirando) return;
      mirando = true;
      try {
        const base64 = await Mgba.estado();
        if (!vivo || !base64) return;
        const crudo = desdeBase64(base64);

        let leido =
          direccion.current === null ? null : releerEquipo(crudo, direccion.current, juego.current);
        if (!leido) {
          const hallado = resumirEquipo(crudo);
          direccion.current = hallado?.equipo.direccion ?? null;
          juego.current = hallado?.resumen.juego ?? '';
          leido = hallado?.resumen ?? null;
        }
        let codigo = juego.current || leido?.juego || '';
        try {
          codigo = leerCabecera(crudo).codigoJuego || codigo;
        } catch {
          // Sin cabecera de GBA se sigue con lo que diga el equipo.
        }
        if (leido) {
          leido = {
            ...leido,
            ranuras: leido.ranuras.map(r => ({...r, tipos: especiesRef.current.tipos(r.especie)})),
            peleando: quienPelea(crudo, leido, codigo),
            enCombate: enCombate(crudo, codigo),
          };
        }

        // Donde esta, que tiene delante y su bolsillo de Poke Balls.
        if (rom && tabla.current?.rom !== rom) {
          tabla.current = {rom, tabla: encontrarTablaMapas(rom)};
          pistaMapa.current = null;
        }
        const tablaMapas = rom ? (tabla.current?.tabla ?? null) : null;
        const mapa = tablaMapas ? mapaActual(crudo, tablaMapas, pistaMapa.current) : null;
        if (mapa) pistaMapa.current = mapa.direccion;
        const rival = leido ? rivalEnCombate(crudo, leido, codigo) : null;
        const mochila = mapa ? bolsilloDeBalls(crudo, codigo, mapa, pistaMochila.current) : null;
        if (mochila) pistaMochila.current = mochila.bloque;

        // Las reglas que se hacen cumplir: si esta lectura rompe una, se vuelve
        // a un estado bueno de antes y aqui se acaba.
        const ahora: Lectura = {equipo: leido, mapa, rival, balls: mochila?.firma ?? null};
        const lista = historial.current;
        const veredicto = vigilanteRef.current?.(lista.at(-1)?.lectura ?? null, ahora, tablaMapas) ?? null;
        if (veredicto && lista.length > 0) {
          const momento = Date.now();
          const previo = ultimoDeshecho.current;
          const veces =
            previo && previo.motivo === veredicto.motivo && momento - previo.momento < REPETICION_MS
              ? previo.veces + 1
              : 0;
          const segundos = veces === 0 ? veredicto.atras : Math.max(veredicto.atras, 3) * 2 ** veces;
          const limite = momento - segundos * 1000;
          let elegido = 0;
          for (let i = lista.length - 1; i >= 0; i -= 1) {
            const h = lista[i]!;
            if (h.momento > limite) continue;
            if (veredicto.antesDe !== undefined && h.lectura.rival?.personalidad === veredicto.antesDe) continue;
            elegido = i;
            break;
          }
          if (await Mgba.cargarEstado(lista[elegido]!.base64)) {
            historial.current = lista.slice(0, elegido + 1);
            ultimoDeshecho.current = {motivo: veredicto.motivo, momento, veces};
            if (vivo) setEstado(e => ({...e, deshecho: {motivo: veredicto.motivo, momento}}));
            return;
          }
        }
        lista.push({lectura: ahora, base64, momento: Date.now()});
        if (lista.length > HISTORIAL) lista.shift();

        // Las medallas salen del guardado y de la memoria, como en la web.
        const guardado = await Mgba.guardado().catch(() => null);
        const medallas = medallasAhora(guardado ? desdeBase64(guardado) : null, crudo, codigo);

        if (!vivo) return;
        setEstado(e => ({
          equipo: leido,
          derrota: enDerrota(crudo),
          victoria: enSalonDeLaFama(crudo),
          medallas,
          mapa:
            e.mapa?.grupo === mapa?.grupo && e.mapa?.numero === mapa?.numero && e.mapa?.zona === mapa?.zona
              ? e.mapa
              : mapa,
          deshecho: e.deshecho,
        }));
      } catch {
        // Un estado que no sabemos leer: se deja como estaba.
      } finally {
        mirando = false;
      }
    };

    void mirar();
    const reloj = setInterval(() => void mirar(), CADA_MS);
    return () => {
      vivo = false;
      clearInterval(reloj);
    };
  }, [jugando, rom, vigilanteRef]);

  return estado;
};

/** Para quien necesite el estado de ahora mismo en bytes (intercambios, mote, estados). */
export const estadoAhora = async (): Promise<Uint8Array | null> => {
  const base64 = await Mgba.estado();
  return base64 ? desdeBase64(base64) : null;
};

/** Carga en el emulador un estado en bytes. */
export const cargarEstadoEnBytes = (bytes: Uint8Array): Promise<boolean> => Mgba.cargarEstado(aBase64(bytes));

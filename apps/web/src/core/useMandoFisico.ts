// Mandos fisicos en el navegador, con la Gamepad API.
//
// La API no avisa de cada pulsacion: hay que preguntarle. Se le pregunta una
// vez por fotograma de pantalla mientras haya algun mando conectado, y solo se
// le dice al nucleo lo que CAMBIA, igual que hace el mando tactil.
//
// Lo que pulsa el mando se suma a lo que pulse el teclado y la pantalla: el
// nucleo lleva la cuenta de cada boton por separado. Ver `mandoFisico.ts` para
// que boton va a cual.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MgbaModule } from './mgbaCore';
import {
  algoPulsado,
  asignarBoton,
  entradasDelMando,
  MAPA_POR_DEFECTO,
  primerBotonPulsado,
  type EntradaGba,
  type MapaMando,
} from './mandoFisico';

export type MandoFisico = {
  /** El nombre del que este conectado, o null. Para decirlo en Ajustes. */
  conectado: string | null;
  /** Que botones van a cada entrada. */
  mapa: MapaMando;
  /** La entrada que espera a que se pulse un boton para quedarselo, o null. */
  esperando: EntradaGba | null;
  aprender: (entrada: EntradaGba) => void;
  cancelar: () => void;
  restaurar: () => void;
};

/** Es de este aparato, como las teclas: otro mando en otro sitio va distinto. */
const CLAVE = 'emupoke.mandoFisico';

const leerMapa = (): MapaMando => {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return MAPA_POR_DEFECTO;
    const datos = JSON.parse(crudo) as Partial<MapaMando>;
    // Lo que falte o no se entienda, de fabrica: un mapa a medias no puede
    // dejar una entrada sin boton.
    const mapa = { ...MAPA_POR_DEFECTO };
    for (const entrada of Object.keys(MAPA_POR_DEFECTO) as EntradaGba[]) {
      const botones = datos[entrada];
      if (Array.isArray(botones) && botones.every((b) => Number.isInteger(b) && b >= 0 && b < 64)) {
        mapa[entrada] = botones;
      }
    }
    return mapa;
  } catch {
    return MAPA_POR_DEFECTO;
  }
};

const guardarMapa = (mapa: MapaMando): void => {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(mapa));
  } catch {
    // Sin almacenamiento vale para esta sesion.
  }
};

/**
 * @param coreRef   el nucleo
 * @param activo    sin partida no se manda nada
 * @param alUsarlo  se llama cuando se juega con el: el mando tactil se aparta
 */
export const useMandoFisico = (
  coreRef: { current: MgbaModule | null },
  activo: boolean,
  alUsarlo: () => void,
): MandoFisico => {
  const [conectado, setConectado] = useState<string | null>(null);
  const [mapa, setMapa] = useState<MapaMando>(leerMapa);
  const [esperando, setEsperando] = useState<EntradaGba | null>(null);
  const mapaRef = useRef(mapa);
  mapaRef.current = mapa;
  const esperandoRef = useRef(esperando);
  esperandoRef.current = esperando;
  const pulsadas = useRef(new Set<EntradaGba>());
  const avisado = useRef(false);
  const alUsarloRef = useRef(alUsarlo);
  alUsarloRef.current = alUsarlo;

  useEffect(() => {
    const leerConectado = () => {
      const mando = globalThis.navigator?.getGamepads?.().find((m) => m !== null) ?? null;
      setConectado(mando?.id ?? null);
    };
    leerConectado();
    globalThis.addEventListener('gamepadconnected', leerConectado);
    globalThis.addEventListener('gamepaddisconnected', leerConectado);
    return () => {
      globalThis.removeEventListener('gamepadconnected', leerConectado);
      globalThis.removeEventListener('gamepaddisconnected', leerConectado);
    };
  }, []);

  // Mientras se aprende un boton se mira el mando aunque no haya partida: se
  // reasigna desde Ajustes, y puede que no haya nada cargado.
  const mirando = conectado !== null && (activo || esperando !== null);

  useEffect(() => {
    if (!mirando) return;
    let vuelta = 0;
    // Lo que estuviera pulsado al empezar a aprender no cuenta: se espera a
    // que se suelte todo y se pulse uno nuevo.
    let suelto = false;

    const soltarTodo = () => {
      const core = coreRef.current;
      for (const entrada of pulsadas.current) core?.buttonUnpress(entrada);
      pulsadas.current = new Set();
    };

    const mirar = () => {
      const core = coreRef.current;
      const ahora = new Set<EntradaGba>();
      const aprendiendo = esperandoRef.current;
      if (aprendiendo) {
        // Lo que estuviera pulsado en el juego se suelta antes de nada.
        soltarTodo();
        const nuevo = globalThis.navigator
          .getGamepads()
          .map((m) => (m ? primerBotonPulsado(m) : null))
          .find((b) => b !== null);
        if (nuevo === undefined || nuevo === null) suelto = true;
        else if (suelto) {
          const siguiente = asignarBoton(mapaRef.current, aprendiendo, nuevo);
          guardarMapa(siguiente);
          setMapa(siguiente);
          setEsperando(null);
        }
        // Aprendiendo no se juega: el boton que se pulsa es para Ajustes.
        vuelta = requestAnimationFrame(mirar);
        return;
      }
      for (const mando of globalThis.navigator.getGamepads()) {
        if (!mando) continue;
        for (const entrada of entradasDelMando(mando, mapaRef.current)) ahora.add(entrada);
        // La primera vez que se usa, el mando tactil sobra: quien coge un mando
        // no va a tocar la pantalla.
        if (!avisado.current && algoPulsado(mando)) {
          avisado.current = true;
          alUsarloRef.current();
        }
      }
      if (core && activo) {
        for (const entrada of ahora) if (!pulsadas.current.has(entrada)) core.buttonPress(entrada);
        for (const entrada of pulsadas.current) if (!ahora.has(entrada)) core.buttonUnpress(entrada);
      }
      pulsadas.current = ahora;
      vuelta = requestAnimationFrame(mirar);
    };

    vuelta = requestAnimationFrame(mirar);
    return () => {
      cancelAnimationFrame(vuelta);
      // Desconectarlo con un boton pulsado no puede dejar al personaje andando solo.
      soltarTodo();
    };
  }, [mirando, activo, coreRef]);

  const aprender = useCallback((entrada: EntradaGba) => setEsperando(entrada), []);
  const cancelar = useCallback(() => setEsperando(null), []);
  const restaurar = useCallback(() => {
    guardarMapa(MAPA_POR_DEFECTO);
    setMapa(MAPA_POR_DEFECTO);
    setEsperando(null);
  }, []);

  return { conectado, mapa, esperando, aprender, cancelar, restaurar };
};

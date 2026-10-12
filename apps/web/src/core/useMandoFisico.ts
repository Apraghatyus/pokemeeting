// Mandos fisicos en el navegador, con la Gamepad API.
//
// La API no avisa de cada pulsacion: hay que preguntarle. Se le pregunta una
// vez por fotograma de pantalla mientras haya algun mando conectado, y solo se
// le dice al nucleo lo que CAMBIA, igual que hace el mando tactil.
//
// Lo que pulsa el mando se suma a lo que pulse el teclado y la pantalla: el
// nucleo lleva la cuenta de cada boton por separado. Ver `mandoFisico.ts` para
// que boton va a cual.

import { useEffect, useRef, useState } from 'react';
import type { MgbaModule } from './mgbaCore';
import { algoPulsado, entradasDelMando, type EntradaGba } from './mandoFisico';

export type MandoFisico = {
  /** El nombre del que este conectado, o null. Para decirlo en Ajustes. */
  conectado: string | null;
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

  useEffect(() => {
    if (!activo || conectado === null) return;
    let vuelta = 0;

    const soltarTodo = () => {
      const core = coreRef.current;
      for (const entrada of pulsadas.current) core?.buttonUnpress(entrada);
      pulsadas.current = new Set();
    };

    const mirar = () => {
      const core = coreRef.current;
      const ahora = new Set<EntradaGba>();
      for (const mando of globalThis.navigator.getGamepads()) {
        if (!mando) continue;
        for (const entrada of entradasDelMando(mando)) ahora.add(entrada);
        // La primera vez que se usa, el mando tactil sobra: quien coge un mando
        // no va a tocar la pantalla.
        if (!avisado.current && algoPulsado(mando)) {
          avisado.current = true;
          alUsarloRef.current();
        }
      }
      if (core) {
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
  }, [activo, conectado, coreRef]);

  return { conectado };
};

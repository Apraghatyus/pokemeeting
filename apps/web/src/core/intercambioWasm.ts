// El intercambio sobre el nucleo wasm de la web.
//
// El motor esta en `useIntercambio.ts` y no sabe de que emulador se trata: solo
// pide como leer y escribir la partida. Esto se lo da con el nucleo del
// navegador; la app de Android se lo da con el suyo.

import { useMemo } from 'react';
import type { PeerMessage } from '@emupoke/protocol';
import { TAMANO_ESTADO } from '@emupoke/pokemon';
import type { MgbaModule } from './mgbaCore';
import { useIntercambioCon, type Intercambio, type PartidaIO } from './useIntercambio';

/** Ranura de estado propia del intercambio, lejos de las del jugador. */
const RANURA_TRATO = 6;

/**
 * El intercambio de la web, sobre el nucleo wasm. Ver `useIntercambioCon`.
 *
 * @param coreRef   el nucleo, para leer y escribir la partida
 */
export const useIntercambio = (
  coreRef: { current: MgbaModule | null },
  romBytes: Uint8Array | null,
  partida: string | null,
  enviar: (mensaje: PeerMessage) => boolean,
  escuchar: (oyente: (mensaje: PeerMessage) => void) => () => void,
): Intercambio => {
  const rutaDeEstado = (core: MgbaModule): string | null => {
    const base = core.gameName?.split('/').pop()?.replace(/\.[^.]+$/, '');
    return base ? `${core.filePaths().saveStatePath}/${base}.ss${RANURA_TRATO}` : null;
  };
  const io = useMemo<PartidaIO>(
    () => ({
      mirar: () => {
        const core = coreRef.current;
        if (!core) return null;
        try {
          const ruta = rutaDeEstado(core);
          if (!ruta || !core.saveStateSlot(RANURA_TRATO, 0)) return null;
          const bytes = core.FS.readFile(ruta) as Uint8Array;
          return bytes.length === TAMANO_ESTADO ? bytes : null;
        } catch {
          return null;
        }
      },
      cargar: (bytes) => {
        const core = coreRef.current;
        if (!core) return false;
        try {
          const ruta = rutaDeEstado(core);
          if (!ruta) return false;
          core.FS.writeFile(ruta, bytes);
          return Boolean(core.loadStateSlot(RANURA_TRATO, 0));
        } catch {
          return false;
        }
      },
    }),
    [coreRef],
  );
  return useIntercambioCon(io, romBytes, partida, enviar, escuchar);
};


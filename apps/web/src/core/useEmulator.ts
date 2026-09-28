import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyDefaultKeyBindings,
  loadRomFile,
  SAVESTATE,
  startCore,
  type MgbaModule,
} from './mgbaCore';
import { detectPlatform, type PlatformDescriptor } from './platforms';
import { readRomHeader, type RomHeader } from './romHeader';

export type EmulatorStatus = 'idle' | 'booting' | 'ready' | 'running' | 'paused' | 'error';

export type EmulatorState = {
  status: EmulatorStatus;
  header: RomHeader | null;
  platform: PlatformDescriptor | null;
  romName: string | null;
  error: string | null;
  /** Momento del ultimo guardado del juego en SRAM, para dar senal al jugador. */
  lastSaveAt: number | null;
  fastForward: boolean;
  volume: number;
  log: string[];
};

const MAX_LOG_LINES = 40;
const FAST_FORWARD_MULTIPLIER = 3;

const initialState: EmulatorState = {
  status: 'idle',
  header: null,
  platform: null,
  romName: null,
  error: null,
  lastSaveAt: null,
  fastForward: false,
  volume: 70,
  log: [],
};

export const useEmulator = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreRef = useRef<MgbaModule | null>(null);
  const bootedRef = useRef(false);
  // Guardamos los bytes de la ROM cargada para poder reenviarla al servicio de
  // aleatorizacion sin pedirle al jugador que vuelva a elegir el fichero.
  const romBytesRef = useRef<Uint8Array | null>(null);
  const [state, setState] = useState<EmulatorState>(initialState);

  const appendLog = useCallback((line: string) => {
    setState((prev) => ({ ...prev, log: [...prev.log, line].slice(-MAX_LOG_LINES) }));
  }, []);

  const fail = useCallback((err: unknown) => {
    setState((prev) => ({
      ...prev,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    }));
  }, []);

  // Arrancamos el nucleo en cuanto hay canvas, antes de que el jugador elija ROM,
  // para que el coste de instanciar el wasm ya este pagado cuando la elija.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || bootedRef.current) return;
    bootedRef.current = true;

    let cancelled = false;
    setState((prev) => ({ ...prev, status: 'booting' }));

    startCore(canvas)
      .then((core) => {
        if (cancelled) return;
        coreRef.current = core;
        applyDefaultKeyBindings(core);
        core.setVolume(initialState.volume);

        core.setLogger((entry) => {
          if (entry.level === 'error' || entry.level === 'fatal') {
            appendLog(`[${entry.category}] ${entry.message}`);
          }
        });
        core.addCoreCallbacks({
          coreCrashedCallback: () => {
            fail(new Error('El nucleo del emulador se ha caido.'));
          },
          // Se dispara cuando el JUEGO escribe en la SRAM, es decir cuando el
          // jugador guarda dentro de Pokemon. Es el momento exacto de volcar la
          // partida a IndexedDB para que sobreviva a cerrar la pestana.
          saveDataUpdatedCallback: () => {
            void core.FSSync();
            setState((prev) => ({ ...prev, lastSaveAt: Date.now() }));
          },
        });

        appendLog(`nucleo listo: ${core.version.projectName} ${core.version.projectVersion}`);
        setState((prev) => ({ ...prev, status: 'ready' }));
      })
      .catch((err: unknown) => {
        if (!cancelled) fail(err);
      });

    return () => {
      cancelled = true;
    };
  }, [appendLog, fail]);

  const openRom = useCallback(
    async (file: File) => {
      const core = coreRef.current;
      if (!core) return;

      const platform = detectPlatform(file.name);
      if (!platform) {
        fail(new Error(`No reconozco la extension de "${file.name}".`));
        return;
      }
      if (platform.support !== 'supported') {
        fail(
          new Error(
            `${platform.label} todavia no esta soportado. ${platform.note ?? ''}`.trim(),
          ),
        );
        return;
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      const header = readRomHeader(bytes);
      if (!header.valid) {
        fail(new Error(`"${file.name}" no parece una ROM de GBA: falta el byte fijo de cabecera.`));
        return;
      }

      try {
        await loadRomFile(core, file);
        romBytesRef.current = bytes;
        // Los navegadores bloquean el audio hasta que hay interaccion del usuario;
        // elegir el fichero cuenta como tal, asi que este es el momento valido.
        core.resumeAudio();
        setState((prev) => ({
          ...prev,
          status: 'running',
          header,
          platform,
          romName: file.name,
          error: null,
        }));
      } catch (err) {
        fail(err);
      }
    },
    [fail],
  );

  /**
   * Carga una ROM que no viene de un fichero elegido por el jugador, como la
   * que devuelve el servicio de aleatorizacion.
   */
  const openRomBytes = useCallback(
    async (bytes: Uint8Array, fileName: string) => {
      await openRom(new File([bytes as BlobPart], fileName, { type: 'application/octet-stream' }));
    },
    [openRom],
  );

  const togglePause = useCallback(() => {
    const core = coreRef.current;
    if (!core) return;
    setState((prev) => {
      if (prev.status === 'running') {
        core.pauseGame();
        return { ...prev, status: 'paused' };
      }
      if (prev.status === 'paused') {
        core.resumeGame();
        return { ...prev, status: 'running' };
      }
      return prev;
    });
  }, []);

  const reset = useCallback(() => {
    coreRef.current?.quickReload();
  }, []);

  const saveState = useCallback(
    (slot: number) => {
      const core = coreRef.current;
      if (!core) return;
      // Con captura de pantalla: estos son los savestates manuales del jugador,
      // y la miniatura ayuda a distinguirlos.
      if (core.saveStateSlot(slot, SAVESTATE.ALL)) {
        void core.FSSync();
        appendLog(`estado guardado en la ranura ${slot}`);
      }
    },
    [appendLog],
  );

  const loadState = useCallback(
    (slot: number) => {
      const core = coreRef.current;
      if (!core) return;
      if (core.loadStateSlot(slot, SAVESTATE.ALL)) {
        appendLog(`estado cargado de la ranura ${slot}`);
      } else {
        appendLog(`la ranura ${slot} esta vacia`);
      }
    },
    [appendLog],
  );

  /** Descarga la partida (.sav) para que el jugador tenga su copia fuera del navegador. */
  const downloadSave = useCallback(() => {
    const core = coreRef.current;
    const save = core?.getSave();
    if (!core || !save) {
      appendLog('todavia no hay partida guardada que exportar');
      return;
    }
    const baseName = (core.gameName ?? 'partida').replace(/\.[^.]+$/, '');
    const url = URL.createObjectURL(new Blob([save as BlobPart], { type: 'application/octet-stream' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${baseName}.sav`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [appendLog]);

  /** Importa un .sav existente para continuar una partida empezada en otro emulador. */
  const importSave = useCallback(
    async (file: File) => {
      const core = coreRef.current;
      if (!core) return;
      await new Promise<void>((resolve) => core.uploadSaveOrSaveState(file, resolve));
      await core.FSSync();
      core.quickReload();
      appendLog(`partida importada: ${file.name}`);
    },
    [appendLog],
  );

  const setFastForward = useCallback((enabled: boolean) => {
    const core = coreRef.current;
    if (!core) return;
    core.setFastForwardMultiplier(enabled ? FAST_FORWARD_MULTIPLIER : 1);
    setState((prev) => ({ ...prev, fastForward: enabled }));
  }, []);

  const setVolume = useCallback((percent: number) => {
    coreRef.current?.setVolume(percent);
    setState((prev) => ({ ...prev, volume: percent }));
  }, []);

  return {
    canvasRef,
    coreRef,
    romBytesRef,
    state,
    openRom,
    openRomBytes,
    togglePause,
    reset,
    saveState,
    loadState,
    downloadSave,
    importSave,
    setFastForward,
    setVolume,
  };
};

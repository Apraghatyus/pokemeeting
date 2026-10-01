import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyDefaultKeyBindings,
  loadExistingRom,
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
  /** De donde salio la ROM: elegida por el jugador o generada por nosotros.
   *  Sirve para no volver a preguntar por aleatorizacion tras aleatorizar. */
  romSource: 'usuario' | 'generada' | null;
  error: string | null;
  /** Momento del ultimo guardado del juego en SRAM, para dar senal al jugador. */
  lastSaveAt: number | null;
  fastForward: boolean;
  /** Volumen del juego en porcentaje, de 0 a 200. */
  volume: number;
  /** Volumen al que volver al quitar el silencio. */
  volumeBeforeMute: number;
  log: string[];
};

const MAX_LOG_LINES = 40;

/** El nucleo admite hasta 200%, que amplifica por encima del original. */
export const MAX_VOLUME = 200;

const DEFAULT_VOLUME = 70;

/** Ranura que usa la exportacion, aparte de la que usa el jugador. */
const EXPORT_SLOT = 9;

/**
 * El nucleo quiere un multiplicador (1.0 = 100%), no un porcentaje.
 *
 * Es el fallo que rompia el sonido: se le pasaba el porcentaje tal cual, asi
 * que un 70 pedia un 7000%.
 */
const toMultiplier = (percent: number): number => percent / 100;

/**
 * Borra del sistema de ficheros del nucleo una ROM generada y su partida.
 *
 * Sin esto se van acumulando copias en memoria, y peor: como la siguiente
 * aleatorizacion puede llamarse igual, heredaria el guardado de la anterior,
 * que pertenece a otro juego.
 */
const discardGeneratedRom = (core: MgbaModule, romPath: string | null): void => {
  if (!romPath) return;
  for (const path of [romPath, savePathFor(core, romPath)]) {
    if (!path) continue;
    try {
      if (core.FS.analyzePath(path).exists) core.FS.unlink(path);
    } catch {
      // Si no se puede borrar no es grave: se sobrescribira.
    }
  }
};

/** Ruta del fichero de partida que mGBA asocia a una ROM. */
const savePathFor = (core: MgbaModule, romPath: string): string | null => {
  // Cualquier extension, no solo .gba: ahora tambien se juega a Game Boy Color.
  const name = romPath.split('/').pop()?.replace(/\.[^.]+$/, '.sav');
  return name ? `${core.filePaths().savePath}/${name}` : null;
};

const VOLUME_KEY = 'emupoke.volumen';

/** El volumen sobrevive a recargar la pagina: es una molestia recurrente. */
const rememberVolume = (percent: number): void => {
  try {
    globalThis.localStorage?.setItem(VOLUME_KEY, String(percent));
  } catch {
    // Sin almacenamiento disponible no pasa nada: se usa el valor por defecto.
  }
};

const recallVolume = (fallback: number): number => {
  try {
    const stored = globalThis.localStorage?.getItem(VOLUME_KEY);
    // Comprobar el null ANTES de convertir no es ceremonia: getItem devuelve
    // null cuando no hay nada guardado y Number(null) es 0, que pasa cualquier
    // validacion de rango. Sin esto la aplicacion arrancaba silenciada la
    // primera vez, y como el boton alterna respecto al estado, parecia que
    // silenciar subia el sonido.
    if (stored === null || stored === undefined || stored === '') return fallback;

    const value = Number(stored);
    return Number.isFinite(value) && value >= 0 && value <= MAX_VOLUME ? value : fallback;
  } catch {
    return fallback;
  }
};
const FAST_FORWARD_MULTIPLIER = 3;

const initialState: EmulatorState = {
  status: 'idle',
  header: null,
  platform: null,
  romName: null,
  romSource: null,
  error: null,
  lastSaveAt: null,
  fastForward: false,
  volume: DEFAULT_VOLUME,
  volumeBeforeMute: DEFAULT_VOLUME,
  log: [],
};

export const useEmulator = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreRef = useRef<MgbaModule | null>(null);
  const bootedRef = useRef(false);
  // Guardamos los bytes de la ROM cargada para poder reenviarla al servicio de
  // aleatorizacion sin pedirle al jugador que vuelva a elegir el fichero.
  const romBytesRef = useRef<Uint8Array | null>(null);

  /**
   * La ROM que eligio el jugador, aparte de la que esta corriendo.
   *
   * Son dos cosas distintas y confundirlas era un fallo real: al aleatorizar,
   * la ROM en marcha pasa a ser la generada, y la siguiente aleatorizacion
   * partia de esa en vez de la original. Salian copias encadenadas
   * ("-aleatorizada-aleatorizada") y nunca una partida nueva limpia.
   */
  const baseRomRef = useRef<{ bytes: Uint8Array; fileName: string; crc32: string } | null>(null);

  /** Ruta de la ultima ROM generada, para poder borrarla al hacer otra. */
  const generatedPathRef = useRef<string | null>(null);
  const [state, setState] = useState<EmulatorState>(() => {
    const volume = recallVolume(initialState.volume);
    return { ...initialState, volume, volumeBeforeMute: volume || initialState.volume };
  });

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
        core.setVolume(toMultiplier(recallVolume(initialState.volume)));

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
    async (file: File, source: 'usuario' | 'generada' = 'usuario') => {
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
        fail(new Error(`"${file.name}" no parece una ROM de Game Boy ni de GBA: su cabecera no cuadra.`));
        return;
      }

      try {
        // La copia anterior se descarta al cambiar de ROM, pero SOLO cuando el
        // nucleo ya la ha cerrado: borrarle el fichero mientras lo tiene
        // abierto es pedir problemas. De eso se encarga el gancho.
        // Cada copia generada estrena su propio nombre, asi que no hay nada
        // que descartar: no puede heredar el guardado de otra.
        const loaded = await loadRomFile(core, file);
        romBytesRef.current = bytes;

        if (source === 'usuario') {
          baseRomRef.current = { bytes, fileName: file.name, crc32: header.crc32 };
        }
        generatedPathRef.current = source === 'generada' ? loaded.romPath : null;
        // Persistir en IndexedDB para que la copia sobreviva a recargar.
        if (source === 'generada') void core.FSSync();

        // Los navegadores bloquean el audio hasta que hay interaccion del usuario;
        // elegir el fichero cuenta como tal, asi que este es el momento valido.
        core.resumeAudio();
        setState((prev) => ({
          ...prev,
          status: 'running',
          header,
          platform,
          romName: file.name,
          romSource: source,
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
      await openRom(
        new File([bytes as BlobPart], fileName, { type: 'application/octet-stream' }),
        'generada',
      );
    },
    [openRom],
  );

  /**
   * Continua una partida guardada.
   *
   * No se vuelve a subir nada: la ROM y su guardado ya estan en el sistema de
   * ficheros del nucleo, persistidos desde la sesion en que se crearon.
   */
  const openSavedGame = useCallback(
    async (fileName: string) => {
      const core = coreRef.current;
      if (!core) return;

      const romPath = `${core.filePaths().gamePath}/${fileName}`;
      try {
        if (!core.FS.analyzePath(romPath).exists) {
          throw new Error(`Ya no esta el fichero de esa partida ("${fileName}").`);
        }
        const bytes = core.FS.readFile(romPath);
        const header = readRomHeader(bytes);

        await loadExistingRom(core, romPath);
        core.resumeAudio();
        romBytesRef.current = bytes;
        generatedPathRef.current = romPath;
        setState((prev) => ({
          ...prev,
          status: 'running',
          header,
          platform: detectPlatform(fileName),
          romName: fileName,
          romSource: 'generada',
          error: null,
        }));
      } catch (err) {
        fail(err);
      }
    },
    [fail],
  );

  /**
   * Si la copia de una partida guardada sigue en este navegador.
   *
   * El navegador puede haber tirado los datos para hacer sitio, o el jugador
   * puede estar en otro ordenador. En ese caso la partida no se abre: se
   * rehace desde su semilla, que para eso se guarda.
   */
  const existeGuardada = useCallback((fileName: string): boolean => {
    const core = coreRef.current;
    if (!core) return false;
    return core.FS.analyzePath(`${core.filePaths().gamePath}/${fileName}`).exists;
  }, []);

  /**
   * El fichero de guardado de una partida, para poder llevarselo.
   *
   * Devuelve null si esa partida todavia no ha guardado nunca: el juego solo
   * escribe su guardado cuando el jugador guarda desde su menu.
   */
  const leerGuardado = useCallback((fichero: string): Uint8Array | null => {
    const core = coreRef.current;
    if (!core) return null;
    const ruta = savePathFor(core, fichero);
    try {
      if (!ruta || !core.FS.analyzePath(ruta).exists) return null;
      const bytes = core.FS.readFile(ruta) as Uint8Array;
      // Un guardado recien creado puede estar entero a ceros; eso no es una
      // partida, es un hueco, y llevarselo a otro aparato no sirve de nada.
      return bytes.some((b) => b !== 0) ? bytes : null;
    } catch {
      return null;
    }
  }, []);

  /** Mete un guardado traido de fuera en la partida que le corresponde. */
  const escribirGuardado = useCallback(async (fichero: string, bytes: Uint8Array) => {
    const core = coreRef.current;
    if (!core) return;
    const ruta = savePathFor(core, fichero);
    if (!ruta) return;
    core.FS.writeFile(ruta, bytes);
    // Este si se persiste: es la partida de alguien.
    await core.FSSync();
  }, []);

  /** Borra una partida guardada: su ROM y su fichero de guardado. */
  const deleteSavedGame = useCallback((fileName: string) => {
    const core = coreRef.current;
    if (!core) return;
    discardGeneratedRom(core, `${core.filePaths().gamePath}/${fileName}`);
    void core.FSSync();
  }, []);

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

    // Una partida en blanco son todo ceros, y exportarla confunde mucho: el
    // fichero parece correcto y esta vacio. Solo se escribe al guardar DENTRO
    // del juego, no basta con haber jugado.
    if (save.every((byte) => byte === 0)) {
      fail(
        new Error(
          'Tu partida esta vacia: el juego solo la escribe al guardar desde su menu. Guarda dentro del juego y vuelve a exportar.',
        ),
      );
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

  /**
   * Descarga el estado completo del emulador.
   *
   * A diferencia del .sav, esto captura la memoria viva: sirve aunque no se
   * haya guardado dentro del juego. Es ademas de donde saldran los datos para
   * los intercambios, asi que poder sacarlo a un fichero hace falta para
   * poder trabajar con partidas reales.
   */
  const exportState = useCallback(() => {
    const core = coreRef.current;
    if (!core?.gameName) {
      appendLog('no hay ningun juego cargado');
      return;
    }

    // Sin banderas: la estructura cruda, sin captura de pantalla. Son los
    // 0x61000 bytes que sabemos interpretar.
    if (!core.saveStateSlot(EXPORT_SLOT, 0)) {
      fail(new Error('mGBA no pudo guardar el estado.'));
      return;
    }

    const base = core.gameName.split('/').pop()?.replace(/\.gba$/i, '') ?? 'partida';
    const ruta = `${core.filePaths().saveStatePath}/${base}.ss${EXPORT_SLOT}`;
    try {
      const bytes = core.FS.readFile(ruta);
      const url = URL.createObjectURL(
        new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${base}.estado.bin`;
      anchor.click();
      URL.revokeObjectURL(url);
      appendLog(`estado exportado: ${bytes.length} bytes`);
    } catch (err) {
      fail(err);
    }
  }, [appendLog, fail]);

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
    const clamped = Math.min(Math.max(percent, 0), MAX_VOLUME);
    coreRef.current?.setVolume(toMultiplier(clamped));
    setState((prev) => ({
      ...prev,
      volume: clamped,
      // Solo se recuerda un nivel audible: si no, quitar el silencio devolveria
      // al silencio.
      volumeBeforeMute: clamped > 0 ? clamped : prev.volumeBeforeMute,
    }));
    rememberVolume(clamped);
  }, []);

  /**
   * Silencia el juego y devuelve el volumen anterior al quitarlo.
   *
   * El calculo va FUERA del actualizador de estado, y no es un detalle de
   * estilo. Un actualizador de React tiene que ser puro porque puede
   * ejecutarse mas de una vez; al tener dentro la llamada al nucleo, cada
   * ejecucion extra volvia a alternar el silencio y el efecto acababa
   * invertido: silenciar subia el sonido y quitar el silencio lo apagaba. El
   * estado que se mostraba era correcto, que es lo que lo hacia dificil de ver.
   */
  const toggleMute = useCallback(() => {
    setVolume(state.volume > 0 ? 0 : state.volumeBeforeMute || DEFAULT_VOLUME);
  }, [setVolume, state.volume, state.volumeBeforeMute]);

  /**
   * Vuelve al principio para poder elegir otra ROM.
   *
   * Antes no habia forma de cambiar de juego sin recargar la pagina.
   */
  const closeRom = useCallback(() => {
    const core = coreRef.current;
    if (core) {
      discardGeneratedRom(core, generatedPathRef.current);
      core.quitGame();
    }
    generatedPathRef.current = null;
    baseRomRef.current = null;
    romBytesRef.current = null;
    setState((prev) => ({
      ...prev,
      status: 'ready',
      header: null,
      platform: null,
      romName: null,
      romSource: null,
      lastSaveAt: null,
      error: null,
    }));
  }, []);

  return {
    canvasRef,
    coreRef,
    romBytesRef,
    baseRomRef,
    closeRom,
    openSavedGame,
    existeGuardada,
    leerGuardado,
    escribirGuardado,
    deleteSavedGame,
    state,
    openRom,
    openRomBytes,
    togglePause,
    reset,
    saveState,
    loadState,
    downloadSave,
    exportState,
    importSave,
    setFastForward,
    setVolume,
    toggleMute,
  };
};

// Envoltorio sobre mGBA-wasm.
//
// El nucleo se carga por URL (/mgba/mgba.js) y no por import, asi que sus tipos
// no llegan solos. Declaramos aqui la superficie que realmente usamos: si algun
// dia crece, este es el unico sitio que hay que tocar.

export type MgbaFilePaths = {
  root: string;
  gamePath: string;
  savePath: string;
  saveStatePath: string;
  screenshotsPath: string;
};

export type MgbaCoreCallbacks = {
  coreCrashedCallback?: (() => void) | null;
  saveDataUpdatedCallback?: (() => void) | null;
  videoFrameEndedCallback?: (() => void) | null;
};

/** Sistema de ficheros de Emscripten, recortado a lo que usamos. */
type EmscriptenFS = {
  readFile(path: string, opts?: { encoding?: 'binary' | 'utf8' }): Uint8Array;
  writeFile(path: string, data: Uint8Array | string): void;
  unlink(path: string): void;
  readdir(path: string): string[];
  analyzePath(path: string): { exists: boolean };
};

export type MgbaModule = {
  FSInit(): Promise<void>;
  FSSync(): Promise<void>;
  filePaths(): MgbaFilePaths;
  uploadRom(file: File, callback?: () => void): void;
  uploadSaveOrSaveState(file: File, callback?: () => void): void;
  loadGame(romPath: string, savePathOverride?: string): boolean;
  getSave(): Uint8Array | null;
  saveStateSlot(slot: number, flags?: number): boolean;
  loadStateSlot(slot: number, flags?: number): boolean;
  pauseGame(): void;
  resumeGame(): void;
  quitGame(): void;
  buttonPress(name: string): void;
  buttonUnpress(name: string): void;
  toggleInput(enabled: boolean): void;
  /**
   * Volumen como **multiplicador**, no como porcentaje: 1.0 es el 100% y el
   * maximo util es 2.0. Pasarle 70 creyendo que son "70%" pide un 7000% y el
   * sonido sale roto, que es exactamente lo que pasaba.
   */
  setVolume(multiplier: number): void;
  getVolume(): number;
  resumeAudio(): void;
  addCoreCallbacks(callbacks: MgbaCoreCallbacks): void;
  quickReload(): void;
  setFastForwardMultiplier(multiplier: number): void;
  getFastForwardMultiplier(): number;
  bindKey(bindingName: string, inputName: string): void;
  setLogger(callback: ((entry: { level: string; category: string; message: string }) => void) | null): void;
  version: { projectName: string; projectVersion: string };
  gameName?: string;
  saveName?: string;
  FS: EmscriptenFS;
  /** Salida de audio de SDL. Se usa para comprobar que suena de verdad. */
  SDL2?: {
    audio?: { currentOutputBuffer?: AudioBuffer; scriptProcessorNode?: ScriptProcessorNode };
    audioContext?: AudioContext;
  };
};

type MgbaFactory = (options: { canvas: HTMLCanvasElement }) => Promise<MgbaModule>;

/**
 * Banderas de saveStateSlot / loadStateSlot (mGBA `SAVESTATE_*`).
 * Excluimos la captura de pantalla: no la necesitamos y engorda el fichero,
 * que vamos a leer muchas veces para inspeccionar la memoria del juego.
 */
export const SAVESTATE = {
  SCREENSHOT: 1,
  SAVEDATA: 2,
  CHEATS: 4,
  RTC: 8,
  METADATA: 16,
  ALL: 31,
  /** Estado de la maquina, sin captura: lo minimo para leer la RAM. */
  MEMORY_ONLY: 16,
} as const;

/** Donde sync-core.mjs deja el nucleo, servido por Vite desde public/. */
const CORE_URL = '/mgba/mgba.js';

/**
 * Import dinamico opaco al empaquetador.
 *
 * Si se escribe `import(ruta)` dentro de un modulo, Vite lo reconoce, le anade
 * `?import` y trata de transformarlo. Como el nucleo vive en public/ (y debe
 * vivir ahi, para que localice su .wasm y se relance como worker de pthreads),
 * esa transformacion falla con un 500. Construyendo el import dentro de una
 * `Function` el empaquetador no lo ve y el navegador pide la URL tal cual.
 */
const importAtRuntime: (url: string) => Promise<unknown> = new Function(
  'url',
  'return import(url);',
) as (url: string) => Promise<unknown>;

let factory: MgbaFactory | null = null;

/** Carga el modulo del nucleo una sola vez y lo memoriza. */
const loadFactory = async (): Promise<MgbaFactory> => {
  if (factory) return factory;
  const mod = (await importAtRuntime(CORE_URL)) as { default: MgbaFactory };
  factory = mod.default;
  return factory;
};

export class CoreUnavailableError extends Error {}

/**
 * Arranca el nucleo sobre un canvas ya montado en el DOM.
 * Debe llamarse una sola vez por canvas.
 */
export const startCore = async (canvas: HTMLCanvasElement): Promise<MgbaModule> => {
  if (!globalThis.crossOriginIsolated) {
    throw new CoreUnavailableError(
      'El nucleo necesita aislamiento cross-origin (COOP/COEP) para usar SharedArrayBuffer. ' +
        'Comprueba las cabeceras del servidor.',
    );
  }
  const create = await loadFactory();
  const core = await create({ canvas });
  // Monta IndexedDB y recupera los ficheros persistidos de sesiones anteriores.
  await core.FSInit();

  // En desarrollo dejamos el nucleo a mano. Sirve para depurar y, sobre todo,
  // para poder comprobar el sonido: la unica forma de verificarlo sin oirlo es
  // mirar el bufer de salida que mGBA expone en SDL2.audio.
  if (import.meta.env.DEV) {
    (globalThis as unknown as { mGBAModule?: MgbaModule }).mGBAModule = core;
  }

  return core;
};

export type LoadedRom = {
  /** Ruta del fichero dentro del sistema de ficheros virtual del nucleo. */
  romPath: string;
  fileName: string;
};

/**
 * Sube una ROM al FS virtual y la arranca.
 * El fichero nunca sale del navegador del jugador.
 */
export const loadRomFile = async (core: MgbaModule, file: File): Promise<LoadedRom> => {
  // Si ya hay un juego corriendo hay que cerrarlo antes, y darle un respiro.
  //
  // Cargar una ROM encima de otra que todavia se esta inicializando revienta
  // el nucleo con "memory access out of bounds", y no es un caso raro: pasa
  // justo al aleatorizar, porque el juego original lleva un segundo corriendo
  // cuando llega su sustituto.
  if (core.gameName) {
    core.quitGame();
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  await new Promise<void>((resolve) => core.uploadRom(file, resolve));
  const romPath = `${core.filePaths().gamePath}/${file.name}`;
  if (!core.loadGame(romPath)) {
    throw new Error(`mGBA no pudo arrancar "${file.name}". Puede estar corrupta o no ser una ROM de GBA.`);
  }
  return { romPath, fileName: file.name };
};

/**
 * Mapeo de teclado por defecto: nombre de tecla SDL -> entrada de GBA.
 * mGBA gestiona el teclado por su cuenta via SDL; fijamos los enlaces de forma
 * explicita para que el control no dependa de los valores por defecto del nucleo.
 */
export const DEFAULT_KEY_BINDINGS: readonly (readonly [sdlKey: string, gbaInput: string])[] = [
  ['Up', 'Up'],
  ['Down', 'Down'],
  ['Left', 'Left'],
  ['Right', 'Right'],
  ['X', 'A'],
  ['Z', 'B'],
  ['A', 'L'],
  ['S', 'R'],
  ['Return', 'Start'],
  ['Backspace', 'Select'],
];

export const applyDefaultKeyBindings = (core: MgbaModule): void => {
  for (const [sdlKey, gbaInput] of DEFAULT_KEY_BINDINGS) {
    core.bindKey(sdlKey, gbaInput);
  }
};

/** Lee la partida (SRAM) actual para exportarla como fichero .sav. */
export const exportSave = (core: MgbaModule): Uint8Array | null => core.getSave();

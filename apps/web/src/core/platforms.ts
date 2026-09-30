// Registro de plataformas.
//
// Anadir una consola es rellenar una entrada y, si hace falta, escribir su
// adaptador; no reescribir la aplicacion.
//
// Nota sobre el reparto de trabajo real:
//   - GBA / GBC / GB: el MISMO nucleo mGBA los emula los tres. Comprobado
//     cargando una ROM de Game Boy Color escrita a mano (test-gbc.mjs).
//   - NDS: necesita otro nucleo (melonDS a wasm), que ademas es GPL-3 y pide
//     BIOS del usuario. Trabajo aparte, viable pero no barato.
//   - 3DS: hoy no es realista en navegador. Queda listado para no perderlo de
//     vista, pero no lo damos por planificado.

export type PlatformId = 'gba' | 'gbc' | 'gb' | 'nds' | '3ds';

export type PlatformSupport =
  /** Funciona ahora. */
  | 'supported'
  /** El nucleo existe y esta al alcance. */
  | 'planned'
  /** Sin via realista a corto plazo. */
  | 'research';

export type PlatformDescriptor = {
  id: PlatformId;
  label: string;
  /** Extensiones de fichero, en minusculas y con punto. */
  extensions: readonly string[];
  support: PlatformSupport;
  /** Nucleo que la ejecuta, o null si aun no hay ninguno. */
  core: 'mgba' | 'melonds' | null;
  /** Resolucion nativa de cada pantalla. NDS y 3DS tienen dos. */
  screens: readonly { width: number; height: number }[];
  note?: string;
};

export const PLATFORMS: readonly PlatformDescriptor[] = [
  {
    id: 'gba',
    label: 'Game Boy Advance',
    extensions: ['.gba'],
    support: 'supported',
    core: 'mgba',
    screens: [{ width: 240, height: 160 }],
  },
  {
    id: 'gbc',
    label: 'Game Boy Color',
    extensions: ['.gbc'],
    support: 'supported',
    core: 'mgba',
    screens: [{ width: 160, height: 144 }],
    note: 'Se juega y se aleatoriza. Los intercambios todavia no: la memoria de segunda generacion se guarda de otra forma.',
  },
  {
    id: 'gb',
    label: 'Game Boy',
    extensions: ['.gb'],
    support: 'supported',
    core: 'mgba',
    screens: [{ width: 160, height: 144 }],
    note: 'Se juega, pero el randomizer solo trae Rojo, Azul, Verde y Amarillo, y de primera generacion aqui no se lee la memoria.',
  },
  {
    id: 'nds',
    label: 'Nintendo DS',
    extensions: ['.nds'],
    support: 'planned',
    core: null,
    screens: [
      { width: 256, height: 192 },
      { width: 256, height: 192 },
    ],
    note: 'Requiere integrar melonDS compilado a wasm. Dos pantallas y tactil cambian la interfaz.',
  },
  {
    id: '3ds',
    label: 'Nintendo 3DS',
    extensions: ['.3ds', '.cia'],
    support: 'research',
    core: null,
    screens: [
      { width: 400, height: 240 },
      { width: 320, height: 240 },
    ],
    note: 'Sin nucleo wasm viable hoy. Listado para no perderlo de vista, no planificado.',
  },
];

export const platformById = (id: PlatformId): PlatformDescriptor =>
  PLATFORMS.find((p) => p.id === id)!;

/** Deduce la plataforma por la extension del fichero. null si no la reconocemos. */
export const detectPlatform = (fileName: string): PlatformDescriptor | null => {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = fileName.slice(dot).toLowerCase();
  return PLATFORMS.find((p) => p.extensions.includes(ext)) ?? null;
};

/** Para el atributo accept del selector de ficheros: solo lo que funciona hoy. */
export const acceptedExtensions = (): string =>
  PLATFORMS.filter((p) => p.support === 'supported')
    .flatMap((p) => p.extensions)
    .join(',');

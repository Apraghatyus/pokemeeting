// Registro de plataformas.
//
// Hoy solo GBA esta implementado, pero la interfaz existe para que anadir una
// consola sea rellenar una entrada y escribir su adaptador, no reescribir la app.
//
// Nota sobre el reparto de trabajo real:
//   - GB / GBC: el MISMO nucleo mGBA ya los emula. Falta poco mas que activarlos.
//   - NDS:      necesita otro nucleo (melonDS a wasm). Trabajo aparte, viable.
//   - 3DS:      hoy no es realista en navegador. Queda listado para no perderlo
//               de vista, pero no lo damos por planificado.

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
    support: 'planned',
    core: 'mgba',
    screens: [{ width: 160, height: 144 }],
    note: 'El nucleo mGBA ya lo soporta; falta el perfil de memoria de los juegos de Gen 2.',
  },
  {
    id: 'gb',
    label: 'Game Boy',
    extensions: ['.gb'],
    support: 'planned',
    core: 'mgba',
    screens: [{ width: 160, height: 144 }],
    note: 'Igual que GBC. Gen 1 tiene estructuras de datos distintas a Gen 3.',
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

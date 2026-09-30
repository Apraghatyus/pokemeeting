// Que juego es una ROM, a partir de su codigo de cabecera.
//
// La clave, y es facil equivocarse aqui: el codigo de 4 letras NO identifica el
// juego entero. Las tres primeras son el juego y la cuarta es el idioma.
//
//   BPRE -> B  = cartucho de GBA
//           PR = Pokemon FireRed
//           E  = ingles
//
// Asi que BPRE y BPRS son el MISMO juego en ingles y en espanol, y BPGE es
// LeafGreen, un juego distinto pero de la misma familia. Tratar el codigo como
// un bloque hace que dos jugadores con Rojo Fuego y Verde Hoja parezcan
// incompatibles cuando en realidad son la pareja de versiones de siempre.
//
// Game Boy Color sigue la misma norma, con el codigo en otro sitio de la
// cabecera: AAUS es Oro en espanol y AAUE el mismo juego en ingles. Los
// cartuchos anteriores a Game Boy Color no llevan codigo, pero de esos aqui no
// hay ningun juego de Pokemon que nos interese.

/** Identificador de juego: las tres primeras letras del codigo de cabecera. */
export type JuegoId =
  // Segunda generacion, Game Boy Color
  | 'AAU'
  | 'AAX'
  | 'BYT'
  | 'BXT'
  // Tercera generacion, Game Boy Advance
  | 'BPR'
  | 'BPG'
  | 'AXV'
  | 'AXP'
  | 'BPE';

export type Generacion = 2 | 3;

export type Juego = {
  id: JuegoId;
  /** Nombre en espanol, para la interfaz. */
  label: string;
  generacion: Generacion;
  /** En que consola corre. Las dos las emula el mismo nucleo. */
  consola: 'gbc' | 'gba';
  /** Pareja de version natural, si la tiene. */
  sibling?: JuegoId;
  /**
   * Si hemos arrancado este juego de verdad en el emulador.
   *
   * Todos los de una misma generacion comparten la estructura de datos, asi
   * que en teoria valen todos. Pero "en teoria" no es lo mismo que comprobado,
   * y en un intercambio lo que esta en juego es la partida de alguien. La
   * interfaz avisa cuando se carga uno que no lo esta.
   */
  tested: boolean;
};

export const JUEGOS: Readonly<Record<JuegoId, Juego>> = {
  // --- segunda generacion ---
  AAU: { id: 'AAU', label: 'Oro', generacion: 2, consola: 'gbc', sibling: 'AAX', tested: false },
  AAX: { id: 'AAX', label: 'Plata', generacion: 2, consola: 'gbc', sibling: 'AAU', tested: false },
  BYT: { id: 'BYT', label: 'Cristal', generacion: 2, consola: 'gbc', tested: false },
  // La edicion japonesa de Cristal usa otro codigo de juego, no solo otra
  // cuarta letra. Es la unica excepcion a la norma en todo el catalogo.
  BXT: { id: 'BXT', label: 'Cristal', generacion: 2, consola: 'gbc', tested: false },

  // --- tercera generacion ---
  // Rojo Fuego y Verde Hoja: comprobados arrancando las ediciones espanolas.
  BPR: { id: 'BPR', label: 'Rojo Fuego', generacion: 3, consola: 'gba', sibling: 'BPG', tested: true },
  BPG: { id: 'BPG', label: 'Verde Hoja', generacion: 3, consola: 'gba', sibling: 'BPR', tested: true },
  AXV: { id: 'AXV', label: 'Rubi', generacion: 3, consola: 'gba', sibling: 'AXP', tested: false },
  AXP: { id: 'AXP', label: 'Zafiro', generacion: 3, consola: 'gba', sibling: 'AXV', tested: false },
  BPE: { id: 'BPE', label: 'Esmeralda', generacion: 3, consola: 'gba', tested: false },
};

/**
 * Cuarta letra del codigo: region o idioma.
 *
 * Importa para los intercambios porque el byte de idioma viaja dentro del
 * Pokemon y el juego lo usa al mostrar el mote.
 */
export const LANGUAGES: Readonly<Record<string, string>> = {
  E: 'ingles',
  S: 'espanol',
  F: 'frances',
  D: 'aleman',
  I: 'italiano',
  J: 'japones',
  P: 'europeo',
};

export type ParsedGameCode = {
  /** Codigo completo tal cual venia. */
  raw: string;
  /** Las tres primeras letras. */
  gameId: string;
  /** La cuarta letra. */
  languageCode: string;
  /** El juego, si lo reconocemos. */
  game: Juego | null;
  /** Nombre del idioma, si lo reconocemos. */
  language: string | null;
};

export const parseGameCode = (code: string): ParsedGameCode => {
  const raw = code.toUpperCase().trim();
  const gameId = raw.slice(0, 3);
  const languageCode = raw.slice(3, 4);
  return {
    raw,
    gameId,
    languageCode,
    game: JUEGOS[gameId as JuegoId] ?? null,
    language: LANGUAGES[languageCode] ?? null,
  };
};

/** Nombre legible de una ROM: "Rojo Fuego (espanol)" o el codigo si no la conocemos. */
export const describeGame = (code: string): string => {
  const parsed = parseGameCode(code);
  if (!parsed.game) return parsed.raw;
  return parsed.language ? `${parsed.game.label} (${parsed.language})` : parsed.game.label;
};

/** Los juegos de una generacion, para declarar alcances sin repetir listas. */
export const juegosDe = (generacion: Generacion): Juego[] =>
  Object.values(JUEGOS).filter((juego) => juego.generacion === generacion);

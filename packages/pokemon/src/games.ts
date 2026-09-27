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

/** Identificador de juego: las tres primeras letras del codigo de cabecera. */
export type Gen3GameId = 'BPR' | 'BPG' | 'AXV' | 'AXP' | 'BPE';

export type Gen3Game = {
  id: Gen3GameId;
  /** Nombre en espanol, para la interfaz. */
  label: string;
  /** Pareja de version natural, si la tiene. */
  sibling?: Gen3GameId;
  /**
   * Si hemos arrancado este juego de verdad en el emulador.
   *
   * Todos comparten la estructura de datos de tercera generacion, asi que en
   * teoria valen todos. Pero "en teoria" no es lo mismo que comprobado, y en
   * un intercambio lo que esta en juego es la partida de alguien.
   */
  tested: boolean;
};

export const GEN3_GAMES: Readonly<Record<Gen3GameId, Gen3Game>> = {
  // Rojo Fuego y Verde Hoja: comprobados arrancando las ediciones espanolas.
  BPR: { id: 'BPR', label: 'Rojo Fuego', sibling: 'BPG', tested: true },
  BPG: { id: 'BPG', label: 'Verde Hoja', sibling: 'BPR', tested: true },
  AXV: { id: 'AXV', label: 'Rubi', sibling: 'AXP', tested: false },
  AXP: { id: 'AXP', label: 'Zafiro', sibling: 'AXV', tested: false },
  BPE: { id: 'BPE', label: 'Esmeralda', tested: false },
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
  /** El juego, si lo reconocemos como de tercera generacion. */
  game: Gen3Game | null;
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
    game: GEN3_GAMES[gameId as Gen3GameId] ?? null,
    language: LANGUAGES[languageCode] ?? null,
  };
};

/** Nombre legible de una ROM: "Rojo Fuego (espanol)" o el codigo si no la conocemos. */
export const describeGame = (code: string): string => {
  const parsed = parseGameCode(code);
  if (!parsed.game) return parsed.raw;
  return parsed.language ? `${parsed.game.label} (${parsed.language})` : parsed.game.label;
};

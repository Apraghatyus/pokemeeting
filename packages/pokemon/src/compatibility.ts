import type { RomFingerprint } from '@emupoke/protocol';
import { describeGame, parseGameCode } from './games';

/**
 * Compatibilidad entre las ROMs de los dos jugadores.
 *
 * La regla es deliberadamente simple: **el mismo juego y el mismo idioma**.
 *
 * Tecnicamente se podria ser mas permisivo, porque todos los juegos de tercera
 * generacion comparten la estructura de datos y Rojo Fuego con Verde Hoja es la
 * pareja de versiones de siempre. Pero cada permiso extra trae su propia lista
 * de matices que explicar al jugador, y no compensa. Exigir la misma edicion
 * hace que una sala solo pueda fallar por un motivo, y ese motivo se entiende
 * leyendolo una vez.
 *
 * Lo que si se permite es que las copias sean distintas: es justo el caso de
 * dos aleatorizaciones, que es como se juega esto.
 */

export type CompatibilityLevel =
  /** La misma copia byte a byte. */
  | 'identica'
  /** Misma edicion, copias distintas. Tipicamente dos aleatorizaciones. */
  | 'compatible'
  /** No se puede compartir sala. */
  | 'bloqueo';

export type RomCompatibility = {
  level: CompatibilityLevel;
  canPlayTogether: boolean;
  canTrade: boolean;
  /** Frase corta para la interfaz. */
  headline: string;
  /** Matices que conviene que el jugador conozca. */
  notes: string[];
};

const blocked = (headline: string, ...notes: string[]): RomCompatibility => ({
  level: 'bloqueo',
  canPlayTogether: false,
  canTrade: false,
  headline,
  notes,
});

export const compareRoms = (mine: RomFingerprint, theirs: RomFingerprint): RomCompatibility => {
  const a = parseGameCode(mine.gameCode);
  const b = parseGameCode(theirs.gameCode);

  // --- alguna no es un juego de Pokemon de GBA que conozcamos ---
  if (!a.game || !b.game) {
    const unknown = !a.game ? mine : theirs;
    return blocked(
      'Esa ROM no es un juego de Pokemon de GBA reconocido.',
      `No reconozco "${unknown.gameCode}" (${unknown.fileName}).`,
    );
  }

  // --- juegos distintos ---
  if (a.gameId !== b.gameId) {
    return blocked(
      `Teneis juegos distintos: ${a.game.label} y ${b.game.label}.`,
      'Para jugar juntos los dos teneis que usar el mismo juego.',
    );
  }

  // --- mismo juego, idiomas distintos ---
  if (a.languageCode !== b.languageCode) {
    return blocked(
      `Los dos jugais a ${a.game.label}, pero en idiomas distintos.`,
      `Tu copia esta en ${a.language ?? a.languageCode} y la suya en ${b.language ?? b.languageCode}.`,
      'Hace falta la misma edicion: mismo juego y mismo idioma.',
    );
  }

  // --- misma edicion: adelante ---
  if (mine.crc32 === theirs.crc32) {
    return {
      level: 'identica',
      canPlayTogether: true,
      canTrade: true,
      headline: `Los dos jugais a ${describeGame(mine.gameCode)}, la misma copia.`,
      notes: [],
    };
  }

  const notes = [
    'Misma edicion pero copias distintas: es lo esperado si cada uno randomiza la suya.',
    // Comprobado generando dos copias aleatorizadas de la misma ROM: la tabla
    // de nombres queda identica en las dos. Lo que el randomizer cambia son
    // los datos de cada especie, no como se llama.
    'Al estar randomizadas por separado, un Pokemon intercambiado llega con su nombre intacto, pero con las estadisticas, el tipo y la habilidad que tenga esa especie en la ROM que lo recibe.',
  ];

  if (mine.version !== theirs.version) {
    notes.push(
      `Ademas las revisiones del juego no coinciden (${mine.version} y ${theirs.version}).`,
    );
  }

  return {
    level: 'compatible',
    canPlayTogether: true,
    canTrade: true,
    headline: `Los dos jugais a ${describeGame(mine.gameCode)}.`,
    notes,
  };
};

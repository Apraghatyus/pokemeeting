import type { RomFingerprint } from '@emupoke/protocol';
import { describeGame, parseGameCode } from './games';

/**
 * Compatibilidad entre las ROMs de los dos jugadores.
 *
 * La idea central es que la compatibilidad **no es una sola cosa**. Ver la
 * pantalla del companero no exige nada: son dos emuladores independientes y un
 * video. Intercambiar Pokemon si exige que los dos juegos compartan la
 * estructura de datos de tercera generacion.
 *
 * Por eso esto no devuelve "si o no" sino que dice que se puede hacer con cada
 * pareja de ROMs, y deja que la interfaz lo explique.
 */

export type CompatibilityLevel =
  /** La misma copia byte a byte. */
  | 'identica'
  /** Juegos de Gen 3: se puede jugar junto e intercambiar. */
  | 'compatible'
  /** Se puede acompanar, pero no intercambiar. */
  | 'limitada';

export type RomCompatibility = {
  level: CompatibilityLevel;
  /** Siempre true: dos emuladores independientes no necesitan nada en comun. */
  canPlayTogether: boolean;
  /** Requiere que las dos ROMs sean juegos de tercera generacion. */
  canTrade: boolean;
  /** Frase corta para la interfaz. */
  headline: string;
  /** Matices que conviene que el jugador conozca antes de intercambiar. */
  notes: string[];
};

export const compareRoms = (mine: RomFingerprint, theirs: RomFingerprint): RomCompatibility => {
  const a = parseGameCode(mine.gameCode);
  const b = parseGameCode(theirs.gameCode);
  const notes: string[] = [];

  // --- ni siquiera son los dos juegos de tercera generacion ---
  if (!a.game || !b.game) {
    const unknown = !a.game ? mine : theirs;
    return {
      level: 'limitada',
      canPlayTogether: true,
      canTrade: false,
      headline: `Podeis acompanaros, pero no intercambiar.`,
      notes: [
        `No reconozco "${unknown.gameCode}" como un juego de Pokemon de GBA, asi que no se donde vive su equipo en memoria.`,
        'Ver la partida del otro funciona igual: son dos emuladores independientes.',
      ],
    };
  }

  // --- exactamente la misma copia ---
  if (mine.gameCode === theirs.gameCode && mine.crc32 === theirs.crc32) {
    return {
      level: 'identica',
      canPlayTogether: true,
      canTrade: true,
      headline: `Los dos jugais a ${describeGame(mine.gameCode)}, la misma copia.`,
      notes: [],
    };
  }

  // --- los dos son Gen 3: se puede intercambiar, con matices ---
  if (a.gameId !== b.gameId) {
    const pair = a.game.sibling === b.game.id;
    notes.push(
      pair
        ? `${a.game.label} y ${b.game.label} son la pareja de versiones de siempre: los intercambios entre ellas son justo para lo que existen.`
        : `Son juegos distintos (${a.game.label} y ${b.game.label}), pero comparten la estructura de datos de tercera generacion, asi que se pueden intercambiar.`,
    );
  }

  if (a.languageCode !== b.languageCode) {
    notes.push(
      `Jugais en idiomas distintos (${a.language ?? a.languageCode} y ${b.language ?? b.languageCode}). El mote viaja tal cual; el nombre de la especie lo pone cada juego en su idioma.`,
    );
  }

  // Ojo con el razonamiento aqui. Que el CRC difiera no significa que las
  // tablas de datos difieran: Rojo Fuego y Verde Hoja son ficheros distintos y
  // comparten exactamente las mismas especies. Lo que delata una modificacion
  // es un CRC distinto en el MISMO juego, misma revision y mismo idioma.
  const sameEdition =
    a.gameId === b.gameId &&
    a.languageCode === b.languageCode &&
    mine.version === theirs.version;

  if (sameEdition && mine.crc32 !== theirs.crc32) {
    notes.push(
      'Misma edicion pero copias distintas: al menos una esta modificada, seguramente randomizada.',
    );
    notes.push(
      'Con aleatorizaciones distintas un Pokemon puede llegar convertido en otra especie: lo que viaja es el numero de especie, y que especie es ese numero lo decide cada ROM.',
    );
  } else if (mine.crc32 !== theirs.crc32) {
    // Aqui no podemos saberlo solo por la cabecera, asi que no lo afirmamos.
    notes.push(
      'Si alguna de las dos copias esta randomizada, un Pokemon puede llegar convertido en otra especie: lo que viaja es el numero de especie, no la criatura.',
    );
  }

  if (mine.version !== theirs.version) {
    notes.push(
      `Revisiones distintas del juego (${mine.version} y ${theirs.version}). No impide nada: el equipo se localiza en memoria por su firma, no por una direccion fija.`,
    );
  }

  for (const game of [a.game, b.game]) {
    if (!game.tested) {
      notes.push(
        `${game.label} todavia no lo hemos podido probar de verdad. Deberia funcionar, pero conviene guardar antes de intercambiar.`,
      );
    }
  }

  return {
    level: 'compatible',
    canPlayTogether: true,
    canTrade: true,
    headline:
      a.gameId === b.gameId
        ? `Los dos jugais a ${a.game.label}.`
        : `${a.game.label} y ${b.game.label}: compatibles.`,
    notes,
  };
};

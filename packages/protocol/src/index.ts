// Protocolo entre el navegador y el servidor de senalizacion.
//
// Vive en un paquete aparte porque lo usan los dos lados: si cambia un mensaje,
// que el compilador rompa en ambos a la vez y no en produccion.

/**
 * Identidad de una ROM. Viaja entre jugadores para comprobar compatibilidad.
 * Nunca viaja la ROM en si: solo estos datos de su cabecera.
 */
export type RomFingerprint = {
  title: string;
  gameCode: string;
  version: number;
  crc32: string;
  fileName: string;
};

export type ErrorCode =
  | 'sala-no-encontrada'
  | 'contrasena-incorrecta'
  | 'sala-llena'
  | 'rom-incompatible'
  | 'peticion-invalida'
  | 'demasiados-intentos';

/** Mensajes del navegador hacia el servidor. */
export type ClientMessage =
  | { type: 'create-room'; password: string; rom: RomFingerprint }
  | { type: 'join-room'; roomCode: string; password: string; rom: RomFingerprint }
  /** Carga util de WebRTC (oferta, respuesta o candidato ICE) para el otro par. */
  | { type: 'signal'; data: unknown }
  | { type: 'leave' };

/** Mensajes del servidor hacia el navegador. */
export type ServerMessage =
  | { type: 'room-created'; roomCode: string }
  | { type: 'room-joined'; roomCode: string; peerRom: RomFingerprint }
  | { type: 'peer-joined'; peerRom: RomFingerprint }
  | { type: 'peer-left' }
  | { type: 'signal'; data: unknown }
  | { type: 'error'; code: ErrorCode; message: string };

export type CompatibilityLevel =
  /** Misma ROM byte a byte. */
  | 'identica'
  /** Mismo juego, copia distinta. Normal en un Soul Link randomizado. */
  | 'aviso'
  /** Juegos distintos: no se puede continuar. */
  | 'bloqueo';

export type RomCompatibility = {
  level: CompatibilityLevel;
  message: string;
};

/**
 * Compara las ROMs de los dos jugadores.
 *
 * El criterio de bloqueo es el codigo de juego, no el CRC: los perfiles de
 * memoria del Soul Link dependen del juego y su revision, no de que la copia
 * sea identica. Dos aleatorizaciones distintas del mismo FireRed son
 * perfectamente jugables juntas, y de hecho es el caso habitual.
 */
export const compareRoms = (mine: RomFingerprint, theirs: RomFingerprint): RomCompatibility => {
  if (mine.gameCode !== theirs.gameCode) {
    return {
      level: 'bloqueo',
      message: `Juegos distintos: tu ROM es ${mine.gameCode} y la suya ${theirs.gameCode}.`,
    };
  }
  if (mine.version !== theirs.version) {
    return {
      level: 'bloqueo',
      message: `Misma version pero revision distinta (${mine.version} frente a ${theirs.version}). Las direcciones de memoria no coinciden.`,
    };
  }
  if (mine.crc32 !== theirs.crc32) {
    return {
      level: 'aviso',
      message: 'Mismo juego pero copias distintas. Es lo esperado si cada uno juega su propia aleatorizacion.',
    };
  }
  return { level: 'identica', message: 'Los dos teneis exactamente la misma ROM.' };
};

/** Alfabeto de los codigos de sala: sin caracteres que se confundan al dictarlos. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const isValidRoomCode = (code: string): boolean =>
  code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_CODE_ALPHABET.includes(c));

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

/** Alfabeto de los codigos de sala: sin caracteres que se confundan al dictarlos. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const isValidRoomCode = (code: string): boolean =>
  code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_CODE_ALPHABET.includes(c));

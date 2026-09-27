import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RomFingerprint,
} from '@emupoke/protocol';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 32;

/** Intentos de contrasena antes de cerrar la sala a nuevos intentos. */
export const MAX_JOIN_ATTEMPTS = 5;

/** Una sala sin nadie dentro se recoge pasado este tiempo. */
export const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;

export type Participant<Socket> = {
  socket: Socket;
  rom: RomFingerprint;
};

export type Room<Socket> = {
  code: string;
  salt: Buffer;
  passwordHash: Buffer;
  host: Participant<Socket> | null;
  guest: Participant<Socket> | null;
  createdAt: number;
  emptySince: number | null;
  joinAttempts: number;
};

/**
 * Codigo de sala aleatorio.
 *
 * Se genera con randomBytes y no con Math.random: es corto y protege el acceso
 * a la partida de alguien, asi que no debe ser predecible.
 */
const generateCode = (): string => {
  const bytes = randomBytes(ROOM_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[bytes[i]! % ROOM_CODE_ALPHABET.length];
  }
  return code;
};

export class RoomRegistry<Socket> {
  readonly #rooms = new Map<string, Room<Socket>>();

  async create(password: string, host: Participant<Socket>): Promise<Room<Socket>> {
    let code = generateCode();
    while (this.#rooms.has(code)) code = generateCode();

    const salt = randomBytes(16);
    const room: Room<Socket> = {
      code,
      salt,
      // Nunca guardamos la contrasena, solo su derivacion con sal.
      passwordHash: await scrypt(password, salt, KEY_LENGTH),
      host,
      guest: null,
      createdAt: Date.now(),
      emptySince: null,
      joinAttempts: 0,
    };
    this.#rooms.set(code, room);
    return room;
  }

  get(code: string): Room<Socket> | undefined {
    return this.#rooms.get(code);
  }

  async verifyPassword(room: Room<Socket>, password: string): Promise<boolean> {
    const candidate = await scrypt(password, room.salt, KEY_LENGTH);
    // Comparacion en tiempo constante: una comparacion normal filtra por cuanto
    // tarda en fallar cuantos bytes iniciales eran correctos.
    return timingSafeEqual(candidate, room.passwordHash);
  }

  /** Sala en la que esta este socket, si esta en alguna. */
  roomOf(socket: Socket): Room<Socket> | null {
    for (const room of this.#rooms.values()) {
      if (room.host?.socket === socket || room.guest?.socket === socket) return room;
    }
    return null;
  }

  /** Devuelve el otro ocupante de la sala, si lo hay. */
  peerOf(room: Room<Socket>, socket: Socket): Participant<Socket> | null {
    if (room.host?.socket === socket) return room.guest;
    if (room.guest?.socket === socket) return room.host;
    return null;
  }

  /** Saca a un participante. Devuelve al que se queda, para poder avisarle. */
  remove(socket: Socket): { room: Room<Socket>; remaining: Participant<Socket> | null } | null {
    for (const room of this.#rooms.values()) {
      const wasHost = room.host?.socket === socket;
      const wasGuest = room.guest?.socket === socket;
      if (!wasHost && !wasGuest) continue;

      if (wasHost) room.host = null;
      if (wasGuest) room.guest = null;

      const remaining = room.host ?? room.guest;
      // No borramos la sala al instante: quien se queda puede seguir esperando,
      // y quien se cayo puede volver con el mismo codigo.
      room.emptySince = remaining ? null : Date.now();
      return { room, remaining };
    }
    return null;
  }

  /** Recoge las salas que llevan vacias mas de EMPTY_ROOM_TTL_MS. */
  sweep(now = Date.now()): number {
    let removed = 0;
    for (const [code, room] of this.#rooms) {
      if (room.emptySince !== null && now - room.emptySince > EMPTY_ROOM_TTL_MS) {
        this.#rooms.delete(code);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.#rooms.size;
  }
}

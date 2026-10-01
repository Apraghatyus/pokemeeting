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

/** Alfabeto de los codigos de sala: sin caracteres que se confundan al dictarlos. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export const isValidRoomCode = (code: string): boolean =>
  code.length === ROOM_CODE_LENGTH && [...code].every((c) => ROOM_CODE_ALPHABET.includes(c));

/**
 * Un Pokemon del equipo, tal y como viaja al companero.
 *
 * Es deliberadamente poca cosa. No van los cien bytes del Pokemon ni nada que
 * venga de la ROM: solo numeros y el mote, que lo escribio el jugador. El
 * nombre de la especie y su sprite los pone cada lado con SU propia copia del
 * juego, asi que por el cable no cruza nada de Nintendo.
 *
 * Que eso funcione no es casualidad: dos copias aleatorizadas de la misma
 * edicion conservan la misma tabla de nombres, asi que la especie 25 se llama
 * PIKACHU en las dos aunque sus estadisticas sean otras.
 */
export type PokemonResumen = {
  /** Posicion en el equipo, de 0 a 5. */
  ranura: number;
  /** Numero interno de especie. Cada lado le pone nombre con su ROM. */
  especie: number;
  /** El mote, que lo escribio el jugador y no es de nadie mas. */
  mote: string;
  nivel: number;
  ps: number;
  psMaximos: number;
  /** Un huevo no enseña especie ni nivel, y conviene saberlo antes de pintarlo. */
  huevo: boolean;
  /**
   * Personalidad del Pokemon, que no cambia nunca.
   *
   * Sirve para saber si la ranura 3 sigue teniendo al mismo o es otro: sin
   * esto, cambiar de sitio dos Pokemon pareceria que uno se transformo en otro.
   */
  personalidad: number;
};

/** El equipo entero en un momento dado. */
export type EquipoResumen = {
  /** Codigo de juego de quien lo manda, por si algun dia difieren. */
  juego: string;
  ranuras: PokemonResumen[];
  /**
   * Cuando se leyo, en milisegundos.
   *
   * El canal de datos no garantiza el orden, asi que sin esto un mensaje viejo
   * podria pisar a uno nuevo y el equipo del companero daria saltos atras.
   */
  momento: number;
};

/**
 * Lo que los dos jugadores se dicen directamente, sin pasar por el servidor.
 *
 * Va por el canal de datos de WebRTC, que es cifrado y punto a punto: el
 * servidor de salas los presento y se aparto, y esto ya no lo ve nadie mas.
 */
export type PeerMessage = { type: 'equipo'; equipo: EquipoResumen };

/**
 * Lee un mensaje del companero sin fiarse de el.
 *
 * Al otro lado hay un navegador que no controlamos. Devuelve null en vez de
 * lanzar: un mensaje raro se ignora y la partida sigue, que es mejor que
 * tirarse la sesion por un paquete mal formado.
 */
export const parsePeerMessage = (crudo: string): PeerMessage | null => {
  let datos: unknown;
  try {
    datos = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (typeof datos !== 'object' || datos === null) return null;

  const mensaje = datos as { type?: unknown; equipo?: unknown };
  if (mensaje.type !== 'equipo') return null;

  const equipo = mensaje.equipo as EquipoResumen | undefined;
  if (!equipo || !Array.isArray(equipo.ranuras)) return null;
  if (typeof equipo.momento !== 'number') return null;

  // Seis es el tamano de un equipo. Mas que eso no es un equipo, es otra cosa.
  if (equipo.ranuras.length > 6) return null;

  const ranuras = equipo.ranuras.filter(
    (r): r is PokemonResumen =>
      typeof r === 'object' &&
      r !== null &&
      typeof r.ranura === 'number' &&
      typeof r.especie === 'number' &&
      typeof r.nivel === 'number' &&
      typeof r.mote === 'string' &&
      // Un mote de veinte caracteres no cabe en el juego: viene de fuera.
      r.mote.length <= 20,
  );

  return { type: 'equipo', equipo: { ...equipo, ranuras } };
};

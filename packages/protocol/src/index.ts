// Protocolo entre el navegador y el servidor de senalizacion.
//
// Vive en un paquete aparte porque lo usan los dos lados: si cambia un mensaje,
// que el compilador rompa en ambos a la vez y no en produccion.

// Las cuentas hablan su propio idioma -usuarios, contrasenas, lo que se sube-
// y esta en su fichero, pero sale por la misma puerta: los dos lados importan
// de "@emupoke/protocol" y ya.
export * from './cuentas';

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

/**
 * Lo que se puede saber de una sala ANTES de entrar en ella.
 *
 * Existe para que un enlace de invitacion sea corto. Antes llevaba la semilla
 * dentro -cien caracteres de base64 en medio de un mensaje de WhatsApp- y ahora
 * la guarda la sala: el enlace solo lleva el codigo y la contrasena, y quien lo
 * abre pregunta por lo demas.
 *
 * Lo segundo que resuelve es poder decirle a quien llega QUE juego necesita.
 * Antes se le pedia "tu ROM" a secas y, si ponia otra edicion, se enteraba
 * despues. Ahora se le dice cual antes de que busque el fichero.
 *
 * NO lleva el nombre del fichero del anfitrion. Se sabe al entrar -ahi ya hay
 * contrasena de por medio- pero esto se puede preguntar sin credenciales, y
 * como alguien llama a su fichero no es asunto de nadie.
 */
/**
 * Lo largo que puede ser un apodo.
 *
 * Diecisiete porque es lo que cabe en el nombre de un entrenador en el juego, y
 * porque esto se pinta en una etiqueta estrecha encima de una pantalla: un
 * nombre de doscientos caracteres no es un nombre, es un ataque a la maqueta.
 */
export const MAX_APODO = 17;

/**
 * Deja un apodo en algo que se puede enseñar, o null si no queda nada.
 *
 * Viene de un navegador que no controlamos y acaba pintado en la pantalla del
 * otro, asi que se corta y se le quitan los caracteres de control, que no se
 * ven pero descolocan una linea de texto.
 */
export const limpiarApodo = (valor: unknown): string | null => {
  if (typeof valor !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const limpio = valor.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_APODO);
  return limpio === '' ? null : limpio;
};

/**
 * Las tres dificultades de una partida.
 *
 * No cambian como se juega dentro del juego: cambian que reglas vigila el
 * programa, que se apaga en el panel y en que columna del ranking cuenta. La
 * unica que toca la copia es que los de revivir salgan o no de las tiendas.
 *
 * Es de la PARTIDA y se elige al aleatorizar. En un Soul Link viaja dentro de
 * la semilla, asi que quien entra por la invitacion juega con la misma.
 */
export type Dificultad = 'normal' | 'nuzlocke' | 'nivelada';

export const DIFICULTADES: readonly Dificultad[] = ['normal', 'nuzlocke', 'nivelada'];

export const esDificultad = (valor: unknown): valor is Dificultad =>
  typeof valor === 'string' && (DIFICULTADES as readonly string[]).includes(valor);

/** Si en esa dificultad los de revivir salen de las tiendas. */
export const sinRevivirEn = (dificultad: Dificultad): boolean => dificultad !== 'normal';

export type DatosDeSala = {
  roomCode: string;
  /** Como se llama quien monto la sala, para poder decirlo en la invitacion. */
  anfitrion: string | null;
  /** Codigo de juego de la ROM del anfitrion, para decir a que se juega. */
  gameCode: string;
  /** El titulo de su cabecera, por si el codigo no se conoce. */
  title: string;
  /** Su semilla, o null si juega la ROM tal cual. */
  semilla: string | null;
};

/** Mensajes del navegador hacia el servidor. */
export type ClientMessage =
  | {
      type: 'create-room';
      password: string;
      rom: RomFingerprint;
      semilla?: string | null;
      /** Como quiere que le llamen. Opcional: sin el se dice "tu companero". */
      nombre?: string | null;
    }
  | {
      type: 'join-room';
      roomCode: string;
      password: string;
      rom: RomFingerprint;
      nombre?: string | null;
    }
  /** Que juego y que mundo hay en esa sala, para quien abre una invitacion. */
  | { type: 'ask-room'; roomCode: string }
  /** Carga util de WebRTC (oferta, respuesta o candidato ICE) para el otro par. */
  | { type: 'signal'; data: unknown }
  | { type: 'leave' };

/** Mensajes del servidor hacia el navegador. */
export type ServerMessage =
  | { type: 'room-created'; roomCode: string }
  | {
      type: 'room-joined';
      roomCode: string;
      peerRom: RomFingerprint;
      /** Como se llama el otro, si lo dijo. */
      peerNombre?: string | null;
    }
  | { type: 'peer-joined'; peerRom: RomFingerprint; peerNombre?: string | null }
  | { type: 'peer-left' }
  | { type: 'room-info'; datos: DatosDeSala }
  | { type: 'signal'; data: unknown }
  | { type: 'error'; code: ErrorCode; message: string };

/**
 * Lo que puede medir una semilla por el cable.
 *
 * Son unos cien caracteres: marca, dos CRC, el numero y los ajustes en base64.
 * El tope esta para que nadie use la sala como almacen de lo que quiera.
 */
export const MAX_SEMILLA = 512;

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
/**
 * Lo que le pasa a un Pokemon, si le pasa algo.
 *
 * Son los estados de siempre del juego. Van en este orden de gravedad porque
 * solo se enseña uno: estar debilitado tapa todo lo demas.
 */
export type EstadoPokemon =
  | 'debilitado'
  | 'dormido'
  | 'congelado'
  | 'paralizado'
  | 'quemado'
  | 'envenenado';

export type PokemonResumen = {
  /** Posicion en el equipo, de 0 a 5. */
  ranura: number;
  /** Numero interno de especie. Cada lado le pone nombre con su ROM. */
  especie: number;
  /** El mote, que lo escribio el jugador y no es de nadie mas. */
  mote: string;
  nivel: number;
  /**
   * Como esta: debilitado, envenenado, dormido... o null si esta bien.
   *
   * La vida exacta no viaja a proposito: cambia en cada turno de combate y
   * llenaria el canal de mensajes para enseñar una barra que se mueve sola.
   * El estado alterado cambia pocas veces y dice mas de un vistazo, sobre todo
   * en un Soul Link, donde un debilitado suele ser el final de una pareja.
   */
  estado: EstadoPokemon | null;
  /**
   * Sus dos tipos, como numeros, o null si no se han podido leer.
   *
   * Viajan en el mensaje en vez de resolverlos quien recibe, y esa es la
   * diferencia entre acertar y mentir: en dos copias aleatorizadas por separado
   * la misma especie tiene tipos distintos. Comprobado generando dos, donde el
   * mismo Bulbasaur salio de Tierra en una y de Dragon en la otra.
   */
  tipos: readonly [number, number] | null;
  /**
   * Sus cuatro movimientos, como numeros, o ausente si no se han podido leer.
   *
   * NO SE ENSENAN EN NINGUN SITIO, y van aqui a proposito. Se guardan al
   * terminar una partida para el historial que vendra con los perfiles: contar
   * como se gano o se perdio sin saber con que se jugaba es contar la mitad.
   *
   * Numeros y no nombres, igual que la especie: el nombre lo pone quien mira,
   * con su ROM. Un numero de movimiento sigue queriendo decir lo mismo en las
   * dos copias aunque esten aleatorizadas por separado.
   */
  movimientos?: readonly number[];
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
  /**
   * La personalidad del que esta peleando, o null si no se sabe.
   *
   * Viaja con el equipo en vez de calcularlo quien recibe, y no es un capricho:
   * para saberlo hay que mirar la memoria de la partida, y la del companero no
   * sale de su ordenador. Lo manda quien puede saberlo.
   */
  peleando?: number | null;
  /**
   * Si esa partida esta ahora mismo en un combate. Null si no se sabe.
   *
   * Viaja con el equipo por el mismo motivo que `peleando`: lo sabe quien tiene
   * la memoria delante. Y hace falta para algo que no es obvio: mientras hay
   * combate el juego **mueve las ranuras del equipo**, asi que el panel tiene
   * que dejar de seguirlas o se baraja solo en mitad de la pelea.
   */
  enCombate?: boolean | null;
};

/**
 * Lo que los dos jugadores se dicen directamente, sin pasar por el servidor.
 *
 * Va por el canal de datos de WebRTC, que es cifrado y punto a punto: el
 * servidor de salas los presento y se aparto, y esto ya no lo ve nadie mas.
 */
/**
 * Lo que se ofrece en un intercambio.
 *
 * Van los cien bytes del Pokemon tal cual, en base64 porque esto viaja como
 * JSON. Van tambien el mote, la especie y el nivel, y no es informacion
 * repetida: quien recibe tiene que poder ensenar QUE le ofrecen antes de
 * aceptar, y descifrar el bloque para eso seria pedirle que se fie primero.
 */
export type OfertaIntercambio = {
  /** Identifica el trato. Los dos lados acaban usando el mismo. */
  trato: string;
  /** De que ranura del equipo sale, 0 a 5. */
  ranura: number;
  /** Los cien bytes, en base64. */
  bloque: string;
  mote: string;
  especie: number;
  nivel: number;
};

export type PeerMessage =
  /**
   * Mi equipo, y si mi juego ha cantado una derrota.
   *
   * `perdio` no es "mis Pokemon estan a cero": es que el JUEGO lo ha dicho, con
   * su mensaje de ir corriendo al Centro Pokemon. Viaja porque al otro lado
   * hace falta para distinguir dos cosas que desde fuera se ven igual: que se
   * me haya muerto el unico Pokemon que tenia, y que me acaben de ganar el
   * combate del laboratorio, donde el Pokemon tambien se queda a cero y no ha
   * pasado nada.
   */
  | { type: 'equipo'; equipo: EquipoResumen; perdio?: boolean }
  | { type: 'oferta'; oferta: OfertaIntercambio }
  /** "Por mi adelante": el que lo manda ya ha confirmado. */
  | { type: 'trato-listo'; trato: string }
  | { type: 'trato-roto'; trato: string };

/** Cuanto ocupa un Pokemon de tercera generacion, y por tanto su bloque. */
const BYTES_DE_UN_POKEMON = 100;

/**
 * Como tiene que ser el bloque escrito en base64, y por que asi y no por su
 * longitud a secas.
 *
 * Medir la cadena NO basta, y se vio probandolo: 100 bytes y 101 ocupan los
 * mismos 136 caracteres. Dejar pasar uno de 101 no da un Pokemon raro, da un
 * byte escrito encima del Pokemon de al lado.
 *
 * Lo que si los distingue es el relleno del final: 100 bytes acaban en "==",
 * 101 en un solo "=" y 102 sin ninguno. Asi que se exige el tamano exacto Y el
 * relleno, y de paso que no haya nada que no sea base64.
 */
const BLOQUE_EN_BASE64 = 136;
const BLOQUE_VALIDO = /^[A-Za-z0-9+/]{134}==$/;

const esOferta = (valor: unknown): valor is OfertaIntercambio => {
  if (typeof valor !== 'object' || valor === null) return false;
  const o = valor as Record<string, unknown>;
  return (
    typeof o.trato === 'string' &&
    o.trato.length > 0 &&
    o.trato.length <= 64 &&
    typeof o.ranura === 'number' &&
    Number.isInteger(o.ranura) &&
    o.ranura >= 0 &&
    o.ranura < 6 &&
    typeof o.bloque === 'string' &&
    // Exacto, no "como mucho": un bloque de otro tamano no es un Pokemon.
    o.bloque.length === BLOQUE_EN_BASE64 &&
    BLOQUE_VALIDO.test(o.bloque) &&
    typeof o.mote === 'string' &&
    o.mote.length <= 20 &&
    typeof o.especie === 'number' &&
    typeof o.nivel === 'number' &&
    o.nivel >= 1 &&
    o.nivel <= 100
  );
};

/** Cuantos movimientos lleva un Pokemon, y hasta donde llegan sus numeros. */
const MOVIMIENTOS_POR_POKEMON = 4;
const MOVIMIENTO_MAXIMO = 511;

const sonMovimientos = (valor: unknown): valor is number[] =>
  valor === undefined ||
  (Array.isArray(valor) &&
    valor.length <= MOVIMIENTOS_POR_POKEMON &&
    valor.every((m) => typeof m === 'number' && m >= 0 && m <= MOVIMIENTO_MAXIMO));

export { BYTES_DE_UN_POKEMON };

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

  const mensaje = datos as { type?: unknown; equipo?: unknown; oferta?: unknown; trato?: unknown };

  // Los del intercambio se miran aqui arriba porque no llevan equipo dentro.
  if (mensaje.type === 'oferta') {
    return esOferta(mensaje.oferta) ? { type: 'oferta', oferta: mensaje.oferta } : null;
  }
  if (mensaje.type === 'trato-listo' || mensaje.type === 'trato-roto') {
    const trato = mensaje.trato;
    if (typeof trato !== 'string' || trato.length === 0 || trato.length > 64) return null;
    return { type: mensaje.type, trato };
  }

  if (mensaje.type !== 'equipo') return null;

  const equipo = mensaje.equipo as EquipoResumen | undefined;
  if (!equipo || !Array.isArray(equipo.ranuras)) return null;
  if (typeof equipo.momento !== 'number') return null;

  // Seis es el tamano de un equipo. Mas que eso no es un equipo, es otra cosa.
  if (equipo.ranuras.length > 6) return null;

  const ranuras = equipo.ranuras
    .filter(
      (r): r is PokemonResumen =>
        typeof r === 'object' &&
        r !== null &&
        typeof r.ranura === 'number' &&
        typeof r.especie === 'number' &&
        typeof r.nivel === 'number' &&
        typeof r.mote === 'string' &&
        // Un mote de veinte caracteres no cabe en el juego: viene de fuera.
        r.mote.length <= 20,
    )
    // Los movimientos se quedan solo si son cuatro numeros de movimiento. Vienen
    // de un navegador que no controlamos y acaban guardados en el historial: una
    // lista de mil elementos ahi dentro se queda para siempre.
    .map((r) => (sonMovimientos(r.movimientos) ? r : { ...r, movimientos: undefined }));

  return {
    type: 'equipo',
    equipo: { ...equipo, ranuras },
    perdio: (mensaje as { perdio?: unknown }).perdio === true,
  };
};

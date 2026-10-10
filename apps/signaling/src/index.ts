// Servidor de senalizacion.
//
// Su unico trabajo es emparejar a dos navegadores y pasarles los mensajes de
// WebRTC hasta que se conecten directamente. Despues se aparta: el video y los
// datos de la partida no pasan por aqui.
//
// Lo que este servidor NUNCA hace: alojar, servir ni ver una ROM.

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { compareRoms } from '@emupoke/pokemon';
import {
  isValidRoomCode,
  MAX_SEMILLA,
  type ClientMessage,
  type ErrorCode,
  type RomFingerprint,
  type ServerMessage,
} from '@emupoke/protocol';
import { MAX_JOIN_ATTEMPTS, RoomRegistry } from './rooms.ts';

const PORT = Number(process.env.PORT ?? 8787);
const SWEEP_INTERVAL_MS = 60_000;

/**
 * Cada cuanto se le da un toque a cada socket para que no se duerma.
 *
 * Una sala pasa casi todo el rato callada: la senalizacion sirve para
 * presentarse y despues los dos hablan directamente. Pero un WebSocket que no
 * dice nada durante un rato lo cierra cualquier cosa que haya por el camino
 * -un proxy, un router, el operador del movil- y lo cierra **sin avisar a
 * nadie**: no llega un `close`, simplemente deja de funcionar.
 *
 * Eso se veia como que al host se le caia la sala de repente. Con un ping
 * periodico el socket nunca esta callado, y ademas se nota si murio: el que no
 * conteste al siguiente toque se da por muerto y se recoge su sala, en vez de
 * dejarla ocupada por alguien que ya no esta.
 *
 * Veinticinco segundos porque los intermediarios que cierran por inactividad
 * suelen hacerlo al minuto, y conviene pasar dos veces antes de eso.
 */
const LATIDO_MS = 25_000;

const rooms = new RoomRegistry<WebSocket>();

const send = (socket: WebSocket, message: ServerMessage): void => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};

const fail = (socket: WebSocket, code: ErrorCode, message: string): void =>
  send(socket, { type: 'error', code, message });

/** Valida la forma de una huella de ROM llegada de la red. */
const isRomFingerprint = (value: unknown): value is RomFingerprint => {
  if (typeof value !== 'object' || value === null) return false;
  const rom = value as Record<string, unknown>;
  return (
    typeof rom.title === 'string' &&
    typeof rom.gameCode === 'string' &&
    typeof rom.version === 'number' &&
    typeof rom.crc32 === 'string' &&
    typeof rom.fileName === 'string'
  );
};

const handleCreate = async (socket: WebSocket, message: Extract<ClientMessage, { type: 'create-room' }>) => {
  if (!message.password || !isRomFingerprint(message.rom)) {
    fail(socket, 'peticion-invalida', 'Faltan la contrasena o los datos de la ROM.');
    return;
  }
  // La semilla del mundo que juega el anfitrion, para que el enlace de
  // invitacion pueda ser corto y quien lo abra la pida al entrar. Es texto -un
  // numero y unos ajustes-, nunca nada del juego; aun asi se le pone tope para
  // que la sala no sirva de almacen de lo que sea.
  const semilla =
    typeof message.semilla === 'string' && message.semilla.length <= MAX_SEMILLA
      ? message.semilla
      : null;

  const room = await rooms.create(message.password, { socket, rom: message.rom }, semilla);
  console.log(`[sala ${room.code}] creada  (${rooms.size} activas)`);
  send(socket, { type: 'room-created', roomCode: room.code });
};

const handleJoin = async (socket: WebSocket, message: Extract<ClientMessage, { type: 'join-room' }>) => {
  const code = (message.roomCode ?? '').toUpperCase();
  if (!isValidRoomCode(code) || !isRomFingerprint(message.rom)) {
    fail(socket, 'peticion-invalida', 'Codigo de sala o datos de ROM no validos.');
    return;
  }

  const room = rooms.get(code);
  // Mismo mensaje para sala inexistente que para contrasena incorrecta seria lo
  // ideal contra enumeracion, pero aqui perjudica mas de lo que protege: el
  // codigo se dicta en voz alta y equivocarse al teclearlo es lo habitual.
  if (!room) {
    fail(socket, 'sala-no-encontrada', `No existe ninguna sala con el codigo ${code}.`);
    return;
  }
  if (room.joinAttempts >= MAX_JOIN_ATTEMPTS) {
    fail(socket, 'demasiados-intentos', 'Demasiados intentos fallidos. El anfitrion debe crear otra sala.');
    return;
  }
  if (room.host && room.guest) {
    fail(socket, 'sala-llena', 'Esa sala ya tiene dos jugadores.');
    return;
  }

  if (!(await rooms.verifyPassword(room, message.password ?? ''))) {
    room.joinAttempts += 1;
    fail(socket, 'contrasena-incorrecta', 'Contrasena incorrecta.');
    return;
  }

  // La regla de edicion se comprueba aqui y no solo en el cliente: el cliente
  // la usa para explicarla bien, pero quien la hace cumplir es el servidor.
  const other = room.host ?? room.guest;
  if (other) {
    const compatibility = compareRoms(message.rom, other.rom);
    if (!compatibility.canPlayTogether) {
      fail(socket, 'rom-incompatible', [compatibility.headline, ...compatibility.notes].join(' '));
      return;
    }
  }

  // El intento correcto limpia el contador: quien acierta no debe arrastrar los
  // fallos de tecleo anteriores.
  room.joinAttempts = 0;
  const participant = { socket, rom: message.rom };
  if (room.host) room.guest = participant;
  else room.host = participant;
  room.emptySince = null;

  console.log(`[sala ${code}] se une un jugador`);
  if (other) {
    send(socket, { type: 'room-joined', roomCode: code, peerRom: other.rom });
    send(other.socket, { type: 'peer-joined', peerRom: message.rom });
  }
};

/**
 * Que hay en esa sala, para quien abre un enlace de invitacion.
 *
 * Se contesta SIN contrasena a proposito: quien llega por el enlace todavia no
 * ha puesto su ROM, y sin ella no se puede entrar. Lo que se devuelve no es
 * secreto -a que juego se juega y como rehacer ese mundo- y es justo lo que el
 * anfitrion acaba de mandar por el chat.
 *
 * Lo que NO se devuelve es el nombre del fichero del anfitrion. Eso se sabe al
 * entrar, donde ya hay contrasena de por medio; como alguien llama a su fichero
 * no es asunto de quien teclee codigos al azar.
 */
const handleAsk = (socket: WebSocket, message: Extract<ClientMessage, { type: 'ask-room' }>) => {
  const code = (message.roomCode ?? '').toUpperCase();
  if (!isValidRoomCode(code)) {
    fail(socket, 'peticion-invalida', 'Ese codigo de sala no es valido.');
    return;
  }

  const room = rooms.get(code);
  const anfitrion = room?.host ?? room?.guest ?? null;
  if (!room || !anfitrion) {
    fail(socket, 'sala-no-encontrada', `No existe ninguna sala con el codigo ${code}.`);
    return;
  }

  send(socket, {
    type: 'room-info',
    datos: {
      roomCode: code,
      gameCode: anfitrion.rom.gameCode,
      title: anfitrion.rom.title,
      semilla: room.semilla,
    },
  });
};

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server });

/**
 * Quien ha contestado al ultimo toque.
 *
 * En un WeakSet y no en una propiedad del socket para no tener que ensanchar el
 * tipo de la libreria: si el socket se va, su entrada se va sola.
 */
const vivos = new WeakSet<WebSocket>();

wss.on('connection', (socket) => {
  vivos.add(socket);
  socket.on('pong', () => vivos.add(socket));

  socket.on('message', (raw) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      fail(socket, 'peticion-invalida', 'El mensaje no es JSON valido.');
      return;
    }

    switch (message.type) {
      case 'create-room':
        void handleCreate(socket, message);
        break;
      case 'join-room':
        void handleJoin(socket, message);
        break;
      case 'ask-room':
        handleAsk(socket, message);
        break;
      case 'signal': {
        // Reenvio ciego: el contenido es asunto de WebRTC, no nuestro.
        const room = rooms.roomOf(socket);
        const peer = room ? rooms.peerOf(room, socket) : null;
        if (peer) send(peer.socket, { type: 'signal', data: message.data });
        break;
      }
      case 'leave':
        socket.close();
        break;
      default:
        fail(socket, 'peticion-invalida', 'Tipo de mensaje desconocido.');
    }
  });

  socket.on('close', () => {
    const left = rooms.remove(socket);
    if (!left) return;
    console.log(`[sala ${left.room.code}] se va un jugador`);
    if (left.remaining) send(left.remaining.socket, { type: 'peer-left' });
  });
});

setInterval(() => {
  for (const socket of wss.clients) {
    // No contesto al toque anterior: no hay nadie al otro lado.
    if (!vivos.has(socket)) {
      socket.terminate();
      continue;
    }
    vivos.delete(socket);
    socket.ping();
  }
}, LATIDO_MS).unref();

setInterval(() => {
  const removed = rooms.sweep();
  if (removed > 0) console.log(`recogidas ${removed} salas vacias (${rooms.size} activas)`);
}, SWEEP_INTERVAL_MS).unref();

server.listen(PORT, () => {
  console.log(`servidor de senalizacion escuchando en el puerto ${PORT}`);
});

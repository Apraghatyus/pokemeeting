// Servidor de senalizacion.
//
// Su unico trabajo es emparejar a dos navegadores y pasarles los mensajes de
// WebRTC hasta que se conecten directamente. Despues se aparta: el video y los
// datos de la partida no pasan por aqui.
//
// Lo que este servidor NUNCA hace: alojar, servir ni ver una ROM.

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  compareRoms,
  isValidRoomCode,
  type ClientMessage,
  type ErrorCode,
  type RomFingerprint,
  type ServerMessage,
} from '@emupoke/protocol';
import { MAX_JOIN_ATTEMPTS, RoomRegistry } from './rooms.ts';

const PORT = Number(process.env.PORT ?? 8787);
const SWEEP_INTERVAL_MS = 60_000;

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
  const room = await rooms.create(message.password, { socket, rom: message.rom });
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

  const other = room.host ?? room.guest;
  if (other) {
    const compatibility = compareRoms(message.rom, other.rom);
    if (compatibility.level === 'bloqueo') {
      fail(socket, 'rom-incompatible', compatibility.message);
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

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
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
  const removed = rooms.sweep();
  if (removed > 0) console.log(`recogidas ${removed} salas vacias (${rooms.size} activas)`);
}, SWEEP_INTERVAL_MS).unref();

server.listen(PORT, () => {
  console.log(`servidor de senalizacion escuchando en el puerto ${PORT}`);
});

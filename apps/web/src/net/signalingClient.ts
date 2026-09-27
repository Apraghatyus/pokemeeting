import type { ClientMessage, ErrorCode, RomFingerprint, ServerMessage } from '@emupoke/protocol';

export type SignalingHandlers = {
  onRoomCreated: (roomCode: string) => void;
  onRoomJoined: (roomCode: string, peerRom: RomFingerprint) => void;
  onPeerJoined: (peerRom: RomFingerprint) => void;
  onPeerLeft: () => void;
  onSignal: (data: unknown) => void;
  onError: (code: ErrorCode, message: string) => void;
  onDisconnected: () => void;
};

/**
 * Por defecto el servidor de senalizacion vive en el mismo equipo que sirve la
 * pagina, en el puerto 8787. Se deduce del host actual y no se fija a
 * "localhost" para que al abrir la pagina desde otra maquina de la red el
 * cliente apunte al sitio correcto.
 */
const defaultUrl = (): string => {
  const fromEnv = import.meta.env['VITE_SIGNALING_URL'] as string | undefined;
  if (fromEnv) return fromEnv;
  const protocol = globalThis.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return protocol + '//' + globalThis.location.hostname + ':8787';
};

export class SignalingClient {
  #socket: WebSocket | null = null;
  readonly #url: string;
  readonly #handlers: SignalingHandlers;

  constructor(handlers: SignalingHandlers, url = defaultUrl()) {
    this.#handlers = handlers;
    this.#url = url;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.#url);
      this.#socket = socket;

      socket.addEventListener('open', () => resolve());
      socket.addEventListener('error', () =>
        reject(new Error('No se pudo conectar con el servidor de salas en ' + this.#url + '.')),
      );
      socket.addEventListener('close', () => this.#handlers.onDisconnected());
      socket.addEventListener('message', (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        this.#dispatch(message);
      });
    });
  }

  #dispatch(message: ServerMessage): void {
    const h = this.#handlers;
    switch (message.type) {
      case 'room-created':
        h.onRoomCreated(message.roomCode);
        break;
      case 'room-joined':
        h.onRoomJoined(message.roomCode, message.peerRom);
        break;
      case 'peer-joined':
        h.onPeerJoined(message.peerRom);
        break;
      case 'peer-left':
        h.onPeerLeft();
        break;
      case 'signal':
        h.onSignal(message.data);
        break;
      case 'error':
        h.onError(message.code, message.message);
        break;
    }
  }

  #send(message: ClientMessage): void {
    if (this.#socket?.readyState === WebSocket.OPEN) {
      this.#socket.send(JSON.stringify(message));
    }
  }

  createRoom(password: string, rom: RomFingerprint): void {
    this.#send({ type: 'create-room', password, rom });
  }

  joinRoom(roomCode: string, password: string, rom: RomFingerprint): void {
    this.#send({ type: 'join-room', roomCode: roomCode.toUpperCase(), password, rom });
  }

  signal(data: unknown): void {
    this.#send({ type: 'signal', data });
  }

  close(): void {
    this.#socket?.close();
    this.#socket = null;
  }
}

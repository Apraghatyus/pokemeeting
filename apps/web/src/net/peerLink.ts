// Conexion directa entre los dos navegadores.
//
// El servidor solo sirve para el saludo inicial. A partir de aqui el video de
// cada partida y el canal de datos van directos de un jugador al otro.

export type PeerState = 'inactiva' | 'conectando' | 'conectada' | 'perdida';

export type PeerHandlers = {
  /** Se llama cuando llega el video de la partida del companero. */
  onRemoteStream: (stream: MediaStream) => void;
  onState: (state: PeerState) => void;
  /** Mensajes del canal de datos: aqui iran Soul Link e intercambios. */
  onData: (data: string) => void;
  /** Envia una carga util de WebRTC al otro par a traves del servidor. */
  sendSignal: (data: unknown) => void;
};

/** Servidor STUN publico: solo sirve para descubrir la IP publica propia. */
const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** Canal de datos que compartiran Soul Link e intercambios. */
const DATA_CHANNEL = 'emupoke';

type SignalPayload =
  | { kind: 'description'; description: RTCSessionDescriptionInit }
  | { kind: 'candidate'; candidate: RTCIceCandidateInit };

export class PeerLink {
  readonly #pc: RTCPeerConnection;
  readonly #handlers: PeerHandlers;
  #channel: RTCDataChannel | null = null;

  constructor(handlers: PeerHandlers, localStream: MediaStream | null) {
    this.#handlers = handlers;
    this.#pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Anadimos nuestro video ANTES de negociar, para que la oferta o la
    // respuesta ya lo incluyan y la conexion sea bidireccional de una vez.
    if (localStream) {
      for (const track of localStream.getTracks()) {
        this.#pc.addTrack(track, localStream);
      }
    }

    this.#pc.addEventListener('track', (event) => {
      const stream = event.streams[0];
      if (stream) handlers.onRemoteStream(stream);
    });

    this.#pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        handlers.sendSignal({ kind: 'candidate', candidate: event.candidate.toJSON() });
      }
    });

    this.#pc.addEventListener('connectionstatechange', () => {
      switch (this.#pc.connectionState) {
        case 'connected':
          handlers.onState('conectada');
          break;
        case 'connecting':
        case 'new':
          handlers.onState('conectando');
          break;
        case 'failed':
        case 'disconnected':
        case 'closed':
          handlers.onState('perdida');
          break;
      }
    });

    // Quien no hace la oferta recibe el canal creado por el otro.
    this.#pc.addEventListener('datachannel', (event) => this.#adoptChannel(event.channel));
  }

  #adoptChannel(channel: RTCDataChannel): void {
    this.#channel = channel;
    channel.addEventListener('message', (event) => this.#handlers.onData(String(event.data)));
  }

  /** Lo llama quien inicia: crea el canal de datos y manda la oferta. */
  async offer(): Promise<void> {
    this.#adoptChannel(this.#pc.createDataChannel(DATA_CHANNEL));
    const description = await this.#pc.createOffer();
    await this.#pc.setLocalDescription(description);
    this.#handlers.sendSignal({ kind: 'description', description });
  }

  /** Procesa lo que llega del otro par a traves del servidor. */
  async accept(payload: unknown): Promise<void> {
    const signal = payload as SignalPayload;
    if (signal?.kind === 'description') {
      await this.#pc.setRemoteDescription(new RTCSessionDescription(signal.description));
      if (signal.description.type === 'offer') {
        const answer = await this.#pc.createAnswer();
        await this.#pc.setLocalDescription(answer);
        this.#handlers.sendSignal({ kind: 'description', description: answer });
      }
      return;
    }
    if (signal?.kind === 'candidate') {
      // Un candidato puede llegar antes que la descripcion remota. En ese caso
      // el navegador lo rechaza y no pasa nada: vendran mas.
      await this.#pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {});
    }
  }

  send(data: string): boolean {
    if (this.#channel?.readyState !== 'open') return false;
    this.#channel.send(data);
    return true;
  }

  close(): void {
    this.#channel?.close();
    this.#pc.close();
  }
}

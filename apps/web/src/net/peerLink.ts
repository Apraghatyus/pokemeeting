// Conexion directa entre los dos navegadores.
//
// El servidor solo sirve para el saludo inicial. A partir de aqui el video de
// cada partida y el canal de datos van directos de un jugador al otro.

export type PeerState = 'inactiva' | 'conectando' | 'conectada' | 'perdida';

export type PeerHandlers = {
  /** Se llama cuando llega el video de la partida del companero. */
  onRemoteStream: (stream: MediaStream) => void;
  /** Se llama cuando llega su voz. Va aparte del video a proposito. */
  onRemoteVoice: (stream: MediaStream) => void;
  onState: (state: PeerState) => void;
  /** Mensajes del canal de datos: aqui iran Soul Link e intercambios. */
  onData: (data: string) => void;
  /**
   * El canal de datos ya acepta mensajes.
   *
   * Hace falta saberlo: la conexion se declara establecida antes de que el
   * canal abra, y lo que se mande en ese hueco se pierde en silencio. Es lo
   * que hacia que el equipo no le apareciera al que acababa de entrar.
   */
  onCanalListo: () => void;
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

    // La voz viaja por su propio canal y se separa por tipo de pista, no por
    // el stream al que venga asociada: el video de la partida se reproduce
    // silenciado y la voz necesita su propio volumen.
    this.#pc.addEventListener('track', (event) => {
      if (event.track.kind === 'audio') {
        handlers.onRemoteVoice(new MediaStream([event.track]));
        return;
      }
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

    // En desarrollo dejamos la conexion a mano: depurar WebRTC sin poder mirar
    // sus transceptores es adivinar.
    if (import.meta.env.DEV) {
      (globalThis as unknown as { __peer?: RTCPeerConnection }).__peer = this.#pc;
    }
  }

  /**
   * Transceptor de audio de la conexion.
   *
   * Se busca en vez de guardarlo porque quien responde no lo crea: lo crea
   * setRemoteDescription al aplicar la oferta. Guardar una referencia propia
   * dejaba al que responde con un transceptor huerfano, y su microfono no
   * llegaba a ninguna parte.
   */
  #voiceTransceiver(): RTCRtpTransceiver | undefined {
    return this.#pc
      .getTransceivers()
      .find((t) => t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio');
  }

  /**
   * Enciende o apaga el microfono.
   *
   * Usa replaceTrack sobre un hueco ya negociado, asi que no hace falta
   * repetir el intercambio de ofertas ni se corta el video.
   */
  async setVoiceTrack(track: MediaStreamTrack | null): Promise<void> {
    await this.#voiceTransceiver()?.sender.replaceTrack(track);
  }

  #adoptChannel(channel: RTCDataChannel): void {
    this.#channel = channel;
    channel.addEventListener('message', (event) => this.#handlers.onData(String(event.data)));
    // Si ya estaba abierto al adoptarlo, el evento no volvera a saltar.
    if (channel.readyState === 'open') this.#handlers.onCanalListo();
    else channel.addEventListener('open', () => this.#handlers.onCanalListo());
  }

  /** Lo llama quien inicia: crea el canal de datos y manda la oferta. */
  async offer(): Promise<void> {
    this.#adoptChannel(this.#pc.createDataChannel(DATA_CHANNEL));
    // El hueco de voz lo reserva SOLO quien ofrece. Quien responde recibe el
    // suyo al aplicar la oferta; si lo creara por su cuenta acabaria con dos.
    this.#pc.addTransceiver('audio', { direction: 'sendrecv' });
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
        // Sin esto el audio quedaria en un solo sentido: ante una oferta
        // sendrecv, quien responde sin microfono contesta recvonly y ya no
        // podria hablar sin renegociar. Declararlo aqui, antes de responder,
        // deja los dos sentidos abiertos desde el principio.
        for (const transceiver of this.#pc.getTransceivers()) {
          if (transceiver.receiver.track?.kind === 'audio') {
            transceiver.direction = 'sendrecv';
          }
        }
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

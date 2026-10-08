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

/**
 * Cuanto se aguanta un parpadeo antes de dar la conexion por perdida.
 *
 * `disconnected` NO quiere decir que se haya caido: quiere decir que ahora
 * mismo no llegan paquetes. WebRTC se recupera solo de eso muy a menudo -un
 * salto de wifi a datos, un segundo de mala cobertura- y vuelve a `connected`
 * sin que nadie haga nada.
 *
 * Antes se trataba igual que `failed`, asi que un parpadeo de un segundo tiraba
 * el enlace entero y obligaba a rehacer la sala. Eso es lo que se veia como
 * "caidas repentinas del host".
 *
 * Ocho segundos: mas de lo que tarda ICE en recuperarse cuando va a hacerlo, y
 * poco para no dejar a nadie mirando una imagen congelada sin saber que pasa.
 * Mientras tanto se dice "conectando" y no "perdida", asi que la pantalla del
 * companero se queda puesta en vez de desaparecer.
 */
export const GRACIA_ANTES_DE_RENDIRSE_MS = 8000;

/**
 * Si ese estado es el final de verdad o solo un parpadeo.
 *
 * Esta aparte, y exportado, porque es LA decision que estaba mal: antes
 * `disconnected` contaba como caida y tiraba el enlace a la primera mala racha.
 * Una funcion suelta se puede probar sin montar una conexion de verdad, y por
 * tanto se puede fijar para que no vuelva a cambiarse sin querer.
 */
export const esCaidaDefinitiva = (estado: RTCPeerConnectionState): boolean =>
  estado === 'failed' || estado === 'closed';

export class PeerLink {
  readonly #pc: RTCPeerConnection;
  readonly #handlers: PeerHandlers;
  #channel: RTCDataChannel | null = null;
  /** Temporizador del parpadeo, si hay uno en marcha. */
  #gracia: ReturnType<typeof setTimeout> | null = null;

  constructor(handlers: PeerHandlers, localStream: MediaStream | null) {
    this.#handlers = handlers;
    this.#pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Anadimos nuestro video ANTES de negociar, para que la oferta o la
    // respuesta ya lo incluyan y la conexion sea bidireccional de una vez.
    if (localStream) {
      for (const track of localStream.getTracks()) {
        const emisor = this.#pc.addTrack(track, localStream);
        if (track.kind === 'video') void this.#ajustarVideo(emisor);
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
          // Si venia de un parpadeo, se recupero sola y no se entero nadie.
          this.#cancelarGracia();
          handlers.onState('conectada');
          break;
        case 'connecting':
        case 'new':
          this.#cancelarGracia();
          handlers.onState('conectando');
          break;

        // Un parpadeo: se le da tiempo a recuperarse antes de tirar nada.
        case 'disconnected':
          if (this.#gracia === null) {
            handlers.onState('conectando');
            this.#gracia = setTimeout(() => {
              this.#gracia = null;
              // Si en todo este rato no ha vuelto, ya no vuelve.
              if (this.#pc.connectionState !== 'connected') handlers.onState('perdida');
            }, GRACIA_ANTES_DE_RENDIRSE_MS);
          }
          break;

        // Estas dos si son el final: `failed` no se arregla sin renegociar y
        // `closed` es que la hemos cerrado nosotros. Ver `esCaidaDefinitiva`.
        case 'failed':
        case 'closed':
          this.#cancelarGracia();
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
  #cancelarGracia(): void {
    if (this.#gracia === null) return;
    clearTimeout(this.#gracia);
    this.#gracia = null;
  }

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

  /**
   * Le dice al emisor que lo primero son los fotogramas.
   *
   * Por omision, cuando la red aprieta el navegador baja el ritmo antes que la
   * resolucion. Aqui interesa lo contrario: la consola ya es de 240x160, asi
   * que hay poco que bajar, y lo que arruina ver jugar a alguien es el tiron.
   *
   * Se le pone ademas un techo de bitrate generoso para lo pequeña que es la
   * imagen: sin el, el navegador parte de muy abajo y tarda en subir.
   */
  async #ajustarVideo(emisor: RTCRtpSender): Promise<void> {
    try {
      const parametros = emisor.getParameters();
      parametros.degradationPreference = 'maintain-framerate';
      // getParameters puede volver sin encodings antes de negociar.
      parametros.encodings = parametros.encodings?.length ? parametros.encodings : [{}];
      for (const codificacion of parametros.encodings) {
        codificacion.maxBitrate = 2_500_000;
        codificacion.maxFramerate = 60;
      }
      await emisor.setParameters(parametros);
    } catch {
      // Si el navegador no deja tocarlos, se envia igual con lo que haya.
    }
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
      // Una respuesta solo vale si estamos esperando una. Al reconectar puede
      // llegar la respuesta a una oferta que ya no existe -la hizo el enlace
      // anterior-, y aplicarla reventaba la negociacion entera con un "Called
      // in wrong state: stable". Se ignora, igual que ya se ignoraba un
      // candidato que llega a destiempo: no es un fallo nuestro, es que ese
      // mensaje llego tarde.
      if (
        signal.description.type === 'answer' &&
        this.#pc.signalingState !== 'have-local-offer'
      ) {
        return;
      }
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
    // Sin esto, un enlace cerrado a proposito podia anunciarse como perdido
    // ocho segundos despues, ya con otro enlace en marcha.
    this.#cancelarGracia();
    this.#channel?.close();
    this.#pc.close();
  }
}

import { useCallback, useRef, useState } from 'react';
import {
  parsePeerMessage,
  type EquipoResumen,
  type PeerMessage,
  type RomFingerprint,
} from '@emupoke/protocol';
import { compareRoms, type RomCompatibility } from '@emupoke/pokemon';
import { PeerLink, type PeerState } from './peerLink';
import { SignalingClient } from './signalingClient';

export type SessionPhase =
  | 'sin-sala'
  | 'esperando-companero'
  | 'conectando'
  | 'conectada'
  | 'perdida';

export type MicState = 'apagado' | 'pidiendo' | 'encendido' | 'denegado';

export type VoiceState = {
  mic: MicState;
  micError: string | null;
  /** Voz del companero, separada del video de su partida. */
  partnerStream: MediaStream | null;
  /** Volumen al que le oimos, de 0 a 100. */
  partnerVolume: number;
  partnerMuted: boolean;
};

/** Intentos automaticos antes de dejarlo en manos del jugador. */
export const MAX_RECONNECT_ATTEMPTS = 3;

export type ReconnectState = {
  /** Cuantos intentos automaticos se llevan. */
  attempts: number;
  /** Si hay un intento en marcha ahora mismo. */
  trying: boolean;
  /** Se agotaron los intentos: toca pulsar el boton. */
  exhausted: boolean;
};

export type SessionState = {
  phase: SessionPhase;
  /** Codigo para dictarle al companero. */
  roomCode: string | null;
  /** true si somos quien creo la sala. */
  isHost: boolean;
  peerRom: RomFingerprint | null;
  compatibility: RomCompatibility | null;
  error: string | null;
  /** Video en directo de la partida del companero. */
  remoteStream: MediaStream | null;
  /** Contrasena que elegimos al crear la sala, para poder dictarla luego.
   *  Solo la tiene el anfitrion y no sale de este navegador. */
  password: string | null;
  voice: VoiceState;
  reconnect: ReconnectState;
  /**
   * El equipo del companero, tal y como lo tiene en su partida.
   *
   * Llega por el canal de datos cada vez que le cambia algo. Son numeros y
   * motes: el nombre de cada especie y su sprite los pone este lado con su
   * propia ROM, asi que por el cable no viaja nada del juego.
   */
  equipoCompanero: EquipoResumen | null;
  /**
   * Momento en que el canal de datos quedo listo, o null si no lo esta.
   *
   * Sirve de disparador: al cambiar, quien tenga algo que contar lo vuelve a
   * contar. Sin esto, el que ya estaba jugando no le mandaba su equipo al que
   * acababa de entrar, porque solo se manda cuando cambia algo.
   */
  canalListo: number | null;
};

const initialState: SessionState = {
  phase: 'sin-sala',
  roomCode: null,
  isHost: false,
  peerRom: null,
  compatibility: null,
  error: null,
  remoteStream: null,
  password: null,
  reconnect: { attempts: 0, trying: false, exhausted: false },
  voice: {
    mic: 'apagado',
    micError: null,
    partnerStream: null,
    partnerVolume: 80,
    partnerMuted: false,
  },
  equipoCompanero: null,
  canalListo: null,
};

/**
 * Fotogramas por segundo del video que enviamos.
 *
 * Tiene que ser los mismos que da la consola. Estuvo en 30 pensando que para
 * acompanar a alguien bastaba, y se midio: llegaban 29,3 por segundo sin que
 * se descartara practicamente ninguno por el camino. Es decir, la red iba
 * bien y lo que faltaba era la mitad de los fotogramas, que no se enviaban.
 * Y no se nota como "va a la mitad" sino como tirones, porque en estos juegos
 * el movimiento va por casillas y saltarse uno de cada dos se ve.
 */
const CAPTURE_FPS = 60;

export const useSession = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  romRef: React.RefObject<RomFingerprint | null>,
) => {
  const [state, setState] = useState<SessionState>(initialState);
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<PeerLink | null>(null);
  /** Momento del ultimo equipo que llego, para descartar los que lleguen tarde. */
  const ultimoEquipoRef = useRef<number | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  /** Quien esta pendiente de los mensajes del intercambio. */
  const oyentesDelTrato = useRef(new Set<(mensaje: PeerMessage) => void>());
  // La pista del microfono sobrevive a la conexion: si el companero se va y
  // vuelve, se reengancha al nuevo enlace sin volver a pedir permiso.
  const micTrackRef = useRef<MediaStreamTrack | null>(null);
  /**
   * Con que volver a entrar en la sala.
   *
   * Se guarda tambien la contrasena del invitado, que antes no se conservaba:
   * sin ella no se puede reconectar solo, y pedirsela otra vez a mitad de
   * partida es justo lo que se quiere evitar.
   */
  const credentialsRef = useRef<{ roomCode: string; password: string } | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Intentos consumidos, en una referencia y no en el estado.
   *
   * El contador se consulta y se incrementa desde fuera del render, y meterlo
   * en el actualizador de estado fue justo el fallo anterior: un actualizador
   * de React tiene que ser puro porque puede ejecutarse varias veces, y ahi
   * dentro habia un setTimeout que acababa programando intentos de mas.
   */
  const attemptsRef = useRef(0);
  /** Evita que una salida voluntaria dispare la reconexion. */
  const leftOnPurposeRef = useRef(false);
  /** Contrasena de la peticion en curso, hasta que el servidor confirma. */
  const pendingPasswordRef = useRef<string | null>(null);
  /**
   * Puente hacia la funcion de reconexion.
   *
   * Hace falta una referencia porque los manejadores de la senalizacion se
   * crean antes que ella y tienen que poder llamarla: sin el puente serian
   * dependencias circulares.
   */
  const reconnectRef = useRef<() => void>(() => {});

  const patch = useCallback((changes: Partial<SessionState>) => {
    setState((prev) => ({ ...prev, ...changes }));
  }, []);

  const patchVoice = useCallback((changes: Partial<VoiceState>) => {
    setState((prev) => ({ ...prev, voice: { ...prev.voice, ...changes } }));
  }, []);

  /** Captura el canvas del emulador como video. Se hace una sola vez y se
   *  reutiliza: recapturar crearia tracks duplicados. */
  const localStream = useCallback((): MediaStream | null => {
    if (localStreamRef.current) return localStreamRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return null;
    try {
      const captura = canvas.captureStream(CAPTURE_FPS);

      // Con esto el codificador sabe que esto es movimiento y no un documento:
      // ante un apuro prefiere bajar la nitidez antes que saltarse fotogramas,
      // que para ver jugar a alguien es justo lo que se quiere.
      for (const pista of captura.getVideoTracks()) pista.contentHint = 'motion';

      localStreamRef.current = captura;
      return localStreamRef.current;
    } catch {
      return null;
    }
  }, [canvasRef]);

  const startPeer = useCallback(
    (asOfferer: boolean) => {
      const signaling = signalingRef.current;
      if (!signaling) return;

      const peer = new PeerLink(
        {
          onRemoteStream: (stream) => patch({ remoteStream: stream }),
          onRemoteVoice: (stream) => patchVoice({ partnerStream: stream }),
          onState: (peerState: PeerState) => {
            if (peerState === 'conectada') patch({ phase: 'conectada' });
            if (peerState === 'perdida') {
              patch({ phase: 'perdida', remoteStream: null });
              // No basta con avisar: un enlace roto no se arregla solo, hay que
              // rehacer la negociacion volviendo a entrar en la sala.
              reconnectRef.current();
            }
          },
          onCanalListo: () => patch({ canalListo: Date.now() }),
          onData: (crudo) => {
            // Al otro lado hay un navegador que no controlamos: lo que no
            // cuadre se descarta y la partida sigue.
            const mensaje = parsePeerMessage(crudo);
            if (!mensaje) return;

            // Los del intercambio van a quien los este escuchando, y no al
            // estado. Un intercambio es una conversacion de varios pasos: si un
            // mensaje se guardara en una variable de estado, dos que llegaran
            // en el mismo instante se pisarian y el trato se quedaria colgado.
            if (mensaje.type !== 'equipo') {
              for (const oyente of oyentesDelTrato.current) oyente(mensaje);
              return;
            }

            // El canal de datos no garantiza el orden. Sin esta comprobacion,
            // un mensaje que llega tarde pisaria a uno mas nuevo y el equipo
            // del companero daria saltos atras.
            const anterior = ultimoEquipoRef.current;
            if (anterior !== null && mensaje.equipo.momento < anterior) return;
            ultimoEquipoRef.current = mensaje.equipo.momento;
            patch({ equipoCompanero: mensaje.equipo });
          },
          sendSignal: (data) => signaling.signal(data),
        },
        localStream(),
      );
      // Cerrar el anterior antes de sustituirlo: al reconectar llega uno nuevo
      // y dejar el viejo abierto mantiene camaras y micro tomados.
      peerRef.current?.close();
      peerRef.current = peer;
      // Si el microfono ya estaba encendido, se reengancha al enlace nuevo.
      if (micTrackRef.current) void peer.setVoiceTrack(micTrackRef.current);
      patch({ phase: 'conectando' });
      if (asOfferer) void peer.offer();
    },
    [localStream, patch, patchVoice],
  );

  const connectSignaling = useCallback(async (): Promise<SignalingClient> => {
    if (signalingRef.current) return signalingRef.current;

    const client = new SignalingClient({
      onRoomCreated: (roomCode) => {
        // Se guardan para poder volver a entrar solo si se cae el enlace.
        const password = pendingPasswordRef.current;
        if (password) credentialsRef.current = { roomCode, password };
        patch({ roomCode, isHost: true, phase: 'esperando-companero' });
      },
      onRoomJoined: (roomCode, peerRom) => {
        const password = pendingPasswordRef.current;
        if (password) credentialsRef.current = { roomCode, password };
        // Volver a entrar bien significa que la reconexion termino.
        attemptsRef.current = 0;
        patch({ reconnect: { attempts: 0, trying: false, exhausted: false } });
        const mine = romRef.current;
        patch({
          roomCode,
          isHost: false,
          peerRom,
          compatibility: mine ? compareRoms(mine, peerRom) : null,
        });
        // Quien entra espera la oferta del anfitrion.
        startPeer(false);
      },
      onPeerJoined: (peerRom) => {
        const mine = romRef.current;
        patch({ peerRom, compatibility: mine ? compareRoms(mine, peerRom) : null });
        // El anfitrion es quien inicia la negociacion.
        startPeer(true);
      },
      onPeerLeft: () => {
        peerRef.current?.close();
        peerRef.current = null;
        patch({ phase: 'esperando-companero', peerRom: null, remoteStream: null, compatibility: null });
      },
      onSignal: (data) => void peerRef.current?.accept(data),
      onError: (_code, message) => {
        // Un rechazo del servidor durante la vuelta no debe dejar la interfaz
        // diciendo "reconectando" para siempre: se ofrece el boton.
        setState((prev) => ({
          ...prev,
          error: message,
          reconnect: prev.reconnect.trying
            ? { attempts: attemptsRef.current, trying: false, exhausted: true }
            : prev.reconnect,
        }));
      },
      onDisconnected: () => {
        signalingRef.current = null;
        setState((prev) =>
          prev.phase === 'sin-sala' ? prev : { ...prev, phase: 'perdida', remoteStream: null },
        );
        reconnectRef.current();
      },
    });

    await client.connect();
    signalingRef.current = client;
    return client;
  }, [patch, romRef, startPeer]);

  const createRoom = useCallback(
    async (password: string, semilla: string | null = null) => {
      const rom = romRef.current;
      if (!rom) {
        patch({ error: 'Carga primero tu ROM: la sala necesita saber a que jugais.' });
        return;
      }
      patch({ error: null });
      leftOnPurposeRef.current = false;
      attemptsRef.current = 0;
      pendingPasswordRef.current = password;
      try {
        // La semilla se queda en la sala para que el enlace de invitacion sea
        // corto: quien lo abre la pide con el codigo en vez de llevarla dentro.
        (await connectSignaling()).createRoom(password, rom, semilla);
        patch({ password });
      } catch (err) {
        patch({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [connectSignaling, patch, romRef],
  );

  const joinRoom = useCallback(
    async (roomCode: string, password: string) => {
      const rom = romRef.current;
      if (!rom) {
        patch({ error: 'Carga primero tu ROM: hay que comprobar que jugais al mismo juego.' });
        return;
      }
      patch({ error: null });
      leftOnPurposeRef.current = false;
      attemptsRef.current = 0;
      pendingPasswordRef.current = password;
      try {
        (await connectSignaling()).joinRoom(roomCode, password, rom);
      } catch (err) {
        patch({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    [connectSignaling, patch, romRef],
  );

  /**
   * Enciende o apaga el microfono.
   *
   * La cancelacion de eco no es opcional: la voz del companero suena por los
   * altavoces y sin ella se le devuelve su propia voz con retraso.
   */
  const toggleMic = useCallback(async () => {
    const existing = micTrackRef.current;
    if (existing) {
      await peerRef.current?.setVoiceTrack(null);
      existing.stop();
      micTrackRef.current = null;
      patchVoice({ mic: 'apagado', micError: null });
      return;
    }

    patchVoice({ mic: 'pidiendo', micError: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      const track = stream.getAudioTracks()[0] ?? null;
      micTrackRef.current = track;
      await peerRef.current?.setVoiceTrack(track);
      patchVoice({ mic: 'encendido' });
    } catch (err) {
      patchVoice({
        mic: 'denegado',
        micError:
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'No has dado permiso para usar el microfono.'
            : 'No se pudo abrir el microfono.',
      });
    }
  }, [patchVoice]);

  const setPartnerVolume = useCallback(
    (percent: number) => patchVoice({ partnerVolume: percent }),
    [patchVoice],
  );

  const togglePartnerMute = useCallback(
    () => setState((prev) => ({ ...prev, voice: { ...prev.voice, partnerMuted: !prev.voice.partnerMuted } })),
    [],
  );

  /**
   * Vuelve a entrar en la sala con las credenciales guardadas.
   *
   * Se entra con join-room aunque uno fuera el anfitrion: al caerse el socket
   * el servidor libera su sitio y la sala sigue viva un rato, asi que volver a
   * entrar es el mismo camino para los dos.
   */
  const rejoin = useCallback(async (): Promise<boolean> => {
    const credentials = credentialsRef.current;
    const rom = romRef.current;
    if (!credentials || !rom) return false;

    peerRef.current?.close();
    peerRef.current = null;
    signalingRef.current?.close();
    signalingRef.current = null;

    try {
      pendingPasswordRef.current = credentials.password;
      const client = await connectSignaling();
      client.joinRoom(credentials.roomCode, credentials.password, rom);
      return true;
    } catch {
      return false;
    }
  }, [connectSignaling, romRef]);

  /**
   * Espera creciente entre intentos: 2, 4 y 8 segundos.
   *
   * Reintentar al instante no sirve de nada cuando lo que fallo es la red, y
   * ademas gasta los tres intentos en menos de un segundo.
   */
  const backoffMs = (attempt: number): number => 2000 * 2 ** attempt;

  const scheduleReconnect = useCallback(() => {
    if (leftOnPurposeRef.current || !credentialsRef.current) return;
    // Ya hay un intento esperando su turno.
    if (reconnectTimerRef.current) return;

    if (attemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      patch({
        reconnect: { attempts: attemptsRef.current, trying: false, exhausted: true },
      });
      return;
    }

    const attempt = attemptsRef.current;
    attemptsRef.current = attempt + 1;
    patch({ reconnect: { attempts: attempt + 1, trying: true, exhausted: false } });

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      void rejoin().then((ok) => {
        // Si salio bien, onRoomJoined pondra el contador a cero.
        if (ok) return;
        patch({ reconnect: { attempts: attemptsRef.current, trying: false, exhausted: false } });
        scheduleReconnectRef.current();
      });
    }, backoffMs(attempt));
  }, [patch, rejoin]);

  const scheduleReconnectRef = useRef<() => void>(() => {});
  scheduleReconnectRef.current = scheduleReconnect;
  reconnectRef.current = scheduleReconnect;

  /**
   * Reintento a mano, tras agotarse los automaticos.
   *
   * Cada pulsacion vale por un intento y no reanuda el bucle: si la red sigue
   * caida, insistir sola no ayuda y el jugador sabe mejor que nosotros cuando
   * ha vuelto.
   */
  const retryNow = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    attemptsRef.current = MAX_RECONNECT_ATTEMPTS;
    patch({ reconnect: { attempts: MAX_RECONNECT_ATTEMPTS, trying: true, exhausted: false } });
    void rejoin().then((ok) => {
      if (!ok) {
        patch({
          reconnect: { attempts: MAX_RECONNECT_ATTEMPTS, trying: false, exhausted: true },
        });
      }
    });
  }, [patch, rejoin]);

  const leave = useCallback(() => {
    // Marcar la salida como voluntaria antes de cerrar nada: si no, el cierre
    // del socket dispararia la reconexion automatica.
    leftOnPurposeRef.current = true;
    credentialsRef.current = null;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    peerRef.current?.close();
    peerRef.current = null;
    signalingRef.current?.close();
    signalingRef.current = null;
    // Soltar el microfono al salir: dejarlo abierto encendería el indicador
    // del navegador sin que nadie escuche.
    micTrackRef.current?.stop();
    micTrackRef.current = null;
    setState(initialState);
  }, []);

  /**
   * Le manda al companero como va tu equipo.
   *
   * Si el canal no esta abierto no pasa nada: se pierde ese aviso y el
   * siguiente cambio mandara el estado completo otra vez, que es lo que hay en
   * ese momento. No hace falta cola ni reintentos para esto.
   */
  const enviarEquipo = useCallback((equipo: EquipoResumen) => {
    peerRef.current?.send(JSON.stringify({ type: 'equipo', equipo }));
  }, []);

  /**
   * Manda un mensaje del intercambio.
   *
   * Devuelve si se pudo mandar, al reves que `enviarEquipo`. Ahi dar un aviso
   * por perdido no cuesta nada porque el siguiente lo repite; aqui un mensaje
   * que no sale deja al otro esperando, y quien lo manda tiene que enterarse.
   */
  const enviarDelTrato = useCallback((mensaje: PeerMessage): boolean => {
    const peer = peerRef.current;
    if (!peer) return false;
    try {
      peer.send(JSON.stringify(mensaje));
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Se apunta a los mensajes del intercambio. Devuelve como darse de baja. */
  const escucharTrato = useCallback((oyente: (mensaje: PeerMessage) => void) => {
    oyentesDelTrato.current.add(oyente);
    return () => {
      oyentesDelTrato.current.delete(oyente);
    };
  }, []);

  return {
    state,
    enviarEquipo,
    enviarDelTrato,
    escucharTrato,
    createRoom,
    joinRoom,
    leave,
    retryNow,
    toggleMic,
    setPartnerVolume,
    togglePartnerMute,
  };
};

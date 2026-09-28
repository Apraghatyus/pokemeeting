import { useCallback, useRef, useState } from 'react';
import type { RomFingerprint } from '@emupoke/protocol';
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
  voice: {
    mic: 'apagado',
    micError: null,
    partnerStream: null,
    partnerVolume: 80,
    partnerMuted: false,
  },
};

/** Fotogramas por segundo del video que enviamos. El GBA corre a 60, pero para
 *  acompanar a alguien 30 basta y consume la mitad de ancho de banda. */
const CAPTURE_FPS = 30;

export const useSession = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  romRef: React.RefObject<RomFingerprint | null>,
) => {
  const [state, setState] = useState<SessionState>(initialState);
  const signalingRef = useRef<SignalingClient | null>(null);
  const peerRef = useRef<PeerLink | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  // La pista del microfono sobrevive a la conexion: si el companero se va y
  // vuelve, se reengancha al nuevo enlace sin volver a pedir permiso.
  const micTrackRef = useRef<MediaStreamTrack | null>(null);

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
      localStreamRef.current = canvas.captureStream(CAPTURE_FPS);
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
            if (peerState === 'perdida') patch({ phase: 'perdida', remoteStream: null });
          },
          onData: () => {
            // Aqui entraran los eventos de Soul Link y los intercambios.
          },
          sendSignal: (data) => signaling.signal(data),
        },
        localStream(),
      );
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
      onRoomCreated: (roomCode) => patch({ roomCode, isHost: true, phase: 'esperando-companero' }),
      onRoomJoined: (roomCode, peerRom) => {
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
      onError: (_code, message) => patch({ error: message }),
      onDisconnected: () => {
        signalingRef.current = null;
        setState((prev) =>
          prev.phase === 'sin-sala' ? prev : { ...prev, phase: 'perdida', remoteStream: null },
        );
      },
    });

    await client.connect();
    signalingRef.current = client;
    return client;
  }, [patch, romRef, startPeer]);

  const createRoom = useCallback(
    async (password: string) => {
      const rom = romRef.current;
      if (!rom) {
        patch({ error: 'Carga primero tu ROM: la sala necesita saber a que jugais.' });
        return;
      }
      patch({ error: null });
      try {
        (await connectSignaling()).createRoom(password, rom);
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

  const leave = useCallback(() => {
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

  return { state, createRoom, joinRoom, leave, toggleMic, setPartnerVolume, togglePartnerMute };
};

import { useCallback, useRef, useState } from 'react';
import { compareRoms, type RomCompatibility, type RomFingerprint } from '@emupoke/protocol';
import { PeerLink, type PeerState } from './peerLink';
import { SignalingClient } from './signalingClient';

export type SessionPhase =
  | 'sin-sala'
  | 'esperando-companero'
  | 'conectando'
  | 'conectada'
  | 'perdida';

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

  const patch = useCallback((changes: Partial<SessionState>) => {
    setState((prev) => ({ ...prev, ...changes }));
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
      patch({ phase: 'conectando' });
      if (asOfferer) void peer.offer();
    },
    [localStream, patch],
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

  const leave = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    signalingRef.current?.close();
    signalingRef.current = null;
    setState(initialState);
  }, []);

  return { state, createRoom, joinRoom, leave };
};

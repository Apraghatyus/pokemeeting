// La sala, igual que en la web: el servidor presenta a los dos y se aparta, y
// el equipo viaja directo de un telefono al otro por WebRTC.
//
// Habla EXACTAMENTE el mismo protocolo que la web (packages/protocol), asi que
// se puede jugar con alguien que este en el navegador. No reutiliza el codigo
// de la web porque aquel lee la configuracion de Vite, que aqui no existe;
// el orden de los pasos es el mismo y esta explicado alli, en
// apps/web/src/net/peerLink.ts.
//
// En esta primera version no se manda ni la pantalla ni la voz: solo el equipo,
// que es lo que hace funcionar el Soul Link. La pantalla del otro si se recibe.

import {useCallback, useEffect, useRef, useState} from 'react';
import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import {
  parsePeerMessage,
  type ClientMessage,
  type EquipoResumen,
  type RomFingerprint,
  type ServerMessage,
} from '@emupoke/protocol';

/** El servidor de salas de produccion. */
export const URL_SALAS = 'wss://emupoke.aguaquim.com/signaling';

const ICE = [{urls: 'stun:stun.l.google.com:19302'}];
const CANAL = 'emupoke';

export type FaseDeSala = 'sin-sala' | 'esperando' | 'conectando' | 'conectada' | 'perdida';

export type EstadoDeSala = {
  fase: FaseDeSala;
  codigo: string | null;
  error: string | null;
  companero: string | null;
  equipoCompanero: EquipoResumen | null;
  /** Si al companero su juego le ha cantado la derrota. Ver la web. */
  companeroPerdio: boolean;
  /** Su pantalla, si la manda. */
  pantallaCompanero: MediaStream | null;
};

const INICIAL: EstadoDeSala = {
  fase: 'sin-sala',
  codigo: null,
  error: null,
  companero: null,
  equipoCompanero: null,
  companeroPerdio: false,
  pantallaCompanero: null,
};

type Señal =
  | {kind: 'description'; description: {type: string; sdp: string}}
  | {kind: 'candidate'; candidate: unknown};

const MENSAJES_DE_ERROR: Record<string, string> = {
  'sala-no-encontrada': 'No existe esa sala. Revisa el codigo.',
  'contrasena-incorrecta': 'La contraseña no es esa.',
  'sala-llena': 'La sala ya tiene dos jugadores.',
  'rom-incompatible': 'Tu juego no es compatible con el de la sala.',
};

export const useSala = (rom: RomFingerprint | null) => {
  const [estado, setEstado] = useState<EstadoDeSala>(INICIAL);
  const socket = useRef<WebSocket | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const canal = useRef<ReturnType<RTCPeerConnection['createDataChannel']> | null>(null);
  const ultimoEquipo = useRef<number | null>(null);

  const cambiar = useCallback((c: Partial<EstadoDeSala>) => setEstado(e => ({...e, ...c})), []);

  const mandarAlServidor = (mensaje: ClientMessage) => socket.current?.send(JSON.stringify(mensaje));

  const adoptarCanal = useCallback(
    (c: NonNullable<typeof canal.current>) => {
      canal.current = c;
      c.onmessage = (e: unknown) => {
        const mensaje = parsePeerMessage(String((e as {data: unknown}).data));
        if (!mensaje || mensaje.type !== 'equipo') return;
        // El canal no garantiza el orden: lo viejo no pisa a lo nuevo.
        if (ultimoEquipo.current !== null && mensaje.equipo.momento < ultimoEquipo.current) return;
        ultimoEquipo.current = mensaje.equipo.momento;
        cambiar({
          equipoCompanero: mensaje.equipo,
          ...(mensaje.perdio ? {companeroPerdio: true} : {}),
        });
      };
    },
    [cambiar],
  );

  const empezarEnlace = useCallback(
    async (ofrece: boolean) => {
      pc.current?.close();
      const enlace = new RTCPeerConnection({iceServers: ICE});
      pc.current = enlace;

      // Los eventos se escuchan con las propiedades on*: los tipos de
      // react-native-webrtc no declaran addEventListener, aunque exista.
      enlace.onicecandidate = (e: unknown) => {
        const {candidate} = e as {candidate: {toJSON(): unknown} | null};
        if (candidate) {
          mandarAlServidor({type: 'signal', data: {kind: 'candidate', candidate: candidate.toJSON()}});
        }
      };
      enlace.ontrack = (e: unknown) => {
        const {track, streams} = e as {track: {kind: string}; streams: MediaStream[]};
        if (track.kind === 'video' && streams[0]) cambiar({pantallaCompanero: streams[0]});
      };
      enlace.onconnectionstatechange = () => {
        const s = enlace.connectionState;
        if (s === 'connected') cambiar({fase: 'conectada'});
        if (s === 'failed' || s === 'closed') cambiar({fase: 'perdida', pantallaCompanero: null});
      };
      enlace.ondatachannel = (e: unknown) =>
        adoptarCanal((e as {channel: NonNullable<typeof canal.current>}).channel);

      cambiar({fase: 'conectando'});
      if (!ofrece) return;

      adoptarCanal(enlace.createDataChannel(CANAL));
      // Sin pantalla ni micro propios todavia, pero si se quiere RECIBIR la
      // del otro: los huecos se piden aqui, que es quien ofrece.
      enlace.addTransceiver('audio', {direction: 'recvonly'});
      enlace.addTransceiver('video', {direction: 'recvonly'});
      const oferta = await enlace.createOffer({});
      await enlace.setLocalDescription(oferta);
      mandarAlServidor({type: 'signal', data: {kind: 'description', description: oferta}});
    },
    [adoptarCanal, cambiar],
  );

  const recibirSeñal = useCallback(async (datos: unknown) => {
    const enlace = pc.current;
    const señal = datos as Señal;
    if (!enlace) return;
    if (señal?.kind === 'description') {
      if (señal.description.type === 'answer' && enlace.signalingState !== 'have-local-offer') return;
      await enlace.setRemoteDescription(new RTCSessionDescription(señal.description));
      if (señal.description.type === 'offer') {
        const respuesta = await enlace.createAnswer();
        await enlace.setLocalDescription(respuesta);
        mandarAlServidor({type: 'signal', data: {kind: 'description', description: respuesta}});
      }
    } else if (señal?.kind === 'candidate') {
      await enlace.addIceCandidate(new RTCIceCandidate(señal.candidate as never)).catch(() => {});
    }
  }, []);

  const conectar = useCallback(
    (primerMensaje: ClientMessage) => {
      socket.current?.close();
      const ws = new WebSocket(URL_SALAS);
      socket.current = ws;
      cambiar({...INICIAL, fase: 'esperando'});
      ws.onopen = () => ws.send(JSON.stringify(primerMensaje));
      ws.onerror = () => cambiar({error: 'No se pudo hablar con el servidor de salas.', fase: 'sin-sala'});
      ws.onmessage = evento => {
        let m: ServerMessage;
        try {
          m = JSON.parse(String(evento.data)) as ServerMessage;
        } catch {
          return;
        }
        switch (m.type) {
          case 'room-created':
            cambiar({codigo: m.roomCode});
            break;
          case 'room-joined':
            // Quien entra espera la oferta del anfitrion.
            cambiar({codigo: m.roomCode, companero: m.peerNombre ?? null});
            void empezarEnlace(false);
            break;
          case 'peer-joined':
            cambiar({companero: m.peerNombre ?? null});
            void empezarEnlace(true);
            break;
          case 'peer-left':
            pc.current?.close();
            cambiar({fase: 'esperando', equipoCompanero: null, pantallaCompanero: null});
            break;
          case 'signal':
            void recibirSeñal(m.data);
            break;
          case 'error':
            cambiar({error: MENSAJES_DE_ERROR[m.code] ?? m.message, fase: 'sin-sala'});
            break;
        }
      };
    },
    [cambiar, empezarEnlace, recibirSeñal],
  );

  const crear = useCallback(
    (clave: string, nombre: string | null) => {
      if (!rom) return;
      conectar({type: 'create-room', password: clave, rom, semilla: null, nombre});
    },
    [conectar, rom],
  );

  const unirse = useCallback(
    (codigo: string, clave: string, nombre: string | null) => {
      if (!rom) return;
      conectar({type: 'join-room', roomCode: codigo.trim().toUpperCase(), password: clave, rom, nombre});
    },
    [conectar, rom],
  );

  const salir = useCallback(() => {
    socket.current?.send(JSON.stringify({type: 'leave'} satisfies ClientMessage));
    socket.current?.close();
    pc.current?.close();
    socket.current = null;
    pc.current = null;
    canal.current = null;
    ultimoEquipo.current = null;
    setEstado(INICIAL);
  }, []);

  /** Le manda al companero como va tu equipo. Sin canal abierto no pasa nada. */
  const enviarEquipo = useCallback((equipo: EquipoResumen, perdio: boolean) => {
    if (canal.current?.readyState !== 'open') return;
    canal.current.send(JSON.stringify({type: 'equipo', equipo, perdio}));
  }, []);

  useEffect(() => salir, [salir]);

  return {estado, crear, unirse, salir, enviarEquipo};
};

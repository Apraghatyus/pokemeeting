// La sala, igual que en la web: el servidor presenta a los dos y se aparta, y
// lo demas viaja directo de un telefono al otro por WebRTC.
//
// Habla EXACTAMENTE el mismo protocolo que la web (packages/protocol), asi que
// se puede jugar con alguien que este en el navegador. No reutiliza el codigo
// de la web porque aquel usa las APIs del navegador; el orden de los pasos es
// el mismo y esta explicado alli, en apps/web/src/net/peerLink.ts y
// apps/web/src/net/useSession.ts.
//
// Lo que se manda:
//   - LA PANTALLA del emulador, 240x160, como pista de video. Sale del propio
//     emulador (ver PistaDelEmulador.kt), no de grabar la pantalla del movil.
//   - LA VOZ, si se enciende el microfono. El hueco de audio se negocia
//     siempre, asi que encenderlo no obliga a renegociar.
//   - Por el canal de datos, todo lo demas: equipo, mapa, Soul Link, motes e
//     intercambios.
//
// Y si se cae el enlace, se vuelve a entrar solo en la sala: tres intentos con
// espera creciente, y despues un boton para reintentar a mano.

import {useCallback, useEffect, useRef, useState} from 'react';
import {PermissionsAndroid} from 'react-native';
import {
  mediaDevices,
  MediaStream,
  MediaStreamTrack,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from 'react-native-webrtc';
import {
  parsePeerMessage,
  type ClientMessage,
  type EquipoResumen,
  type MapaCompartido,
  type PeerMessage,
  type RomFingerprint,
  type ServerMessage,
} from '@emupoke/protocol';
import {Mgba} from './nativo';

/** El servidor de salas de produccion. */
export const URL_SALAS = 'wss://emupoke.aguaquim.com/signaling';

const ICE = [{urls: 'stun:stun.l.google.com:19302'}];
const CANAL = 'emupoke';
/** Reintentos automaticos al caerse, como en la web. */
export const MAX_REINTENTOS = 3;
/** Lo que se espera a que un parpadeo se arregle solo antes de darlo por caido. */
const GRACIA_MS = 6000;

export type FaseDeSala = 'sin-sala' | 'esperando' | 'conectando' | 'conectada' | 'perdida';

export type EstadoDeSala = {
  fase: FaseDeSala;
  codigo: string | null;
  error: string | null;
  companero: string | null;
  /** Su cuenta, comprobada por el servidor, o null si entro sin cuenta. */
  usuarioCompanero: string | null;
  equipoCompanero: EquipoResumen | null;
  /** Si al companero su juego le ha cantado la derrota. Ver la web. */
  companeroPerdio: boolean;
  /** Su pantalla, si la manda. */
  pantallaCompanero: MediaStream | null;
  /** Si ha apagado el envio de su pantalla. */
  companeroSinVideo: boolean;
  /** Donde anda y que zonas ha gastado. */
  mapaCompanero: MapaCompartido | null;
  /** Lo ultimo que dijo sobre hacer la partida Soul Link. */
  soullinkCompanero: {activo: boolean; momento: number} | null;
  /** El ultimo mote que cambio, para su pareja de aqui. */
  moteCompanero: {antes: string; nuevo: string; momento: number} | null;
  /** Momento en que el canal de datos quedo listo: al cambiar, se vuelve a contar todo. */
  canalListo: number | null;
  reconexion: {intentos: number; intentando: boolean; agotada: boolean};
  /** Microfono propio: apagado, pidiendo permiso, encendido o denegado. */
  micro: 'apagado' | 'pidiendo' | 'encendido' | 'denegado';
  /** Si se ha silenciado la voz del companero. */
  companeroSilenciado: boolean;
  /** Si este telefono manda su pantalla. */
  enviandoVideo: boolean;
};

const INICIAL: EstadoDeSala = {
  fase: 'sin-sala',
  codigo: null,
  error: null,
  companero: null,
  usuarioCompanero: null,
  equipoCompanero: null,
  companeroPerdio: false,
  pantallaCompanero: null,
  companeroSinVideo: false,
  mapaCompanero: null,
  soullinkCompanero: null,
  moteCompanero: null,
  canalListo: null,
  reconexion: {intentos: 0, intentando: false, agotada: false},
  micro: 'apagado',
  companeroSilenciado: false,
  enviandoVideo: true,
};

type Señal =
  | {kind: 'description'; description: {type: string; sdp: string}}
  | {kind: 'candidate'; candidate: unknown};

const MENSAJES_DE_ERROR: Record<string, string> = {
  'sala-no-encontrada': 'No existe esa sala. Revisa el codigo.',
  'contrasena-incorrecta': 'La contraseña no es esa.',
  'sala-llena': 'La sala ya tiene dos jugadores.',
  'rom-incompatible': 'Tu juego no es compatible con el de la sala.',
  'demasiados-intentos': 'Demasiados intentos fallidos. Pide que creen otra sala.',
};

type Canal = ReturnType<RTCPeerConnection['createDataChannel']>;
type Emisor = ReturnType<RTCPeerConnection['addTrack']>;

/** Espera creciente entre intentos: 2, 4 y 8 segundos. */
const espera = (intento: number) => 2000 * 2 ** intento;

export const useSala = (rom: RomFingerprint | null) => {
  const [estado, setEstado] = useState<EstadoDeSala>(INICIAL);
  const socket = useRef<WebSocket | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const canal = useRef<Canal | null>(null);
  const ultimoEquipo = useRef<number | null>(null);
  /** Con que se entro, para volver a entrar si se cae. */
  const credenciales = useRef<{codigo: string; clave: string; nombre: string | null} | null>(null);
  const salidaVoluntaria = useRef(false);
  const intentos = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gracia = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** La pantalla del emulador, creada una vez y reutilizada en cada enlace. */
  const pantallaPropia = useRef<MediaStream | null>(null);
  const emisorVideo = useRef<Emisor | null>(null);
  const enviarVideo = useRef(true);
  const microPista = useRef<MediaStreamTrack | null>(null);
  const silenciado = useRef(false);
  const vozCompanero = useRef<MediaStreamTrack | null>(null);
  /** Quien escucha los mensajes del intercambio. */
  const oyentesDelTrato = useRef(new Set<(m: PeerMessage) => void>());
  const reconectarRef = useRef<() => void>(() => {});

  const cambiar = useCallback((c: Partial<EstadoDeSala>) => setEstado(e => ({...e, ...c})), []);

  const mandarAlServidor = (mensaje: ClientMessage) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(mensaje));
  };

  /** Manda algo por el canal de datos. Devuelve si salio. */
  const enviar = useCallback((mensaje: PeerMessage): boolean => {
    if (canal.current?.readyState !== 'open') return false;
    try {
      canal.current.send(JSON.stringify(mensaje));
      return true;
    } catch {
      return false;
    }
  }, []);

  const recibir = useCallback(
    (crudo: string) => {
      const mensaje = parsePeerMessage(crudo);
      if (!mensaje) return;
      switch (mensaje.type) {
        case 'equipo':
          // El canal no garantiza el orden: lo viejo no pisa a lo nuevo.
          if (ultimoEquipo.current !== null && mensaje.equipo.momento < ultimoEquipo.current) return;
          ultimoEquipo.current = mensaje.equipo.momento;
          cambiar({
            equipoCompanero: mensaje.equipo,
            ...(mensaje.perdio ? {companeroPerdio: true} : {}),
          });
          return;
        case 'video':
          cambiar({companeroSinVideo: !mensaje.enviando});
          return;
        case 'mapa':
          cambiar({mapaCompanero: mensaje.mapa});
          return;
        case 'soullink':
          cambiar({soullinkCompanero: {activo: mensaje.activo, momento: Date.now()}});
          return;
        case 'mote':
          cambiar({moteCompanero: {antes: mensaje.antes, nuevo: mensaje.nuevo, momento: Date.now()}});
          return;
        default:
          // Lo del intercambio va a quien lo escuche: es una conversacion de
          // varios pasos y no puede pisarse en una variable de estado.
          for (const oyente of oyentesDelTrato.current) oyente(mensaje);
      }
    },
    [cambiar],
  );

  const adoptarCanal = useCallback(
    (c: Canal) => {
      canal.current = c;
      c.onmessage = (e: unknown) => recibir(String((e as {data: unknown}).data));
      const listo = () => {
        cambiar({canalListo: Date.now()});
        // Se dice siempre al abrir: quien acaba de entrar no sabe si el otro
        // tenia la pantalla apagada.
        enviar({type: 'video', enviando: enviarVideo.current});
      };
      if (c.readyState === 'open') listo();
      else c.onopen = listo;
    },
    [cambiar, enviar, recibir],
  );

  /** La pantalla del emulador, creada la primera vez que hace falta. */
  const pantalla = async (): Promise<MediaStream | null> => {
    if (pantallaPropia.current) return pantallaPropia.current;
    try {
      const {streamId, track} = await Mgba.pistaDePantalla();
      pantallaPropia.current = new MediaStream({
        streamId,
        streamReactTag: streamId,
        tracks: [track as never],
      } as never);
      return pantallaPropia.current;
    } catch {
      // Sin pantalla propia se juega igual: el otro vera el aviso.
      return null;
    }
  };

  /** El hueco de la voz: el transceptor de audio negociado. */
  const huecoDeVoz = () =>
    pc.current
      ?.getTransceivers()
      .find(t => t.receiver.track?.kind === 'audio');

  const cancelarGracia = () => {
    if (gracia.current) clearTimeout(gracia.current);
    gracia.current = null;
  };

  const empezarEnlace = useCallback(
    async (ofrece: boolean) => {
      cancelarGracia();
      pc.current?.close();
      const enlace = new RTCPeerConnection({iceServers: ICE});
      pc.current = enlace;
      emisorVideo.current = null;

      // La pantalla propia va ANTES de negociar, para que la oferta o la
      // respuesta ya la lleven: asi la conexion es de ida y vuelta de una vez.
      const propia = await pantalla();
      const video = propia?.getVideoTracks()[0];
      if (propia && video) {
        emisorVideo.current = enlace.addTrack(video, propia);
        if (!enviarVideo.current) void emisorVideo.current.replaceTrack(null);
      }

      // Los eventos se escuchan con las propiedades on*: los tipos de
      // react-native-webrtc no declaran addEventListener, aunque exista.
      enlace.onicecandidate = (e: unknown) => {
        const {candidate} = e as {candidate: {toJSON(): unknown} | null};
        if (candidate) {
          mandarAlServidor({type: 'signal', data: {kind: 'candidate', candidate: candidate.toJSON()}});
        }
      };
      enlace.ontrack = (e: unknown) => {
        const {track, streams} = e as {track: MediaStreamTrack; streams: MediaStream[]};
        if (track.kind === 'audio') {
          vozCompanero.current = track;
          track.enabled = !silenciado.current;
          return;
        }
        if (streams[0]) cambiar({pantallaCompanero: streams[0]});
      };
      enlace.onconnectionstatechange = () => {
        const s = enlace.connectionState;
        if (s === 'connected') {
          cancelarGracia();
          intentos.current = 0;
          cambiar({fase: 'conectada', reconexion: {intentos: 0, intentando: false, agotada: false}});
        } else if (s === 'disconnected') {
          // Un parpadeo: se le da tiempo antes de tirar nada.
          if (!gracia.current) {
            cambiar({fase: 'conectando'});
            gracia.current = setTimeout(() => {
              gracia.current = null;
              if (pc.current === enlace && enlace.connectionState !== 'connected') {
                cambiar({fase: 'perdida', pantallaCompanero: null});
                reconectarRef.current();
              }
            }, GRACIA_MS);
          }
        } else if (s === 'failed') {
          cancelarGracia();
          cambiar({fase: 'perdida', pantallaCompanero: null});
          reconectarRef.current();
        }
      };
      enlace.ondatachannel = (e: unknown) => adoptarCanal((e as {channel: Canal}).channel);

      cambiar({fase: 'conectando'});
      if (!ofrece) return;

      adoptarCanal(enlace.createDataChannel(CANAL));
      // El hueco de voz lo reserva SOLO quien ofrece; quien responde recibe el
      // suyo al aplicar la oferta. Como en la web.
      enlace.addTransceiver('audio', {direction: 'sendrecv'});
      if (!video) enlace.addTransceiver('video', {direction: 'recvonly'});
      const oferta = await enlace.createOffer({});
      await enlace.setLocalDescription(oferta);
      mandarAlServidor({type: 'signal', data: {kind: 'description', description: oferta}});
      if (microPista.current) await huecoDeVoz()?.sender.replaceTrack(microPista.current);
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
        // Sin esto la voz quedaria en un solo sentido. Ver la web.
        for (const t of enlace.getTransceivers()) {
          if (t.receiver.track?.kind === 'audio') t.direction = 'sendrecv';
        }
        if (microPista.current) await huecoDeVoz()?.sender.replaceTrack(microPista.current);
        const respuesta = await enlace.createAnswer();
        await enlace.setLocalDescription(respuesta);
        mandarAlServidor({type: 'signal', data: {kind: 'description', description: respuesta}});
      }
    } else if (señal?.kind === 'candidate') {
      await enlace.addIceCandidate(new RTCIceCandidate(señal.candidate as never)).catch(() => {});
    }
  }, []);

  const conectar = useCallback(
    (primerMensaje: ClientMessage, alVolver = false) => {
      socket.current?.close();
      const ws = new WebSocket(URL_SALAS);
      socket.current = ws;
      if (!alVolver) cambiar({...INICIAL, fase: 'esperando', enviandoVideo: enviarVideo.current});
      ws.onopen = () => ws.send(JSON.stringify(primerMensaje));
      ws.onerror = () => {
        if (alVolver) return;
        cambiar({error: 'No se pudo hablar con el servidor de salas.', fase: 'sin-sala'});
      };
      ws.onclose = () => {
        // Un cierre que no pedimos es una caida: se vuelve a entrar.
        if (socket.current === ws && !salidaVoluntaria.current && credenciales.current) {
          reconectarRef.current();
        }
      };
      ws.onmessage = evento => {
        let m: ServerMessage;
        try {
          m = JSON.parse(String(evento.data)) as ServerMessage;
        } catch {
          return;
        }
        switch (m.type) {
          case 'room-created':
            if (credenciales.current) credenciales.current.codigo = m.roomCode;
            cambiar({codigo: m.roomCode});
            break;
          case 'room-joined':
            // Quien entra espera la oferta del anfitrion.
            intentos.current = 0;
            cambiar({
              codigo: m.roomCode,
              companero: m.peerNombre ?? null,
              usuarioCompanero: m.peerUsuario ?? null,
              reconexion: {intentos: 0, intentando: false, agotada: false},
            });
            void empezarEnlace(false);
            break;
          case 'peer-joined':
            cambiar({companero: m.peerNombre ?? null, usuarioCompanero: m.peerUsuario ?? null});
            void empezarEnlace(true);
            break;
          case 'peer-left':
            cancelarGracia();
            pc.current?.close();
            pc.current = null;
            cambiar({fase: 'esperando', equipoCompanero: null, pantallaCompanero: null, canalListo: null});
            break;
          case 'signal':
            void recibirSeñal(m.data);
            break;
          case 'error':
            if (alVolver && m.code === 'sala-no-encontrada') {
              // La sala ya no existe: no hay a donde volver.
              credenciales.current = null;
            }
            cambiar({error: MENSAJES_DE_ERROR[m.code] ?? m.message, fase: 'sin-sala'});
            break;
        }
      };
    },
    [cambiar, empezarEnlace, recibirSeñal],
  );

  /** Vuelve a entrar en la sala con lo que se entro. Igual para anfitrion e invitado. */
  const volverAEntrar = useCallback(() => {
    const c = credenciales.current;
    if (!c || !rom) return false;
    pc.current?.close();
    pc.current = null;
    conectar({type: 'join-room', roomCode: c.codigo, password: c.clave, rom, nombre: c.nombre}, true);
    return true;
  }, [conectar, rom]);

  const reconectar = useCallback(() => {
    if (salidaVoluntaria.current || !credenciales.current || temporizador.current) return;
    if (intentos.current >= MAX_REINTENTOS) {
      cambiar({reconexion: {intentos: intentos.current, intentando: false, agotada: true}});
      return;
    }
    const intento = intentos.current;
    intentos.current = intento + 1;
    cambiar({reconexion: {intentos: intento + 1, intentando: true, agotada: false}});
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      if (!volverAEntrar()) reconectarRef.current();
    }, espera(intento));
  }, [cambiar, volverAEntrar]);
  reconectarRef.current = reconectar;

  /** Reintento a mano, cuando se agotaron los automaticos. */
  const reintentar = useCallback(() => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    intentos.current = MAX_REINTENTOS;
    cambiar({reconexion: {intentos: MAX_REINTENTOS, intentando: true, agotada: false}});
    if (!volverAEntrar()) {
      cambiar({reconexion: {intentos: MAX_REINTENTOS, intentando: false, agotada: true}});
    }
  }, [cambiar, volverAEntrar]);

  const crear = useCallback(
    (clave: string, nombre: string | null, semilla: string | null = null) => {
      if (!rom) return;
      salidaVoluntaria.current = false;
      intentos.current = 0;
      credenciales.current = {codigo: '', clave, nombre};
      conectar({type: 'create-room', password: clave, rom, semilla, nombre});
    },
    [conectar, rom],
  );

  const unirse = useCallback(
    (codigo: string, clave: string, nombre: string | null) => {
      if (!rom) return;
      salidaVoluntaria.current = false;
      intentos.current = 0;
      const limpio = codigo.trim().toUpperCase();
      credenciales.current = {codigo: limpio, clave, nombre};
      conectar({type: 'join-room', roomCode: limpio, password: clave, rom, nombre});
    },
    [conectar, rom],
  );

  const salir = useCallback(() => {
    salidaVoluntaria.current = true;
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    cancelarGracia();
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({type: 'leave'} satisfies ClientMessage));
    }
    socket.current?.close();
    pc.current?.close();
    socket.current = null;
    pc.current = null;
    canal.current = null;
    credenciales.current = null;
    ultimoEquipo.current = null;
    setEstado(e => ({...INICIAL, micro: e.micro, enviandoVideo: e.enviandoVideo}));
  }, []);

  /** Le manda al companero como va tu equipo. Sin canal abierto no pasa nada. */
  const enviarEquipo = useCallback(
    (equipo: EquipoResumen, perdio: boolean) => void enviar({type: 'equipo', equipo, perdio}),
    [enviar],
  );

  /** Enciende o apaga el microfono. Pide permiso la primera vez. */
  const cambiarMicro = useCallback(async () => {
    if (microPista.current) {
      microPista.current.stop();
      microPista.current = null;
      await huecoDeVoz()?.sender.replaceTrack(null);
      cambiar({micro: 'apagado'});
      return;
    }
    cambiar({micro: 'pidiendo'});
    const permiso = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (permiso !== PermissionsAndroid.RESULTS.GRANTED) {
      cambiar({micro: 'denegado'});
      return;
    }
    try {
      const voz = await mediaDevices.getUserMedia({audio: true, video: false});
      const pista = voz.getAudioTracks()[0] ?? null;
      microPista.current = pista;
      if (pista) await huecoDeVoz()?.sender.replaceTrack(pista);
      cambiar({micro: pista ? 'encendido' : 'apagado'});
    } catch {
      cambiar({micro: 'denegado'});
    }
  }, [cambiar]);

  /** Silencia o vuelve a oir al companero. */
  const cambiarSilencio = useCallback(() => {
    silenciado.current = !silenciado.current;
    if (vozCompanero.current) vozCompanero.current.enabled = !silenciado.current;
    cambiar({companeroSilenciado: silenciado.current});
  }, [cambiar]);

  /** Manda o deja de mandar la pantalla, para un movil que no da abasto. */
  const cambiarEnvioDeVideo = useCallback(
    (si: boolean) => {
      enviarVideo.current = si;
      const pista = pantallaPropia.current?.getVideoTracks()[0] ?? null;
      void emisorVideo.current?.replaceTrack(si ? pista : null);
      enviar({type: 'video', enviando: si});
      cambiar({enviandoVideo: si});
    },
    [cambiar, enviar],
  );

  /** Se apunta a los mensajes del intercambio. Devuelve como darse de baja. */
  const escucharTrato = useCallback((oyente: (m: PeerMessage) => void) => {
    oyentesDelTrato.current.add(oyente);
    return () => {
      oyentesDelTrato.current.delete(oyente);
    };
  }, []);

  useEffect(() => salir, [salir]);

  return {
    estado,
    crear,
    unirse,
    salir,
    reintentar,
    enviar,
    enviarEquipo,
    cambiarMicro,
    cambiarSilencio,
    cambiarEnvioDeVideo,
    escucharTrato,
  };
};

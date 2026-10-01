import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Video de la partida del companero, o null si no hay conexion. */
  remoteStream: MediaStream | null;
  /** Nombre con el que etiquetar su pantalla. */
  partnerLabel: string;
  hasRom: boolean;
  /**
   * Ancho dividido por alto de la consola que corre.
   *
   * GBA es 3:2 y Game Boy Color 10:9, asi que fijarlo en el estilo dejaba
   * franjas negras en una de las dos. Viene de la plataforma, que ya lo sabe.
   */
  proporcion: number;
  /** Selector de ROM, mostrado encima mientras no haya juego cargado. */
  dropzone: ReactNode;
  /** Botones que flotan sobre la partida: voz y demas. */
  controles?: ReactNode;
};

/**
 * La vista de juego: tu partida y, al lado, la de tu companero.
 *
 * Antes la suya iba encima de la tuya, como una ventana flotante. Ahora va
 * fuera: tapar el juego para ver el juego del otro no compensaba, y en los
 * combates la esquina de abajo es justo donde el juego escribe.
 *
 * Detalle que condiciona todo el componente: el canvas NO puede cambiar de
 * sitio en el arbol. mGBA guarda una referencia a ese nodo concreto y si React
 * lo desmonta para recolocarlo, el nucleo deja de dibujar. Por eso intercambiar
 * cual se ve grande se hace cambiando clases y el orden visual, nunca moviendo
 * elementos: el canvas se queda donde esta y solo cambia de tamano.
 */
export const Stage = ({
  canvasRef,
  remoteStream,
  partnerLabel,
  hasRom,
  proporcion,
  dropzone,
  controles,
}: Props) => {
  const marcoRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = remoteStream;
    if (remoteStream) void video.play().catch(() => {});
  }, [remoteStream]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === marcoRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void marcoRef.current?.requestFullscreen().catch(() => {});
  };

  const connected = remoteStream !== null;
  // Sin companero no hay segunda pantalla: la tuya se queda todo el alto.
  const tamano = (mia: boolean) =>
    !connected || mia !== swapped ? 'pantalla--grande' : 'pantalla--pequena';

  return (
    <div
      className={`pantallas${connected ? '' : ' pantallas--solo'}${
        fullscreen ? ' pantallas--completa' : ''
      }`}
      ref={marcoRef}
      style={{ '--proporcion': proporcion } as React.CSSProperties}
    >
      <div className={`pantalla ${tamano(true)}`}>
        <canvas ref={canvasRef} className="pantalla__media" width={240} height={160} />
        <span className="pantalla__etiqueta">
          <span className="dot dot--on" />
          Tu partida
        </span>

        {/* Los controles flotan sobre la partida en vez de ocupar una barra
            aparte: asi la pantalla se lleva todo el sitio que hay. */}
        {hasRom && controles && <div className="pantalla__controles">{controles}</div>}

        <button
          type="button"
          className="pantalla__boton pantalla__boton--completa"
          onClick={toggleFullscreen}
          title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {fullscreen ? '⤡' : '⤢'}
        </button>

        {/* El boton de intercambiar va en las dos pantallas y el CSS lo enseña
            solo en la pequena. Si estuviera solo en la del companero, al
            intercambiar desapareceria y no habria forma de volver. */}
        {connected && <BotonIntercambiar onSwap={() => setSwapped((v) => !v)} />}
        {!hasRom && <div className="pantalla__encima">{dropzone}</div>}
      </div>

      {connected && (
        <div className={`pantalla ${tamano(false)}`}>
          <video ref={videoRef} className="pantalla__media" playsInline muted />
          <span className="pantalla__etiqueta">
            <span className="dot dot--on" />
            {partnerLabel}
          </span>
          <BotonIntercambiar onSwap={() => setSwapped((v) => !v)} />
        </div>
      )}
    </div>
  );
};

/** Intercambia cual de las dos partidas se ve grande. */
const BotonIntercambiar = ({ onSwap }: { onSwap: () => void }) => (
  <button
    type="button"
    className="pantalla__boton pantalla__boton--intercambiar"
    onClick={onSwap}
    title="Intercambiar pantallas"
    aria-label="Intercambiar pantallas"
  >
    ⇅
  </button>
);

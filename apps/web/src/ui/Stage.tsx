import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

type Props = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Video de la partida del companero, o null si no hay conexion. */
  remoteStream: MediaStream | null;
  /** Nombre con el que etiquetar su pantalla. */
  partnerLabel: string;
  hasRom: boolean;
  /** Selector de ROM, mostrado encima mientras no haya juego cargado. */
  dropzone: ReactNode;
};

/**
 * La vista de juego: tu partida a pantalla completa y la de tu companero en una
 * ventana pequena sobre ella.
 *
 * Detalle que condiciona todo el componente: el canvas NO puede cambiar de sitio
 * en el arbol. mGBA guarda una referencia a ese nodo concreto y si React lo
 * desmonta para recolocarlo, el nucleo deja de dibujar. Por eso intercambiar
 * cual es grande y cual pequena se hace cambiando clases sobre dos huecos fijos,
 * nunca moviendo elementos.
 */
export const Stage = ({ canvasRef, remoteStream, partnerLabel, hasRom, dropzone }: Props) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
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
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen().catch(() => {});
  };

  const connected = remoteStream !== null;
  const slotClass = (isMine: boolean) => {
    const main = isMine !== swapped;
    // Sin companero no hay ventana pequena: tu partida ocupa todo.
    return `slot ${main || !connected ? 'slot--main' : 'slot--pip'}`;
  };

  return (
    <div className={`stage${fullscreen ? ' stage--fullscreen' : ''}`} ref={stageRef}>
      <div className={slotClass(true)}>
        <canvas ref={canvasRef} className="slot__media" width={240} height={160} />
        <div className="slot__label">
          <span className="dot dot--on" />
          Tu partida
        </div>
        {/* El boton va en los dos huecos y el CSS lo muestra solo en el pequeno.
            Si estuviera solo en el del companero, al intercambiar desapareceria
            y no habria forma de volver. */}
        {connected && <SwapButton onSwap={() => setSwapped((v) => !v)} />}
        {!hasRom && <div className="slot__overlay">{dropzone}</div>}
      </div>

      {connected && (
        <div className={slotClass(false)}>
          <video ref={videoRef} className="slot__media" playsInline muted />
          <div className="slot__label">
            <span className="dot dot--on" />
            {partnerLabel}
          </div>
          <SwapButton onSwap={() => setSwapped((v) => !v)} />
        </div>
      )}

      <button
        type="button"
        className="stage__fullscreen"
        onClick={toggleFullscreen}
        title={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        aria-label={fullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
      >
        {fullscreen ? '⤡' : '⤢'}
      </button>
    </div>
  );
};

/** Intercambia cual de las dos partidas se ve grande. */
const SwapButton = ({ onSwap }: { onSwap: () => void }) => (
  <button
    type="button"
    className="slot__action"
    onClick={onSwap}
    title="Intercambiar pantallas"
    aria-label="Intercambiar pantallas"
  >
    ⇅
  </button>
);

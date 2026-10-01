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
/**
 * Permite llevar la ventana pequena a la esquina que uno quiera.
 *
 * Mientras se arrastra, la ventana sigue al dedo o al raton con un
 * desplazamiento; al soltar, se queda en la esquina mas cercana a donde estaba.
 * Es como funciona la de Google Meet, y se eligio asi en vez de dejarla donde
 * se suelte porque con el borde pegado nunca tapa el centro de la partida.
 *
 * La esquina se recuerda en este navegador: quien la quiere arriba a la
 * izquierda la quiere siempre.
 */
type Esquina = 'arriba-izq' | 'arriba-der' | 'abajo-izq' | 'abajo-der';

const CLAVE_ESQUINA = 'emupoke.esquina-companero';

const esEsquina = (valor: unknown): valor is Esquina =>
  valor === 'arriba-izq' || valor === 'arriba-der' || valor === 'abajo-izq' || valor === 'abajo-der';

const esquinaGuardada = (): Esquina => {
  try {
    const guardada = globalThis.localStorage?.getItem(CLAVE_ESQUINA);
    return esEsquina(guardada) ? guardada : 'abajo-der';
  } catch {
    return 'abajo-der';
  }
};

/** Cuanto hay que mover el dedo para que cuente como arrastrar y no como clic. */
const UMBRAL = 6;

const useArrastre = (
  stageRef: { current: HTMLDivElement | null },
): {
  esquina: Esquina;
  arrastrando: boolean;
  desplazamiento: { x: number; y: number };
  alPulsar: (evento: React.PointerEvent<HTMLElement>) => void;
} => {
  const [esquina, setEsquina] = useState<Esquina>(esquinaGuardada);
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);

  const alPulsar = (evento: React.PointerEvent<HTMLElement>) => {
    // Los botones de dentro -intercambiar pantallas- tienen que seguir
    // funcionando: si el gesto empieza encima de uno, no se arrastra.
    if ((evento.target as HTMLElement).closest('button')) return;

    const ventana = evento.currentTarget;
    const inicio = { x: evento.clientX, y: evento.clientY };
    let movido = false;
    ventana.setPointerCapture(evento.pointerId);

    const alMover = (e: PointerEvent) => {
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      if (!movido && Math.hypot(dx, dy) < UMBRAL) return;
      movido = true;
      setArrastrando(true);
      setDesplazamiento({ x: dx, y: dy });
    };

    const alSoltar = (e: PointerEvent) => {
      ventana.removeEventListener('pointermove', alMover);
      ventana.removeEventListener('pointerup', alSoltar);
      ventana.removeEventListener('pointercancel', alSoltar);
      setArrastrando(false);
      setDesplazamiento({ x: 0, y: 0 });
      if (!movido) return;

      // La esquina mas cercana al centro de la ventana al soltarla.
      const marco = stageRef.current?.getBoundingClientRect();
      const caja = ventana.getBoundingClientRect();
      if (!marco) return;
      const centro = { x: caja.left + caja.width / 2, y: caja.top + caja.height / 2 };
      const arriba = centro.y < marco.top + marco.height / 2;
      const izquierda = centro.x < marco.left + marco.width / 2;
      const elegida: Esquina = `${arriba ? 'arriba' : 'abajo'}-${izquierda ? 'izq' : 'der'}`;

      setEsquina(elegida);
      try {
        globalThis.localStorage?.setItem(CLAVE_ESQUINA, elegida);
      } catch {
        // Sin almacenamiento se pierde al recargar, pero la sesion sigue.
      }
      e.preventDefault();
    };

    ventana.addEventListener('pointermove', alMover);
    ventana.addEventListener('pointerup', alSoltar);
    ventana.addEventListener('pointercancel', alSoltar);
  };

  return { esquina, arrastrando, desplazamiento, alPulsar };
};

export const Stage = ({
  canvasRef,
  remoteStream,
  partnerLabel,
  hasRom,
  proporcion,
  dropzone,
}: Props) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [swapped, setSwapped] = useState(false);
  const { esquina, arrastrando, desplazamiento, alPulsar } = useArrastre(stageRef);
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
    <div
      className={`stage${fullscreen ? ' stage--fullscreen' : ''}`}
      ref={stageRef}
      style={{ '--proporcion': proporcion } as React.CSSProperties}
    >
      <div className={slotClass(true)}>
        <canvas ref={canvasRef} className="slot__media" width={240} height={160} />
        {/* El boton va en los dos huecos y el CSS lo muestra solo en el pequeno.
            Si estuviera solo en el del companero, al intercambiar desapareceria
            y no habria forma de volver. */}
        {connected && <SwapButton onSwap={() => setSwapped((v) => !v)} />}
        {!hasRom && <div className="slot__overlay">{dropzone}</div>}
      </div>

      {connected && (
        <div
          className={`${slotClass(false)} slot--${esquina}${arrastrando ? ' slot--arrastrando' : ''}`}
          onPointerDown={alPulsar}
          style={
            arrastrando
              ? { transform: `translate(${desplazamiento.x}px, ${desplazamiento.y}px)` }
              : undefined
          }
        >
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

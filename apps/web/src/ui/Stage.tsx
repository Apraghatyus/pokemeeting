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
 * Si la pantalla es de las estrechas, las de movil.
 *
 * Se mira el mismo ancho con el que el estilo reordena la pagina, para que las
 * dos cosas no puedan discrepar. Ahi la ventana del companero no se arrastra:
 * el gesto compite con el desplazamiento de la pagina, y ademas en una pantalla
 * de ese tamano las cuatro esquinas quedan casi en el mismo sitio.
 */
const ESTRECHA = '(max-width: 1100px)';

const useEsEstrecha = (): boolean => {
  const [estrecha, setEstrecha] = useState(
    () => globalThis.matchMedia?.(ESTRECHA).matches ?? false,
  );

  useEffect(() => {
    const consulta = globalThis.matchMedia?.(ESTRECHA);
    if (!consulta) return;
    const alCambiar = () => setEstrecha(consulta.matches);
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);

  return estrecha;
};

/**
 * Permite llevar la ventana del companero a la esquina que uno quiera.
 *
 * Mientras se arrastra sigue al dedo o al raton; al soltar se queda en la
 * esquina mas cercana a donde estaba. Se eligio asi, y no dejarla donde se
 * suelte, porque pegada a una esquina nunca tapa el centro de la partida, que
 * es donde se juega.
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
    // Sin almacenamiento se empieza siempre en la de abajo a la derecha.
    return 'abajo-der';
  }
};

/** Cuanto hay que mover el dedo para que cuente como arrastrar y no como clic. */
const UMBRAL = 6;

const useArrastre = (marcoRef: { current: HTMLDivElement | null }) => {
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

    const alSoltar = () => {
      ventana.removeEventListener('pointermove', alMover);
      ventana.removeEventListener('pointerup', alSoltar);
      ventana.removeEventListener('pointercancel', alSoltar);
      setArrastrando(false);
      setDesplazamiento({ x: 0, y: 0 });
      if (!movido) return;

      // La esquina mas cercana al centro de la ventana al soltarla. Se mide
      // contra la PARTIDA, no contra el hueco, porque es a ella a la que se
      // agarra.
      const marco = marcoRef.current?.getBoundingClientRect();
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
    };

    ventana.addEventListener('pointermove', alMover);
    ventana.addEventListener('pointerup', alSoltar);
    ventana.addEventListener('pointercancel', alSoltar);
  };

  return { esquina, arrastrando, desplazamiento, alPulsar };
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
  const { esquina, arrastrando, desplazamiento, alPulsar } = useArrastre(marcoRef);
  // En movil la ventana se queda donde esta: ver useEsEstrecha.
  const seArrastra = !useEsEstrecha();
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
      <div
        className={`pantalla ${tamano(true)}${
          swapped ? ` pantalla--${esquina}${arrastrando ? ' pantalla--arrastrando' : ''}` : ''
        }`}
        onPointerDown={swapped && seArrastra ? alPulsar : undefined}
        style={
          swapped && arrastrando
            ? { transform: `translate(${desplazamiento.x}px, ${desplazamiento.y}px)` }
            : undefined
        }
      >
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
        <div
          className={`pantalla ${tamano(false)} pantalla--${esquina}${
            arrastrando ? ' pantalla--arrastrando' : ''
          }`}
          onPointerDown={seArrastra ? alPulsar : undefined}
          style={
            arrastrando
              ? { transform: `translate(${desplazamiento.x}px, ${desplazamiento.y}px)` }
              : undefined
          }
        >
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

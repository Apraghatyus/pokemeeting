import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useEsEstrecha } from '../core/useEsEstrecha';

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
  /**
   * Que elemento se pone a pantalla completa.
   *
   * Hace falta decirlo desde fuera porque el mando tactil **no** esta dentro de
   * esta pantalla, y el navegador en pantalla completa solo pinta el elemento
   * que se le pidio y lo que cuelga de el. Pidiendola sobre la pantalla sola,
   * en el movil desaparecian los botones y no se podia jugar.
   *
   * Sin este dato se usa la pantalla, que es lo correcto en escritorio.
   */
  marcoCompleto?: RefObject<HTMLElement | null>;
  /**
   * Si se esta mirando lo del companero en vez de lo propio.
   *
   * Vive fuera y no aqui porque **no es solo de que pantalla va**: en movil solo
   * cabe un equipo a la vez, y al cambiar de pantalla tiene que cambiar tambien
   * el equipo que se ensena. Teniendolo cada uno por su lado, deslizabas a su
   * partida y seguias viendo tu equipo, que es lo que se reporto.
   */
  mirandoLoSuyo: boolean;
  onCambiarPantalla: () => void;
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
 * Cambiar de pantalla deslizando el dedo.
 *
 * En movil solo se ve una partida a la vez, asi que hace falta una forma de
 * pasar a la del companero. Deslizar es mas natural que un boton y no ocupa
 * sitio en pantalla, que es justo lo que escasea ahi.
 *
 * Solo cuenta el gesto horizontal: el vertical tiene que seguir desplazando la
 * pagina, porque debajo estan el mando y los equipos. Por eso se decide en el
 * primer movimiento y, si va hacia abajo, se suelta el gesto y no se vuelve a
 * mirar hasta el siguiente.
 */
/**
 * Cuanto se quedan a la vista los controles flotantes tras tocar la partida.
 *
 * En un movil estorban: flotan sobre el juego y en una pantalla pequena acaban
 * justo encima de donde hay que mirar -el teclado para poner un mote, por
 * ejemplo-. Pero tampoco pueden desaparecer del todo, porque entonces no hay
 * forma de silenciar.
 *
 * Asi que se comportan como los mandos de un video: aparecen al tocar y se van
 * solos. Cinco segundos es lo que se pidio, y da para verlos y pulsarlos sin
 * tener que correr.
 */
const CONTROLES_VISIBLES_MS = 5000;

const ARRASTRE_MINIMO = 10;
/** Cuanto hay que recorrer para que el cambio se dé por hecho. */
const PARA_CAMBIAR = 60;

const useDeslizar = (
  activo: boolean,
  alCambiar: () => void,
): {
  desplazado: number;
  deslizando: boolean;
  alPulsar: (evento: React.PointerEvent<HTMLElement>) => void;
} => {
  const [desplazado, setDesplazado] = useState(0);
  const [deslizando, setDeslizando] = useState(false);

  const alPulsar = (evento: React.PointerEvent<HTMLElement>) => {
    if (!activo) return;
    // Los botones de encima siguen siendo botones.
    if ((evento.target as HTMLElement).closest('button')) return;

    const zona = evento.currentTarget;
    const inicio = { x: evento.clientX, y: evento.clientY };
    let decidido: 'horizontal' | 'vertical' | null = null;

    const alMover = (e: PointerEvent) => {
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;

      if (decidido === null) {
        if (Math.hypot(dx, dy) < ARRASTRE_MINIMO) return;
        // El primer movimiento decide de quien es el gesto.
        decidido = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        if (decidido === 'vertical') {
          soltar();
          return;
        }
        zona.setPointerCapture(e.pointerId);
        setDeslizando(true);
      }

      // Se acompaña al dedo con resistencia: pasado el umbral cuesta mas, que
      // es lo que hace notar que ya vale con eso.
      const resistido = Math.sign(dx) * Math.min(Math.abs(dx), PARA_CAMBIAR + Math.abs(dx) / 4);
      setDesplazado(resistido);
    };

    const alSoltar = (e: PointerEvent) => {
      const dx = e.clientX - inicio.x;
      soltar();
      if (decidido === 'horizontal' && Math.abs(dx) >= PARA_CAMBIAR) alCambiar();
    };

    function soltar() {
      zona.removeEventListener('pointermove', alMover);
      zona.removeEventListener('pointerup', alSoltar);
      zona.removeEventListener('pointercancel', soltar as unknown as EventListener);
      setDeslizando(false);
      setDesplazado(0);
    }

    zona.addEventListener('pointermove', alMover);
    zona.addEventListener('pointerup', alSoltar);
    zona.addEventListener('pointercancel', soltar as unknown as EventListener);
  };

  return { desplazado, deslizando, alPulsar };
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
  marcoCompleto,
  mirandoLoSuyo,
  onCambiarPantalla,
}: Props) => {
  const marcoRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const connected = remoteStream !== null;
  const { esquina, arrastrando, desplazamiento, alPulsar } = useArrastre(marcoRef);
  // En movil la ventana se queda donde esta: ver useEsEstrecha.
  const estrecha = useEsEstrecha();
  const seArrastra = !estrecha;

  // Y ahi se cambia de pantalla deslizando, no con un boton: en una pantalla
  // pequeña un boton mas es sitio que se le quita a la partida.
  const puedeDeslizar = estrecha && connected;
  const { desplazado, deslizando, alPulsar: alDeslizar } = useDeslizar(
    puedeDeslizar,
    onCambiarPantalla,
  );
  const [fullscreen, setFullscreen] = useState(false);

  /**
   * Si los controles flotantes estan a la vista ahora mismo.
   *
   * Empezo siendo cosa de moviles y se pidio tambien para escritorio: flotando
   * sobre la partida estorban en los dos sitios.
   */
  const [controlesDespiertos, setControlesDespiertos] = useState(false);
  const relojDeControles = useRef<ReturnType<typeof setTimeout> | null>(null);

  const despertarControles = useCallback(() => {
    if (relojDeControles.current) clearTimeout(relojDeControles.current);
    setControlesDespiertos(true);
    relojDeControles.current = setTimeout(
      () => setControlesDespiertos(false),
      CONTROLES_VISIBLES_MS,
    );
  }, []);

  // Al irse, que no quede un temporizador apuntando a un componente que ya no
  // esta.
  useEffect(
    () => () => {
      if (relojDeControles.current) clearTimeout(relojDeControles.current);
    },
    [],
  );

  /**
   * Si el navegador le ha quitado al lienzo su contexto de video.
   *
   * Pasa de verdad y se reporto tres veces: en un telefono justo de memoria, el
   * sistema le retira la memoria de video al navegador y el lienzo se queda en
   * blanco. Sin escuchar esto no habia ni aviso ni vuelta atras, porque el
   * navegador **solo** intenta restaurarlo si alguien atiende el evento y
   * llama a preventDefault. Y aun atendiendolo, mGBA no vuelve solo: sus
   * texturas se fueron con el contexto. Asi que lo honesto no es fingir que se
   * arregla, es decir lo que ha pasado y ofrecer recargar.
   */
  const [sinVideo, setSinVideo] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const alPerder = (evento: Event) => {
      // Sin esto el navegador ni siquiera intenta devolverlo.
      evento.preventDefault();
      setSinVideo(true);
    };
    const alVolver = () => setSinVideo(false);

    canvas.addEventListener('webglcontextlost', alPerder);
    canvas.addEventListener('webglcontextrestored', alVolver);
    return () => {
      canvas.removeEventListener('webglcontextlost', alPerder);
      canvas.removeEventListener('webglcontextrestored', alVolver);
    };
  }, [canvasRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = remoteStream;
    if (remoteStream) void video.play().catch(() => {});
  }, [remoteStream]);

  // El elemento que se pone a pantalla completa: el que digan desde fuera -que
  // incluye el mando- o, si no dicen nada, esta pantalla.
  const objetivo = () => marcoCompleto?.current ?? marcoRef.current;

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === objetivo());
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  });

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void objetivo()?.requestFullscreen().catch(() => {});
  };

  // Sin companero no hay segunda pantalla: la tuya se queda todo el alto.
  const tamano = (mia: boolean) =>
    !connected || mia !== mirandoLoSuyo ? 'pantalla--grande' : 'pantalla--pequena';

  return (
    <div
      className={`pantallas${connected ? '' : ' pantallas--solo'}${
        fullscreen ? ' pantallas--completa' : ''
      }${puedeDeslizar ? ' pantallas--deslizable' : ''}${deslizando ? ' pantallas--deslizando' : ''}`}
      ref={marcoRef}
      /* Un toque en la partida despierta los controles. Va aqui, en el
         contenedor, y no en cada boton: asi pulsar uno tambien cuenta como
         toque y no se esconden en mitad de un gesto. */
      onPointerDown={(evento) => {
        despertarControles();
        if (puedeDeslizar) alDeslizar(evento);
      }}
      style={
        {
          '--proporcion': proporcion,
          ...(desplazado !== 0 ? { '--deslizado': `${desplazado}px` } : {}),
        } as React.CSSProperties
      }
    >
      <div
        className={`pantalla ${tamano(true)}${
          mirandoLoSuyo ? ` pantalla--${esquina}${arrastrando ? ' pantalla--arrastrando' : ''}` : ''
        }`}
        onPointerDown={mirandoLoSuyo && seArrastra ? alPulsar : undefined}
        style={
          mirandoLoSuyo && arrastrando
            ? { transform: `translate(${desplazamiento.x}px, ${desplazamiento.y}px)` }
            : undefined
        }
      >
        <canvas ref={canvasRef} className="pantalla__media" width={240} height={160} />

        {/* Un rectangulo en blanco sin explicacion es lo peor que puede pasar
            aqui: parece que la aplicacion se ha roto sin motivo. */}
        {sinVideo && (
          <div className="pantalla__caida" role="alert">
            <strong>El movil se quedo sin memoria de video.</strong>
            <p>
              La imagen no vuelve sola. Lo que hayas guardado dentro del juego esta a salvo;
              al recargar tendras que volver a abrir la ROM.
            </p>
            <button type="button" className="button--primary" onClick={() => location.reload()}>
              Recargar
            </button>
          </div>
        )}
        <span className="pantalla__etiqueta">
          <span className="dot dot--on" />
          Tu partida
        </span>

        {/* Los controles flotan sobre la partida en vez de ocupar una barra
            aparte: asi la pantalla se lleva todo el sitio que hay. */}
        {hasRom && controles && (
          <div className={`pantalla__controles${controlesDespiertos ? ' is-despiertos' : ''}`}>
            {controles}
          </div>
        )}

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
        {connected && <BotonIntercambiar onSwap={() => onCambiarPantalla()} />}
        {/* Sin zona de carga no se pinta la caja: con una invitacion delante,
            la ROM se pide dentro de su cartel y aqui quedaria un hueco vacio. */}
        {!hasRom && dropzone && <div className="pantalla__encima">{dropzone}</div>}
      </div>

      {puedeDeslizar && (
        // Dos puntos para que se vea que hay otra pantalla detras. Sin esto,
        // nadie adivina que se puede deslizar.
        <div className="pantallas__puntos" aria-hidden="true">
          <span className={mirandoLoSuyo ? '' : 'is-aqui'} />
          <span className={mirandoLoSuyo ? 'is-aqui' : ''} />
        </div>
      )}

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
          <BotonIntercambiar onSwap={() => onCambiarPantalla()} />
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

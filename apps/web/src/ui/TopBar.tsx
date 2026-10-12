import type { Cuenta } from '@emupoke/protocol';
import type { SessionState } from '../net/useSession';
import type { KeyboardOwner } from '../core/useKeyboardOwnership';
import { VolumeControl } from './VolumeControl';

type Props = {
  session: SessionState;
  keyboardOwner: KeyboardOwner;
  onOpenRoom: () => void;
  /** Abre el intercambio. */
  onOpenTrade: () => void;
  /** Si quedo un intercambio sin terminar. Se puede rematar sin el companero. */
  tratoAMedias: boolean;
  onToggleMenu: () => void;
  menuOpen: boolean;
  /** Volumen del juego, de 0 a 200. */
  volume: number;
  onVolume: (percent: number) => void;
  onToggleMute: () => void;
  /** Sin ROM cargada no hay nada que oir. */
  volumeDisabled: boolean;
  /** Quien eres, o null si no has entrado. */
  cuenta: Cuenta | null;
  /** Abre la pantalla de la cuenta. */
  onOpenCuenta: () => void;
  cuentaOpen: boolean;
  /** Abre el ranking. */
  onOpenRanking: () => void;
  /** Abre el mapa de rutas. Sin partida no hay mapa, y no se ofrece. */
  onOpenMapa?: () => void;
};

/**
 * El estado de la conexion, reducido a un punto de color.
 *
 * El texto se quito de la barra para dejarla limpia, pero un punto de color no
 * dice nada a quien no lo ve ni a quien no sabe que significa cada color: la
 * frase sigue existiendo como titulo y como etiqueta accesible.
 */
const STATUS: Record<SessionState['phase'], { dot: string; texto: string }> = {
  'sin-sala': { dot: '', texto: 'Sin conexion' },
  'esperando-companero': { dot: 'wait', texto: 'Esperando a tu companero' },
  conectando: { dot: 'busy', texto: 'Conectando' },
  conectada: { dot: 'on', texto: 'Conectados' },
  perdida: { dot: 'off', texto: 'Conexion perdida' },
};

export const TopBar = ({
  session,
  keyboardOwner,
  onOpenRoom,
  onOpenTrade,
  tratoAMedias,
  onToggleMenu,
  menuOpen,
  volume,
  onVolume,
  onToggleMute,
  volumeDisabled,
  cuenta,
  onOpenCuenta,
  cuentaOpen,
  onOpenRanking,
  onOpenMapa,
}: Props) => {
  // Reconectando es un estado distinto de "caido": el jugador necesita saber
  // que se esta intentando solo, para no dar la partida por perdida.
  // Hay sala abierta en cuanto se crea o se entra, aunque el companero no haya
  // llegado todavia: el intercambio se prepara antes de que aparezca.
  const conSala = session.phase !== 'sin-sala';

  const status = session.reconnect.trying
    ? { texto: 'Reconectando', dot: 'busy' }
    : STATUS[session.phase];

  return (
    <header className="topbar">
      <div className="brand">
        {/* El logotipo, no un triangulo generico. Va como imagen y no como
            fondo en el estilo para que se pueda describir y para que el
            navegador la cachee como cualquier otra. */}
        <img className="brand__mark" src="/icono-192.png" alt="" aria-hidden="true" />
        <div>
          <strong>Pokemeeting</strong>
          <span className="brand__sub">Sesion compartida</span>
        </div>
      </div>

      {/* La sala y el intercambio, juntos y en el centro. Van en el mismo
          grupo para que el boton quede PEGADO a la sala: con el chip centrado
          por su cuenta, lo que viniera detras se iba al otro extremo. */}
      <div className="topbar__centro">
        <button type="button" className="roomchip" onClick={onOpenRoom}>
          {session.roomCode ? (
            <>
              <span className="roomchip__label">Sala</span>
              <span className="roomchip__code mono">{session.roomCode}</span>
            </>
          ) : (
            <span className="roomchip__label">Jugar con un amigo</span>
          )}
        </button>

      {/* Al lado de la sala, y solo con sala abierta.
          *
          * Esta aqui y no escondido en un menu porque quien quiere
          * intercambiar lo primero que hace es irse a la sala de union del
          * juego, que busca un cable que aqui no hay y se queda esperando para
          * siempre. Un boton a la vista es lo unico que evita ese viaje.
          *
          * Pero jugando solo no pinta nada: no hay con quien, y ocupaba sitio
          * en la barra prometiendo algo que no se podia hacer. Por eso va
          * pegado a la sala, que es de lo que depende.
          *
          * La excepcion es un trato a medias. Eso se remata SIN el otro -el
          * Pokemon ya esta apuntado- y si el boton dependiera solo de la sala,
          * quien cierre la pestana a mitad de un intercambio se quedaria sin
          * forma de terminarlo, que es justo como se pierde un Pokemon. */}
        {(conSala || tratoAMedias) && (
          <button
            type="button"
            className="iconbutton iconbutton--trato"
            onClick={onOpenTrade}
            title={
              tratoAMedias && !conSala
                ? 'Termina el intercambio que quedo a medias'
                : 'Intercambiar un Pokemon'
            }
            aria-label="Intercambiar un Pokemon"
          >
            ⇄
          </button>
        )}
      </div>

      <div className="topbar__right">
        <VolumeControl
          volume={volume}
          onVolume={onVolume}
          onToggleMute={onToggleMute}
          disabled={volumeDisabled}
        />

        {/* Solo se menciona el teclado cuando deja de ser del juego: si no,
            es ruido permanente en la barra. */}
        {keyboardOwner === 'interfaz' && <span className="chip chip--interfaz">Escribiendo</span>}
        <span className="status" title={status.texto} aria-label={status.texto} role="status">
          <span className={`dot${status.dot ? ` dot--${status.dot}` : ''}`} />
        </span>
        {/* El ranking. Esta a la vista y no dentro de un menu porque es de
            las cosas que se miran a mitad de partida -"como voy contra el"- y
            no al final de ella. Se puede abrir sin tener cuenta: es una tabla
            de resultados, no datos de nadie. */}
        {/* El mapa: que rutas quedan y donde anda cada uno. */}
        {onOpenMapa && (
          <button
            type="button"
            className="iconbutton iconbutton--mapa"
            onClick={onOpenMapa}
            title="Mapa de rutas"
            aria-label="Mapa de rutas"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
              <path d="M9 4v14M15 6v14" />
            </svg>
          </button>
        )}

        <button
          type="button"
          className="iconbutton iconbutton--ranking"
          onClick={onOpenRanking}
          title="Ranking"
          aria-label="Ranking"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
          </svg>
        </button>

        {/* La cuenta, al lado de la tuerca y no dentro de los ajustes.
            Entrar no es configurar el emulador: es otra cosa, y buscarla
            dentro de un menu de teclas y volumen era pedirle a alguien que
            adivinara donde esta. Ademas asi se ve de un vistazo si estas
            dentro, que es la pregunta que de verdad se hace. */}
        <button
          type="button"
          className={`iconbutton iconbutton--cuenta${cuenta ? ' is-dentro' : ''}${
            cuentaOpen ? ' is-active' : ''
          }`}
          onClick={onOpenCuenta}
          title={cuenta ? `Tu cuenta: ${cuenta.apodo}` : 'Entrar o crear una cuenta'}
          aria-label={cuenta ? `Tu cuenta: ${cuenta.apodo}` : 'Entrar o crear una cuenta'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>

        {/* Una tuerca y no tres puntos: tres puntos significan "hay mas
            cosas", que es justo lo que no son. Son los ajustes. */}
        <button
          type="button"
          className={`iconbutton iconbutton--opciones${menuOpen ? ' is-active' : ''}`}
          onClick={onToggleMenu}
          title="Ajustes"
          aria-label="Ajustes"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>
    </header>
  );
};

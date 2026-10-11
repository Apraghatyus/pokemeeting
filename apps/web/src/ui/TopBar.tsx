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
  /** Si hay partida en marcha. Sin juego no hay nada que intercambiar. */
  hayPartida: boolean;
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
  hayPartida,
  onToggleMenu,
  menuOpen,
  volume,
  onVolume,
  onToggleMute,
  volumeDisabled,
  cuenta,
  onOpenCuenta,
  cuentaOpen,
}: Props) => {
  // Reconectando es un estado distinto de "caido": el jugador necesita saber
  // que se esta intentando solo, para no dar la partida por perdida.
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

      <div className="topbar__right">
        {/* Existe AQUI y no escondido en un menu a proposito: quien quiere
            intercambiar lo primero que hace es irse a la sala de union del
            juego, que busca un cable que aqui no hay y se queda esperando para
            siempre. Un boton a la vista es lo unico que evita ese viaje.
            *
            * Y sale con partida, no solo con companero. Si un intercambio se
            * quedo a medias hay que poder rematarlo, y eso se hace sin el otro:
            * atarlo a estar conectado dejaba el boton de terminarlo fuera de
            * alcance justo cuando hacia falta. Sin companero, el propio cartel
            * explica que hace falta una sala. */}
        {hayPartida && (
          <button
            type="button"
            className="iconbutton"
            onClick={onOpenTrade}
            title="Intercambiar un Pokemon"
            aria-label="Intercambiar un Pokemon"
          >
            ⇄
          </button>
        )}

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

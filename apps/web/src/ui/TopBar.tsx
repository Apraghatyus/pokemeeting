import type { SessionState } from '../net/useSession';
import type { KeyboardOwner } from '../core/useKeyboardOwnership';
import { VolumeControl } from './VolumeControl';

type Props = {
  session: SessionState;
  keyboardOwner: KeyboardOwner;
  onOpenRoom: () => void;
  onToggleMenu: () => void;
  menuOpen: boolean;
  /** Volumen del juego, de 0 a 200. */
  volume: number;
  onVolume: (percent: number) => void;
  onToggleMute: () => void;
  /** Sin ROM cargada no hay nada que oir. */
  volumeDisabled: boolean;
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
  onToggleMenu,
  menuOpen,
  volume,
  onVolume,
  onToggleMute,
  volumeDisabled,
}: Props) => {
  // Reconectando es un estado distinto de "caido": el jugador necesita saber
  // que se esta intentando solo, para no dar la partida por perdida.
  const status = session.reconnect.trying
    ? { texto: 'Reconectando', dot: 'busy' }
    : STATUS[session.phase];

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          ▶
        </span>
        <div>
          <strong>Emupoke Together</strong>
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
        <button
          type="button"
          className={`iconbutton iconbutton--opciones${menuOpen ? ' is-active' : ''}`}
          onClick={onToggleMenu}
          title="Opciones"
          aria-label="Opciones"
        >
          ⋮
        </button>
      </div>
    </header>
  );
};

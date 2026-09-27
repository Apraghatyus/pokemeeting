import type { SessionState } from '../net/useSession';
import type { KeyboardOwner } from '../core/useKeyboardOwnership';

type Props = {
  session: SessionState;
  keyboardOwner: KeyboardOwner;
  onOpenRoom: () => void;
  onToggleMenu: () => void;
  menuOpen: boolean;
};

const STATUS: Record<SessionState['phase'], { text: string; dot: string }> = {
  'sin-sala': { text: 'Sin conexion', dot: '' },
  'esperando-companero': { text: 'Esperando', dot: 'wait' },
  conectando: { text: 'Conectando', dot: 'busy' },
  conectada: { text: 'Conectados', dot: 'on' },
  perdida: { text: 'Conexion perdida', dot: 'off' },
};

export const TopBar = ({ session, keyboardOwner, onOpenRoom, onToggleMenu, menuOpen }: Props) => {
  const status = STATUS[session.phase];

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
        <span className="roomchip__caret" aria-hidden="true">
          ⌄
        </span>
      </button>

      <div className="topbar__right">
        {/* Solo se menciona el teclado cuando deja de ser del juego: si no,
            es ruido permanente en la barra. */}
        {keyboardOwner === 'interfaz' && <span className="chip chip--interfaz">Escribiendo</span>}
        <span className="status">
          <span className={`dot${status.dot ? ` dot--${status.dot}` : ''}`} />
          {status.text}
        </span>
        <button
          type="button"
          className={`iconbutton${menuOpen ? ' is-active' : ''}`}
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

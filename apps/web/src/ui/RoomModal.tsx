import { useState } from 'react';
import type { RomCompatibility } from '@emupoke/pokemon';
import { MAX_RECONNECT_ATTEMPTS, type SessionState } from '../net/useSession';
import { Modal } from './Modal';

type Props = {
  open: boolean;
  onClose: () => void;
  state: SessionState;
  romReady: boolean;
  onCreate: (password: string) => void;
  onJoin: (roomCode: string, password: string) => void;
  onLeave: () => void;
  onRetry: () => void;
};

/**
 * Antes de tener sala muestra el formulario; con sala abierta, las credenciales
 * listas para pasarselas a alguien.
 */
export const RoomModal = (props: Props) => {
  const { open, onClose, state } = props;
  const hasRoom = state.phase !== 'sin-sala';

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={hasRoom ? '((•))' : '+'}
      title={hasRoom ? 'Sala privada' : 'Jugar con un amigo'}
      subtitle={
        hasRoom
          ? 'Comparte estos datos con tu companero.'
          : 'Crea una sala y pasale el codigo, o entra en la suya.'
      }
    >
      {hasRoom ? <RoomCredentials {...props} /> : <RoomSetup {...props} />}
    </Modal>
  );
};

/* ---------- sin sala: crear o entrar ---------- */

const RoomSetup = ({ romReady, state, onCreate, onJoin }: Props) => {
  const [mode, setMode] = useState<'crear' | 'unirme'>('crear');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const ready = romReady && password.length > 0 && (mode === 'crear' || code.length === 6);

  return (
    <>
      <div className="tabs">
        <button
          type="button"
          className={mode === 'crear' ? 'is-active' : undefined}
          onClick={() => setMode('crear')}
        >
          Crear sala
        </button>
        <button
          type="button"
          className={mode === 'unirme' ? 'is-active' : undefined}
          onClick={() => setMode('unirme')}
        >
          Entrar en una
        </button>
      </div>

      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === 'crear') onCreate(password);
          else onJoin(code, password);
        }}
      >
        {mode === 'unirme' && (
          <label>
            Codigo de sala
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              autoComplete="off"
              spellCheck={false}
              className="mono input--code"
            />
          </label>
        )}
        <label>
          Contrasena
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === 'crear' ? 'Elige una' : 'La que te han dado'}
            autoComplete="off"
          />
        </label>
        <button type="submit" className="button--primary" disabled={!ready}>
          {mode === 'crear' ? 'Crear sala' : 'Entrar'}
        </button>
      </form>

      <p className="hint">
        {romReady
          ? 'Tu companero necesita su propia copia del juego. Solo se comparte la pantalla, nunca la ROM.'
          : 'Carga tu ROM antes de abrir una sala.'}
      </p>

      {state.error && (
        <p className="alert" role="alert">
          {state.error}
        </p>
      )}
    </>
  );
};

/* ---------- reconexion ---------- */

/**
 * Que se ve cuando se corta el enlace.
 *
 * Se insiste solo tres veces y luego se para. Reintentar en bucle contra una
 * red que sigue caida no arregla nada y llena la pantalla de mensajes; quien
 * esta delante sabe mejor que nosotros cuando ha vuelto la conexion.
 */
const Reconexion = ({ state, onRetry }: { state: SessionState; onRetry: () => void }) => {
  const { attempts, trying, exhausted } = state.reconnect;

  return (
    <div className="reconexion">
      <p className="reconexion__estado">
        {trying ? (
          <>
            <span className="dot dot--busy" />
            Reconectando... (intento {attempts} de {MAX_RECONNECT_ATTEMPTS})
          </>
        ) : (
          <>
            <span className="dot dot--off" />
            Se ha cortado el enlace.
          </>
        )}
      </p>

      <p className="hint">
        Tu partida sigue corriendo: esto solo afecta a ver la pantalla de tu companero y a
        hablar con el.
      </p>

      {exhausted && (
        <button type="button" className="button--primary button--wide" onClick={onRetry}>
          Reintentar ahora
        </button>
      )}
    </div>
  );
};

/* ---------- compatibilidad de las dos ROMs ---------- */

/**
 * No dice "compatible si o no" sino que se puede hacer con esta pareja de
 * ROMs. Ver la partida del otro no exige nada; intercambiar si.
 */
const Compatibility = ({ report }: { report: RomCompatibility }) => {
  if (report.level === 'identica') return null;

  return (
    <div className={`compat compat--${report.canPlayTogether ? 'ok' : 'bloqueo'}`}>
      <p className="compat__head">
        <span className={`dot dot--${report.canPlayTogether ? 'on' : 'off'}`} />
        {report.headline}
      </p>
      {report.notes.map((note) => (
        <p className="compat__note" key={note}>
          {note}
        </p>
      ))}
    </div>
  );
};

/* ---------- con sala: credenciales ---------- */

/**
 * Texto que se copia al portapapeles.
 *
 * Incluye la direccion de la pagina solo si sirve de algo para quien la reciba:
 * "localhost" apunta al ordenador de quien copia, no al de su amigo, asi que
 * mandarlo seria enganoso.
 */
const shareText = (code: string, password: string): string => {
  const { origin, hostname } = globalThis.location;
  const usable = !['localhost', '127.0.0.1', '::1'].includes(hostname);
  const lines = [`Sala: ${code}`, `Contrasena: ${password}`];
  if (usable) lines.unshift(`Juega conmigo en ${origin}`);
  return lines.join('\n');
};

const RoomCredentials = ({ state, onLeave, onRetry }: Props) => {
  const [copied, setCopied] = useState<'no' | 'si' | 'fallo'>('no');

  const copyAll = async () => {
    if (!state.roomCode) return;
    try {
      await navigator.clipboard.writeText(shareText(state.roomCode, state.password ?? ''));
      setCopied('si');
      setTimeout(() => setCopied('no'), 2200);
    } catch {
      // El portapapeles puede estar denegado. Los datos siguen a la vista.
      setCopied('fallo');
    }
  };

  const waiting = state.phase === 'esperando-companero';

  return (
    <>
      <label className="field">
        Codigo de sala
        <output className="field__value room-code">{state.roomCode}</output>
      </label>

      {state.password && (
        <label className="field">
          Contrasena
          <output className="field__value mono">{state.password}</output>
        </label>
      )}

      {state.password && (
        <>
          <button type="button" className="button--primary button--wide" onClick={() => void copyAll()}>
            {copied === 'si' ? 'Credenciales copiadas' : 'Copiar credenciales'}
          </button>
          <p className="hint hint--center">
            {copied === 'fallo'
              ? 'El navegador no ha dejado copiar. Puedes leerlos de arriba.'
              : 'Incluye codigo y contrasena'}
          </p>
        </>
      )}

      {/* Quien entra en la sala de otro no tiene contrasena que enseñar: ya la
          escribio el, y no la guardamos. */}
      {!state.password && (
        <p className="hint">Estas en la sala de tu companero.</p>
      )}

      {state.peerRom && (
        <div className="invite">
          <span className="invite__label">Su ROM</span>
          <strong className="invite__file" title={state.peerRom.fileName}>
            {state.peerRom.fileName}
          </strong>
        </div>
      )}

      {state.compatibility && <Compatibility report={state.compatibility} />}

      {waiting && <p className="hint">Aun no ha entrado nadie.</p>}
      {state.phase === 'perdida' && <Reconexion state={state} onRetry={onRetry} />}

      <button type="button" className="button--wide" onClick={onLeave}>
        Salir de la sala
      </button>

      {state.error && (
        <p className="alert" role="alert">
          {state.error}
        </p>
      )}
    </>
  );
};

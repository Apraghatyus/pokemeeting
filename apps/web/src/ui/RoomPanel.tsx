import { useState } from 'react';
import type { SessionState } from '../net/useSession';

type Props = {
  state: SessionState;
  romReady: boolean;
  onCreate: (password: string) => void;
  onJoin: (roomCode: string, password: string) => void;
  onLeave: () => void;
};

const PHASE_LABEL: Record<SessionState['phase'], string> = {
  'sin-sala': 'Sin sala',
  'esperando-companero': 'Esperando a tu companero',
  conectando: 'Conectando...',
  conectada: 'Conectados',
  perdida: 'Conexion perdida',
};

export const RoomPanel = ({ state, romReady, onCreate, onJoin, onLeave }: Props) => {
  const [mode, setMode] = useState<'crear' | 'unirme'>('crear');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const submit = () => {
    if (mode === 'crear') onCreate(password);
    else onJoin(code, password);
  };

  return (
    <section className="panel">
      <h2>Sala</h2>

      {state.phase === 'sin-sala' ? (
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
              Unirme
            </button>
          </div>

          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            {mode === 'unirme' && (
              <label>
                Codigo de sala
                <input
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  autoComplete="off"
                  className="mono"
                />
              </label>
            )}
            <label>
              Contrasena
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
              />
            </label>
            <button type="submit" disabled={!romReady || password.length === 0}>
              {mode === 'crear' ? 'Crear sala' : 'Entrar'}
            </button>
            {!romReady && <p className="note">Carga tu ROM antes de abrir una sala.</p>}
          </form>
        </>
      ) : (
        <>
          <dl className="kv">
            <div className="kv__row">
              <dt>Estado</dt>
              <dd>{PHASE_LABEL[state.phase]}</dd>
            </div>
            {state.roomCode && (
              <div className="kv__row">
                <dt>Codigo</dt>
                <dd className="mono room-code">{state.roomCode}</dd>
              </div>
            )}
            {state.peerRom && (
              <div className="kv__row">
                <dt>Su ROM</dt>
                <dd title={state.peerRom.fileName}>{state.peerRom.fileName}</dd>
              </div>
            )}
          </dl>

          {state.phase === 'esperando-companero' && (
            <p className="note">
              Dictale el codigo y la contrasena a tu companero. Tiene que cargar su propia copia
              del juego.
            </p>
          )}

          {state.compatibility && state.compatibility.level !== 'identica' && (
            <p className={state.compatibility.level === 'bloqueo' ? 'alert' : 'warn'}>
              {state.compatibility.message}
            </p>
          )}

          <button type="button" onClick={onLeave}>
            Salir de la sala
          </button>
        </>
      )}

      {state.error && (
        <p className="alert" role="alert">
          {state.error}
        </p>
      )}
    </section>
  );
};

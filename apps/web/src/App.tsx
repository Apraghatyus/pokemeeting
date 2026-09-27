import { useEffect, useRef } from 'react';
import type { RomFingerprint } from '@emupoke/protocol';
import { DEFAULT_KEY_BINDINGS } from './core/mgbaCore';
import { useEmulator } from './core/useEmulator';
import { useSession } from './net/useSession';
import { PartnerPanel } from './ui/PartnerPanel';
import { RoomDropZoneHint, RomDropZone } from './ui/RomDropZone';
import { RomInfoCard } from './ui/RomInfoCard';
import { RoomPanel } from './ui/RoomPanel';
import { Toolbar } from './ui/Toolbar';

const PARTNER_STATUS: Record<string, string> = {
  'sin-sala': 'Sin conexion',
  'esperando-companero': 'Esperando a que entre tu companero',
  conectando: 'Estableciendo conexion...',
  conectada: 'Conectado',
  perdida: 'Conexion perdida',
};

export const App = () => {
  const emulator = useEmulator();
  const { state } = emulator;
  const hasRom = state.header !== null && state.platform !== null;

  // La huella de la ROM va en una ref y no en el estado de la sesion porque los
  // callbacks de la senalizacion viven mas que el render que los creo: leerla
  // por ref evita capturar un valor viejo.
  const romRef = useRef<RomFingerprint | null>(null);
  useEffect(() => {
    romRef.current =
      state.header && state.romName
        ? {
            title: state.header.title,
            gameCode: state.header.gameCode,
            version: state.header.version,
            crc32: state.header.crc32,
            fileName: state.romName,
          }
        : null;
  }, [state.header, state.romName]);

  const session = useSession(emulator.canvasRef, romRef);

  return (
    <div className="app">
      <header className="app__header">
        <h1>
          Emupoke <span>Together</span>
        </h1>
        <p className="app__tagline">Emulador de Pokemon en el navegador, para jugar acompanado.</p>
      </header>

      <main className="app__main">
        <div className="stage">
          {/* El canvas se monta siempre: el nucleo lo necesita en el DOM para
              arrancar, incluso antes de que haya una ROM elegida. */}
          <div className="screen">
            <canvas ref={emulator.canvasRef} className="screen__canvas" width={240} height={160} />
            {!hasRom && (
              <div className="screen__overlay">
                <RomDropZone
                  onRom={emulator.openRom}
                  disabled={state.status !== 'ready'}
                  hint={RoomDropZoneHint(state.status)}
                />
              </div>
            )}
          </div>

          <Toolbar
            state={state}
            onTogglePause={emulator.togglePause}
            onReset={emulator.reset}
            onSaveState={emulator.saveState}
            onLoadState={emulator.loadState}
            onDownloadSave={emulator.downloadSave}
            onImportSave={emulator.importSave}
            onFastForward={emulator.setFastForward}
            onVolume={emulator.setVolume}
          />

          {state.error && (
            <p className="alert" role="alert">
              {state.error}
            </p>
          )}
          {state.lastSaveAt && (
            <p className="note">
              El juego ha guardado en {new Date(state.lastSaveAt).toLocaleTimeString('es')} y la
              partida se ha persistido en este navegador.
            </p>
          )}
        </div>

        <aside className="sidebar">
          <RoomPanel
            state={session.state}
            romReady={hasRom}
            onCreate={(password) => void session.createRoom(password)}
            onJoin={(code, password) => void session.joinRoom(code, password)}
            onLeave={session.leave}
          />

          <PartnerPanel
            stream={session.state.remoteStream}
            status={PARTNER_STATUS[session.state.phase] ?? 'Sin conexion'}
          />

          {hasRom && (
            <RomInfoCard
              header={state.header!}
              platform={state.platform!}
              romName={state.romName!}
            />
          )}

          <section className="panel">
            <h2>Controles</h2>
            <dl className="kv">
              {DEFAULT_KEY_BINDINGS.map(([key, input]) => (
                <div className="kv__row" key={input}>
                  <dt>{input}</dt>
                  <dd className="mono">{key}</dd>
                </div>
              ))}
            </dl>
          </section>

          {state.log.length > 0 && (
            <section className="panel">
              <h2>Registro del nucleo</h2>
              <pre className="log">{state.log.join('\n')}</pre>
            </section>
          )}
        </aside>
      </main>
    </div>
  );
};

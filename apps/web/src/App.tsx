import { useEmulator } from './core/useEmulator';
import { PartnerPanel } from './ui/PartnerPanel';
import { RomDropZone } from './ui/RomDropZone';
import { RomInfoCard } from './ui/RomInfoCard';
import { Toolbar } from './ui/Toolbar';
import { DEFAULT_KEY_BINDINGS } from './core/mgbaCore';

const bootHint = (status: string): string => {
  switch (status) {
    case 'booting':
      return 'Arrancando el nucleo del emulador...';
    case 'error':
      return 'El nucleo no ha podido arrancar.';
    default:
      return 'Formato admitido: .gba';
  }
};

export const App = () => {
  const emulator = useEmulator();
  const { state } = emulator;
  const hasRom = state.header !== null && state.platform !== null;

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
                  hint={bootHint(state.status)}
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
              El juego ha guardado en{' '}
              {new Date(state.lastSaveAt).toLocaleTimeString('es')} y la partida se ha persistido en
              este navegador.
            </p>
          )}
        </div>

        <aside className="sidebar">
          {hasRom && (
            <RomInfoCard
              header={state.header!}
              platform={state.platform!}
              romName={state.romName!}
            />
          )}

          <PartnerPanel />

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

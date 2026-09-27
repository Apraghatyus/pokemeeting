import { useEffect, useRef, useState } from 'react';
import type { RomFingerprint } from '@emupoke/protocol';
import { DEFAULT_KEY_BINDINGS } from './core/mgbaCore';
import { useEmulator } from './core/useEmulator';
import { useKeyboardOwnership } from './core/useKeyboardOwnership';
import { useSession } from './net/useSession';
import { RomDropZone, RoomDropZoneHint } from './ui/RomDropZone';
import { RomInfoCard } from './ui/RomInfoCard';
import { RoomModal } from './ui/RoomModal';
import { Stage } from './ui/Stage';
import { Toolbar } from './ui/Toolbar';
import { TouchControls } from './ui/TouchControls';
import { TopBar } from './ui/TopBar';

export const App = () => {
  const emulator = useEmulator();
  const { state } = emulator;
  const hasRom = state.header !== null && state.platform !== null;

  const [roomOpen, setRoomOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // En movil los controles tactiles salen solos; en escritorio se pueden
  // encender desde el menu, que tambien sirve para probarlos.
  const [touchPad, setTouchPad] = useState(
    () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
  );

  // Con el modal o el menu abiertos el teclado es de la interfaz aunque el foco
  // este en un boton: si no, las flechas moverian al personaje por detras.
  const keyboardOwner = useKeyboardOwnership(emulator.coreRef, roomOpen || menuOpen);

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
      <TopBar
        session={session.state}
        keyboardOwner={keyboardOwner}
        onOpenRoom={() => setRoomOpen(true)}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        menuOpen={menuOpen}
      />

      <main className="app__main">
        <Stage
          canvasRef={emulator.canvasRef}
          remoteStream={session.state.remoteStream}
          partnerLabel={session.state.peerRom?.fileName ?? 'Tu companero'}
          hasRom={hasRom}
          dropzone={
            <RomDropZone
              onRom={emulator.openRom}
              disabled={state.status !== 'ready'}
              hint={RoomDropZoneHint(state.status)}
            />
          }
        />

        {touchPad && hasRom && <TouchControls coreRef={emulator.coreRef} />}

        {state.error && (
          <p className="alert" role="alert">
            {state.error}
          </p>
        )}

        {menuOpen && (
          <div className="drawer">
            <section className="panel panel--wide">
              <h2>Emulador</h2>
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
              {state.lastSaveAt && (
                <p className="note">
                  Guardado a las {new Date(state.lastSaveAt).toLocaleTimeString('es')}. La partida
                  queda en este navegador.
                </p>
              )}
            </section>

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
              <p className="hint">
                Mientras escribes en un campo, el juego suelta el teclado y lo recupera al salir.
              </p>
              <button
                type="button"
                className={touchPad ? 'is-active' : undefined}
                onClick={() => setTouchPad((v) => !v)}
              >
                {touchPad ? 'Ocultar mando tactil' : 'Mostrar mando tactil'}
              </button>
            </section>

            {state.log.length > 0 && (
              <section className="panel">
                <h2>Registro del nucleo</h2>
                <pre className="log">{state.log.join('\n')}</pre>
              </section>
            )}
          </div>
        )}
      </main>

      <RoomModal
        open={roomOpen}
        onClose={() => setRoomOpen(false)}
        state={session.state}
        romReady={hasRom}
        onCreate={(password) => void session.createRoom(password)}
        onJoin={(code, password) => void session.joinRoom(code, password)}
        onLeave={() => {
          session.leave();
          setRoomOpen(false);
        }}
      />
    </div>
  );
};

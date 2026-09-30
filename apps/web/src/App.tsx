import { useEffect, useRef, useState } from 'react';
import type { RomFingerprint } from '@emupoke/protocol';
import { DEFAULT_KEY_BINDINGS } from './core/mgbaCore';
import { useEmulator } from './core/useEmulator';
import { useKeyboardOwnership } from './core/useKeyboardOwnership';
import { useSession } from './net/useSession';
import { RandomizerModal } from './ui/RandomizerModal';
import { RomDropZone, RoomDropZoneHint } from './ui/RomDropZone';
import { RomInfoCard } from './ui/RomInfoCard';
import { RoomModal } from './ui/RoomModal';
import { Stage } from './ui/Stage';
import { Toolbar } from './ui/Toolbar';
import { TouchControls } from './ui/TouchControls';
import { TopBar } from './ui/TopBar';
import { VoiceBar } from './ui/VoiceBar';

export const App = () => {
  const emulator = useEmulator();
  const { state } = emulator;
  const hasRom = state.header !== null && state.platform !== null;

  const [roomOpen, setRoomOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [randomizerOpen, setRandomizerOpen] = useState(false);

  // En movil los controles tactiles salen solos; en escritorio se pueden
  // encender desde el menu, que tambien sirve para probarlos.
  const [touchPad, setTouchPad] = useState(
    () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
  );

  // Con el modal o el menu abiertos el teclado es de la interfaz aunque el foco
  // este en un boton: si no, las flechas moverian al personaje por detras.
  const keyboardOwner = useKeyboardOwnership(
    emulator.coreRef,
    roomOpen || menuOpen || randomizerOpen,
  );

  // Al cargar una ROM se pregunta como quiere jugarse, antes de empezar:
  // aleatorizar despues de jugar un rato significa perder la partida. No se
  // pregunta por las ROMs que generamos nosotros, o seria un bucle.
  useEffect(() => {
    if (state.romSource === 'usuario' && state.romName) setRandomizerOpen(true);
  }, [state.romName, state.romSource]);

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
        volume={state.volume}
        onVolume={emulator.setVolume}
        onToggleMute={emulator.toggleMute}
        volumeDisabled={!hasRom}
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

        <VoiceBar
          voice={session.state.voice}
          connected={session.state.phase === 'conectada'}
          onToggleMic={() => void session.toggleMic()}
          onToggleMute={session.togglePartnerMute}
          onVolume={session.setPartnerVolume}
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
                onExportState={emulator.exportState}
                onImportSave={emulator.importSave}
                onFastForward={emulator.setFastForward}
              />
              {state.lastSaveAt && (
                <p className="note">
                  Guardado a las {new Date(state.lastSaveAt).toLocaleTimeString('es')}. La partida
                  queda en este navegador.
                </p>
              )}
            </section>

            {hasRom && (
              <>
                <RomInfoCard
                  header={state.header!}
                  platform={state.platform!}
                  romName={state.romName!}
                />
                <section className="panel">
                  <h2>Cambiar de juego</h2>
                  <p className="hint">
                    Cierra esta ROM y vuelve a la pantalla de carga para elegir otra.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      emulator.closeRom();
                    }}
                  >
                    Cargar otra ROM
                  </button>
                </section>
              </>
            )}

            {hasRom && (
              <section className="panel">
                <h2>Aleatorizar</h2>
                <p className="hint">
                  Cambia que Pokemon, objetos y entrenadores aparecen en tu partida.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setRandomizerOpen(true);
                  }}
                >
                  Abrir opciones
                </button>
                {state.romSource === 'generada' && (
                  <p className="hint">
                    Estas jugando una copia aleatorizada. Aleatorizar otra vez parte siempre de tu
                    ROM original, no de esta.
                  </p>
                )}
              </section>
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

      <RandomizerModal
        open={randomizerOpen}
        onClose={() => setRandomizerOpen(false)}
        baseRom={emulator.baseRomRef}
        gameCode={state.header?.gameCode ?? null}
        yaAleatorizada={state.romSource === 'generada'}
        onRandomized={emulator.openRomBytes}
        onContinuar={emulator.openSavedGame}
        onBorrar={emulator.deleteSavedGame}
      />

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
        onRetry={session.retryNow}
      />
    </div>
  );
};

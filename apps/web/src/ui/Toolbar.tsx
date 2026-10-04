import { useRef, useState } from 'react';
import type { EmulatorState } from '../core/useEmulator';

type Props = {
  state: EmulatorState;
  onTogglePause: () => void;
  onReset: () => void;
  onSaveState: (slot: number) => void;
  onLoadState: (slot: number) => void;
  onDownloadSave: () => void;
  onExportState: () => void;
  onImportSave: (file: File) => void;
};

const SLOT = 1;

export const Toolbar = ({
  state,
  onTogglePause,
  onReset,
  onSaveState,
  onLoadState,
  onDownloadSave,
  onExportState,
  onImportSave,
}: Props) => {
  const saveInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const playing = state.status === 'running' || state.status === 'paused';

  return (
    <div className="toolbar">
      <button type="button" disabled={!playing} onClick={onTogglePause}>
        {state.status === 'paused' ? 'Reanudar' : 'Pausa'}
      </button>
      {/* Reiniciar arranca la ROM desde cero, asi que se pierde todo lo jugado
          desde el ultimo guardado DENTRO del juego. Por eso pregunta: es un
          clic de mas la primera vez y una partida salvada cada vez que se roza
          sin querer. */}
      <button
        type="button"
        disabled={!playing}
        className={confirmando ? 'is-active' : undefined}
        onClick={() => {
          if (!confirmando) {
            setConfirmando(true);
            return;
          }
          setConfirmando(false);
          onReset();
        }}
        onBlur={() => setConfirmando(false)}
        title="Vuelve a la pantalla de inicio del juego"
      >
        {confirmando ? '¿Seguro? Se pierde lo no guardado' : 'Reiniciar partida'}
      </button>

      {/* El avance rapido ya no esta aqui: se enciende con el espacio y, en
          movil, con su boton del mando. Tenerlo ademas en el menu obligaba a
          abrirlo en mitad de la partida para algo que se usa sobre la marcha. */}

      <span className="toolbar__sep" />

      <button type="button" disabled={!playing} onClick={() => onSaveState(SLOT)}>
        Guardar estado
      </button>
      <button type="button" disabled={!playing} onClick={() => onLoadState(SLOT)}>
        Cargar estado
      </button>

      <span className="toolbar__sep" />

      <button type="button" disabled={!playing} onClick={onDownloadSave}>
        Exportar partida
      </button>
      {/* El estado sirve aunque no se haya guardado dentro del juego: captura
          la memoria tal y como esta ahora mismo. */}
      <button type="button" disabled={!playing} onClick={onExportState}>
        Exportar estado
      </button>
      <button type="button" disabled={!playing} onClick={() => saveInputRef.current?.click()}>
        Importar partida
      </button>
      <input
        ref={saveInputRef}
        type="file"
        hidden
        accept=".sav,.srm"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportSave(file);
          event.target.value = '';
        }}
      />
    </div>
  );
};

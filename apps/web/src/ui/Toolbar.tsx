import { useRef } from 'react';
import type { EmulatorState } from '../core/useEmulator';

type Props = {
  state: EmulatorState;
  onTogglePause: () => void;
  onReset: () => void;
  onSaveState: (slot: number) => void;
  onLoadState: (slot: number) => void;
  onDownloadSave: () => void;
  onImportSave: (file: File) => void;
  onFastForward: (enabled: boolean) => void;
  onVolume: (percent: number) => void;
};

const SLOT = 1;

export const Toolbar = ({
  state,
  onTogglePause,
  onReset,
  onSaveState,
  onLoadState,
  onDownloadSave,
  onImportSave,
  onFastForward,
  onVolume,
}: Props) => {
  const saveInputRef = useRef<HTMLInputElement | null>(null);
  const playing = state.status === 'running' || state.status === 'paused';

  return (
    <div className="toolbar">
      <button type="button" disabled={!playing} onClick={onTogglePause}>
        {state.status === 'paused' ? 'Reanudar' : 'Pausa'}
      </button>
      <button type="button" disabled={!playing} onClick={onReset}>
        Reiniciar
      </button>

      {/* Avance rapido mientras se mantiene pulsado, como en mGBA de escritorio. */}
      <button
        type="button"
        disabled={!playing}
        className={state.fastForward ? 'is-active' : undefined}
        onPointerDown={() => onFastForward(true)}
        onPointerUp={() => onFastForward(false)}
        onPointerLeave={() => onFastForward(false)}
      >
        Avance rapido
      </button>

      <span className="toolbar__sep" />

      <button type="button" disabled={!playing} onClick={() => onSaveState(SLOT)}>
        Guardar estado
      </button>
      <button type="button" disabled={!playing} onClick={() => onLoadState(SLOT)}>
        Cargar estado
      </button>

      <span className="toolbar__sep" />

      <button type="button" disabled={!playing} onClick={onDownloadSave}>
        Exportar .sav
      </button>
      <button type="button" disabled={!playing} onClick={() => saveInputRef.current?.click()}>
        Importar .sav
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

      <label className="toolbar__volume">
        Volumen
        <input
          type="range"
          min={0}
          max={100}
          value={state.volume}
          onChange={(event) => onVolume(Number(event.target.value))}
        />
      </label>
    </div>
  );
};

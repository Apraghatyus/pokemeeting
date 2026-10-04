import { useRef, useState, type ReactNode } from 'react';
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

/**
 * Las acciones del emulador.
 *
 * Se reparten en dos formas distintas a proposito, y no por decorar: las de
 * arriba son cosas que le pasan al juego AHORA -parar, reiniciar, congelar el
 * momento- y van sueltas; las de abajo van en parejas porque son lo mismo en
 * los dos sentidos, y verlas juntas es lo que deja claro que guardar y cargar
 * usan la misma ranura, o que lo que exportas es lo que luego importas.
 */
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
    <div className="acciones">
      <div className="baldosas">
        <Baldosa
          icono={state.status === 'paused' ? <IconoReanudar /> : <IconoPausa />}
          etiqueta={state.status === 'paused' ? 'Reanudar' : 'Pausa'}
          disabled={!playing}
          onClick={onTogglePause}
        />

        {/* Reiniciar arranca la ROM desde cero, asi que se pierde todo lo
            jugado desde el ultimo guardado DENTRO del juego. Por eso pregunta:
            es un clic de mas la primera vez y una partida salvada cada vez que
            se roce sin querer. */}
        <Baldosa
          icono={<IconoReiniciar />}
          etiqueta={confirmando ? '¿Seguro?' : 'Reiniciar'}
          titulo={
            confirmando
              ? 'Se pierde todo lo jugado desde el ultimo guardado'
              : 'Vuelve a la pantalla de inicio del juego'
          }
          disabled={!playing}
          activa={confirmando}
          onClick={() => {
            if (!confirmando) {
              setConfirmando(true);
              return;
            }
            setConfirmando(false);
            onReset();
          }}
          onBlur={() => setConfirmando(false)}
        />

        {/* El estado sirve aunque no se haya guardado dentro del juego: captura
            la memoria tal y como esta ahora mismo. */}
        <Baldosa
          icono={<IconoEstado />}
          etiqueta="Exportar estado"
          titulo="Guarda el momento exacto, aunque no hayas guardado en el juego"
          disabled={!playing}
          onClick={onExportState}
        />
      </div>

      {/* El avance rapido no esta aqui: se enciende con el espacio y, en movil,
          con su boton del mando. Tenerlo ademas en el menu obligaba a abrirlo
          en mitad de la partida para algo que se usa sobre la marcha. */}

      <div className="pares">
        <div className="par">
          <button type="button" disabled={!playing} onClick={() => onSaveState(SLOT)}>
            Guardar estado
          </button>
          <button type="button" disabled={!playing} onClick={() => onLoadState(SLOT)}>
            Cargar estado
          </button>
        </div>
        <div className="par">
          <button type="button" disabled={!playing} onClick={onDownloadSave}>
            Exportar partida
          </button>
          <button
            type="button"
            disabled={!playing}
            onClick={() => saveInputRef.current?.click()}
          >
            Importar partida
          </button>
        </div>
      </div>

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

type BaldosaProps = {
  icono: ReactNode;
  etiqueta: string;
  titulo?: string;
  disabled?: boolean;
  activa?: boolean;
  onClick: () => void;
  onBlur?: () => void;
};

const Baldosa = ({ icono, etiqueta, titulo, disabled, activa, onClick, onBlur }: BaldosaProps) => (
  <button
    type="button"
    className={`baldosa${activa ? ' is-active' : ''}`}
    disabled={disabled}
    title={titulo}
    onClick={onClick}
    onBlur={onBlur}
  >
    {icono}
    <span>{etiqueta}</span>
  </button>
);

/* Los iconos van aqui dentro y no como fichero aparte: son cuatro trazos cada
   uno y solo los usa esta pantalla. `currentColor` es lo que hace que sigan al
   tema sin tener que repetir los colores. */

const IconoPausa = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const IconoReanudar = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const IconoReiniciar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const IconoEstado = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 4h11l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z M8 4v5h7 M8 20v-6h8v6"
    />
  </svg>
);

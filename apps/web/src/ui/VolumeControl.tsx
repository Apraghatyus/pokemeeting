import { MAX_VOLUME } from '../core/useEmulator';

type Props = {
  /** Volumen del juego en porcentaje, de 0 a 200. */
  volume: number;
  onVolume: (percent: number) => void;
  onToggleMute: () => void;
  disabled: boolean;
};

/**
 * Volumen del juego, en la barra superior.
 *
 * Vivia dentro del menu de opciones y ahi no se encuentra: bajar el sonido es
 * de las primeras cosas que uno quiere hacer, y no deberia costar dos clics.
 */
export const VolumeControl = ({ volume, onVolume, onToggleMute, disabled }: Props) => {
  const muted = volume === 0;

  return (
    <div className="volumen">
      <button
        type="button"
        className="iconbutton"
        onClick={onToggleMute}
        disabled={disabled}
        title={muted ? 'Quitar el silencio' : 'Silenciar el juego'}
        aria-label={muted ? 'Quitar el silencio' : 'Silenciar el juego'}
      >
        {muted ? '🔇' : volume > 100 ? '🔊' : '🔉'}
      </button>
      <input
        type="range"
        min={0}
        max={MAX_VOLUME}
        step={5}
        value={volume}
        disabled={disabled}
        onChange={(event) => onVolume(Number(event.target.value))}
        aria-label="Volumen del juego"
        title={`Volumen del juego: ${volume}%`}
      />
      {/* Por encima del 100% el nucleo amplifica, y conviene que se vea. */}
      <span className={`volumen__cifra${volume > 100 ? ' is-alto' : ''}`}>{volume}%</span>
    </div>
  );
};

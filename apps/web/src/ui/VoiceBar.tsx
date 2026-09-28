import { useEffect, useRef } from 'react';
import type { VoiceState } from '../net/useSession';

type Props = {
  voice: VoiceState;
  /** true cuando hay companero al otro lado. */
  connected: boolean;
  onToggleMic: () => void;
  onToggleMute: () => void;
  onVolume: (percent: number) => void;
};

/**
 * Controles de la llamada.
 *
 * La voz va por su propio elemento de audio y no por el video de la partida,
 * que se reproduce silenciado a proposito: asi se le puede bajar el volumen a
 * la persona sin tocar nada mas, y el juego no compite con ella.
 */
export const VoiceBar = ({ voice, connected, onToggleMic, onToggleMute, onVolume }: Props) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.srcObject !== voice.partnerStream) {
      audio.srcObject = voice.partnerStream;
      if (voice.partnerStream) void audio.play().catch(() => {});
    }
    audio.volume = voice.partnerVolume / 100;
    audio.muted = voice.partnerMuted;
  }, [voice.partnerStream, voice.partnerVolume, voice.partnerMuted]);

  const micOn = voice.mic === 'encendido';
  const hearsUs = voice.mic === 'pidiendo';

  return (
    // El elemento de audio se monta siempre, aunque no haya conexion. Si se
    // montara solo al conectar, el efecto de arriba ya habria pasado y la voz
    // se quedaria sin asignar: la pista remota llega ANTES de que la conexion
    // se declare establecida.
    <div className={`voice${connected ? '' : ' voice--oculta'}`}>
      {/* Sin controles: la voz se gobierna desde los botones de al lado. */}
      <audio ref={audioRef} autoPlay />

      <button
        type="button"
        className={`voice__mic${micOn ? ' is-on' : ''}`}
        onClick={onToggleMic}
        disabled={hearsUs}
        title={micOn ? 'Silenciar tu microfono' : 'Hablar con tu companero'}
      >
        <span aria-hidden="true">{micOn ? '🎙' : '🔇'}</span>
        {hearsUs ? 'Pidiendo permiso...' : micOn ? 'Micro abierto' : 'Hablar'}
      </button>

      <div className="voice__partner">
        <button
          type="button"
          className={voice.partnerMuted ? 'is-active' : undefined}
          onClick={onToggleMute}
          title={voice.partnerMuted ? 'Volver a oirle' : 'Silenciar a tu companero'}
          aria-label={voice.partnerMuted ? 'Volver a oirle' : 'Silenciar a tu companero'}
        >
          {voice.partnerMuted ? '🔇' : '🔊'}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={voice.partnerVolume}
          disabled={voice.partnerMuted}
          onChange={(event) => onVolume(Number(event.target.value))}
          aria-label="Volumen de tu companero"
          title={`Volumen de tu companero: ${voice.partnerVolume}%`}
        />
        {!voice.partnerStream && <span className="voice__hint">aun no habla</span>}
      </div>

      {voice.micError && <span className="voice__error">{voice.micError}</span>}
    </div>
  );
};

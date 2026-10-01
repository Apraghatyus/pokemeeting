import { useEffect, useRef, useState } from 'react';
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
 * Controles de la llamada, flotando sobre la partida.
 *
 * Antes eran una barra debajo de la pantalla. Ocupaba sitio todo el rato para
 * dos botones que se tocan de vez en cuando, y ese sitio se lo quitaba al
 * juego. Ahora van encima, en iconos, y el volumen del companero se despliega
 * solo cuando hace falta.
 *
 * La voz va por su propio elemento de audio y no por el video de la partida,
 * que se reproduce silenciado a proposito: asi se le puede bajar el volumen a
 * la persona sin tocar nada mas, y el juego no compite con ella.
 */
export const VoiceBar = ({ voice, connected, onToggleMic, onToggleMute, onVolume }: Props) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [volumenAbierto, setVolumenAbierto] = useState(false);

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
  const pidiendo = voice.mic === 'pidiendo';

  return (
    // El elemento de audio se monta siempre, aunque no haya conexion. Si se
    // montara solo al conectar, el efecto de arriba ya habria pasado y la voz
    // se quedaria sin asignar: la pista remota llega ANTES de que la conexion
    // se declare establecida.
    <>
      {/* Sin controles: la voz se gobierna desde los botones de al lado. */}
      <audio ref={audioRef} autoPlay />

      {connected && (
        <>
          <button
            type="button"
            className={`flotante${micOn ? ' is-on' : ''}`}
            onClick={onToggleMic}
            disabled={pidiendo}
            title={
              pidiendo
                ? 'Pidiendo permiso al navegador...'
                : micOn
                  ? 'Silenciar tu microfono'
                  : 'Hablar con tu companero'
            }
            aria-label={micOn ? 'Silenciar tu microfono' : 'Hablar con tu companero'}
          >
            {micOn ? '🎙' : '🔇'}
          </button>

          <div className={`flotante__grupo${volumenAbierto ? ' is-abierto' : ''}`}>
            <button
              type="button"
              className={`flotante${voice.partnerMuted ? ' is-activo' : ''}`}
              onClick={onToggleMute}
              onDoubleClick={() => setVolumenAbierto((v) => !v)}
              title={
                voice.partnerMuted
                  ? 'Volver a oirle (doble clic para el volumen)'
                  : 'Silenciar a tu companero (doble clic para el volumen)'
              }
              aria-label={voice.partnerMuted ? 'Volver a oirle' : 'Silenciar a tu companero'}
            >
              {voice.partnerMuted ? '🔇' : '🔊'}
            </button>

            {/* El volumen solo estorba cuando no se esta usando, asi que se
                abre al pasar por encima o con doble clic, que es lo que queda
                a mano en una pantalla tactil. */}
            <input
              type="range"
              className="flotante__volumen"
              min={0}
              max={100}
              value={voice.partnerVolume}
              disabled={voice.partnerMuted}
              onChange={(event) => onVolume(Number(event.target.value))}
              aria-label="Volumen de tu companero"
              title={`Volumen de tu companero: ${voice.partnerVolume}%`}
            />
          </div>

          {voice.micError && (
            <span className="flotante__error" role="alert">
              {voice.micError}
            </span>
          )}
        </>
      )}
    </>
  );
};

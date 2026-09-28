import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  checkRandomizer,
  randomizeRom,
  randomizerIsRemote,
  type RandomizerStatus,
  type RandomizeSummary,
} from '../net/randomizer';
import { Modal } from './Modal';

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * La ROM que eligio el jugador, NO la que esta corriendo.
   *
   * Aleatorizar siempre parte de la original. Partir de la que corre encadenaba
   * copias sobre copias y nunca daba una partida nueva limpia.
   */
  baseRom: RefObject<{ bytes: Uint8Array; fileName: string } | null>;
  gameCode: string | null;
  /** true si lo que corre ahora ya es una copia generada por nosotros. */
  yaAleatorizada: boolean;
  /** Carga en el emulador la ROM ya aleatorizada. */
  onRandomized: (bytes: Uint8Array, fileName: string) => Promise<void>;
};

type Progress =
  | { fase: 'eligiendo' }
  | { fase: 'trabajando' }
  | { fase: 'hecho'; seed: string | null; fileName: string; summary: RandomizeSummary }
  | { fase: 'error'; message: string };

/** Alcance acordado: de momento solo Rojo Fuego y Verde Hoja. */
const SUPPORTED = new Set(['BPR', 'BPG']);

/** Lo que viene marcado al abrir: la mezcla habitual de una partida aleatoria. */
const DEFAULT_SELECTION = ['salvajes', 'iniciales', 'entrenadores', 'movimientos'];

/**
 * Se abre al cargar una ROM y pregunta como se quiere jugar.
 *
 * Es una pregunta y no un ajuste escondido en un menu porque hay que decidirla
 * antes de empezar: aleatorizar despues de jugar un rato significa perder la
 * partida.
 */
export const RandomizerModal = ({
  open,
  onClose,
  baseRom,
  gameCode,
  yaAleatorizada,
  onRandomized,
}: Props) => {
  const [status, setStatus] = useState<RandomizerStatus>({ estado: 'comprobando' });
  const [progress, setProgress] = useState<Progress>({ fase: 'eligiendo' });
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_SELECTION));
  const lastRom = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (open) void checkRandomizer().then(setStatus);
  }, [open]);

  // El reinicio se ata a abrir el modal, no a que cambie la ROM.
  //
  // Atarlo a la ROM parecia natural y era un error silencioso: al aleatorizar
  // se carga una ROM nueva, cambia su nombre y el efecto borraba el resultado
  // justo despues de producirlo, dejando el modal como si no hubiera pasado
  // nada.
  useEffect(() => {
    if (open) setProgress({ fase: 'eligiendo' });
  }, [open]);

  const supported = gameCode !== null && SUPPORTED.has(gameCode.slice(0, 3));
  const options = status.estado === 'listo' ? status.health.options : [];
  const canRandomize =
    status.estado === 'listo' && supported && selected.size > 0 && progress.fase !== 'trabajando';

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const run = async () => {
    const base = baseRom.current;
    if (!base) return;

    setProgress({ fase: 'trabajando' });
    try {
      // Siempre desde la original: asi el nombre tampoco se encadena.
      const result = await randomizeRom({ options: [...selected] }, base.bytes);
      lastRom.current = result.rom;
      const fileName = base.fileName.replace(/\.gba$/i, '') + '-aleatorizada.gba';
      await onRandomized(result.rom, fileName);
      setProgress({ fase: 'hecho', seed: result.seed, fileName, summary: result.summary });
    } catch (error) {
      setProgress({
        fase: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /** Descarga la ROM aleatorizada para poder reutilizarla sin repetir el proceso. */
  const download = () => {
    if (progress.fase !== 'hecho' || !lastRom.current) return;
    const url = URL.createObjectURL(
      new Blob([lastRom.current as BlobPart], { type: 'application/octet-stream' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = progress.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="✦"
      title={progress.fase === 'hecho' ? 'Partida aleatorizada' : 'Como quieres jugar'}
      subtitle={
        progress.fase === 'hecho'
          ? 'Ya esta corriendo tu copia aleatorizada.'
          : 'Puedes jugar la ROM tal cual, o aleatorizarla a tu gusto.'
      }
    >
      {progress.fase === 'hecho' ? (
        <Resultado progress={progress} onDownload={download} onClose={onClose} />
      ) : (
        <>
          {status.estado === 'comprobando' && <p className="hint">Buscando el servicio...</p>}

          {status.estado === 'apagado' && (
            <p className="hint">
              El servicio de aleatorizacion no esta corriendo, asi que solo puedes jugar la ROM tal
              cual. Arrancalo con <code className="mono">npm run dev:all</code>.
            </p>
          )}

          {status.estado === 'incompleto' && <p className="warn">{status.motivo}</p>}

          {status.estado === 'listo' && !supported && (
            <p className="warn">
              La aleatorizacion solo esta disponible para Rojo Fuego y Verde Hoja. Tu ROM es "
              {gameCode}".
            </p>
          )}

          {status.estado === 'listo' && supported && (
            <>
              {/* La promesa de que la ROM no se mueve solo es cierta en local.
                  Entrando por un enlace compartido viaja al ordenador de quien
                  lo abrio, y eso se dice antes de aleatorizar, no despues. */}
              {randomizerIsRemote() ? (
                <p className="warn">
                  Para aleatorizar, tu ROM se enviara al ordenador de quien abrio esta partida,
                  donde se procesa y se borra al terminar. Si prefieres que no salga de tu equipo,
                  juega tal cual.
                </p>
              ) : (
                <p className="hint">
                  Se aleatoriza tu propia copia en este ordenador. La ROM no sale de aqui.
                </p>
              )}

              {/* Aleatorizar otra vez no retoca la partida en marcha: genera
                  otra copia desde la ROM original y tira la anterior. */}
              {yaAleatorizada && (
                <p className="warn">
                  Ya estas jugando una copia aleatorizada. Si aleatorizas otra vez se genera una
                  nueva desde tu ROM original y se descarta esta, con su partida guardada.
                  Descargala antes si quieres conservarla.
                </p>
              )}

              <div className="opciones">
                {options.map((option) => (
                  <label className="opcion" key={option.id}>
                    <input
                      type="checkbox"
                      checked={selected.has(option.id)}
                      onChange={() => toggle(option.id)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <em>{option.description}</em>
                    </span>
                  </label>
                ))}
              </div>

              <div className="opciones__acciones">
                <button type="button" onClick={() => setSelected(new Set(options.map((o) => o.id)))}>
                  Marcar todo
                </button>
                <button type="button" onClick={() => setSelected(new Set())}>
                  Desmarcar
                </button>
              </div>
            </>
          )}

          {progress.fase === 'error' && <p className="alert">{progress.message}</p>}

          <div className="modal__acciones">
            <button type="button" className="button--wide" onClick={onClose}>
              Jugar tal cual
            </button>
            <button
              type="button"
              className="button--primary button--wide"
              disabled={!canRandomize}
              onClick={() => void run()}
            >
              {progress.fase === 'trabajando' ? 'Aleatorizando...' : 'Aleatorizar y jugar'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
};

const Resultado = ({
  progress,
  onDownload,
  onClose,
}: {
  progress: Extract<Progress, { fase: 'hecho' }>;
  onDownload: () => void;
  onClose: () => void;
}) => (
  <>
    {/* Unos ajustes que no tocan nada producen una ROM aparentemente normal.
        Decir que ha cambiado evita descubrirlo tras media hora jugando. */}
    {progress.summary.changed.length === 0 ? (
      <p className="warn">La ROM se genero, pero no se cambio nada.</p>
    ) : (
      <p className="note">
        Ha cambiado: <strong>{progress.summary.changed.join(', ')}</strong>.
      </p>
    )}

    {progress.summary.starters.length > 0 && (
      <div className="invite">
        <span className="invite__label">Iniciales</span>
        <strong>{progress.summary.starters.join('  /  ')}</strong>
      </div>
    )}

    <p className="hint">
      {progress.seed ? `Semilla usada: ${progress.seed}. ` : ''}
      Tu companero tendra otra aleatorizacion distinta aunque marque lo mismo: el randomizer no
      permite fijar la semilla.
    </p>

    <div className="modal__acciones">
      <button type="button" className="button--wide" onClick={onDownload}>
        Descargar la ROM
      </button>
      <button type="button" className="button--primary button--wide" onClick={onClose}>
        Empezar a jugar
      </button>
    </div>
  </>
);

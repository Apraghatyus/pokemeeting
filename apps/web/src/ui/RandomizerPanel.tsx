import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  checkRandomizer,
  randomizeRom,
  type RandomizerStatus,
} from '../net/randomizer';

type Props = {
  /** Bytes de la ROM cargada ahora mismo. */
  romBytesRef: RefObject<Uint8Array | null>;
  romName: string | null;
  gameCode: string | null;
  /** Carga en el emulador la ROM ya aleatorizada. */
  onRandomized: (bytes: Uint8Array, fileName: string) => Promise<void>;
};

type Progress =
  | { fase: 'parado' }
  | { fase: 'trabajando' }
  | { fase: 'hecho'; seed: string | null; fileName: string }
  | { fase: 'error'; message: string };

/** Alcance acordado: de momento solo Rojo Fuego y Verde Hoja. */
const SUPPORTED = new Set(['BPR', 'BPG']);

export const RandomizerPanel = ({ romBytesRef, romName, gameCode, onRandomized }: Props) => {
  const [status, setStatus] = useState<RandomizerStatus>({ estado: 'comprobando' });
  const [progress, setProgress] = useState<Progress>({ fase: 'parado' });
  const [settings, setSettings] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const settingsInput = useRef<HTMLInputElement | null>(null);
  const lastRom = useRef<Uint8Array | null>(null);

  useEffect(() => {
    void checkRandomizer().then(setStatus);
  }, []);

  const supported = gameCode !== null && SUPPORTED.has(gameCode.slice(0, 3));
  const ready = status.estado === 'listo' && settings !== null && supported;

  const run = async () => {
    const rom = romBytesRef.current;
    if (!rom || !settings) return;

    setProgress({ fase: 'trabajando' });
    try {
      const result = await randomizeRom(settings.bytes, rom);
      lastRom.current = result.rom;
      const fileName = (romName ?? 'pokemon.gba').replace(/\.gba$/i, '') + '-aleatorizada.gba';
      await onRandomized(result.rom, fileName);
      setProgress({ fase: 'hecho', seed: result.seed, fileName });
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
    <section className="panel">
      <h2>Aleatorizar</h2>

      {status.estado === 'comprobando' && <p className="hint">Buscando el servicio...</p>}

      {status.estado === 'apagado' && (
        <>
          <p className="hint">El servicio de aleatorizacion no esta corriendo.</p>
          <p className="hint">
            Arranca todo con <code className="mono">npm run dev:all</code>, o solo este con{' '}
            <code className="mono">npm run dev:randomizer</code>.
          </p>
        </>
      )}

      {status.estado === 'incompleto' && (
        <>
          <p className="warn">{status.motivo}</p>
          <p className="hint">Las instrucciones estan en tools/randomizer/LEEME.md.</p>
        </>
      )}

      {status.estado === 'listo' && (
        <>
          {!romName && <p className="hint">Carga una ROM primero.</p>}

          {romName && !supported && (
            <p className="warn">
              De momento solo Rojo Fuego y Verde Hoja. Tu ROM es "{gameCode}".
            </p>
          )}

          {romName && supported && (
            <>
              <p className="hint">
                Se aleatoriza tu propia copia en este ordenador. La ROM no sale de aqui.
              </p>

              <div className="stack">
                <button type="button" onClick={() => settingsInput.current?.click()}>
                  {settings ? `Ajustes: ${settings.name}` : 'Elegir ajustes (.rnqs)'}
                </button>
                <input
                  ref={settingsInput}
                  type="file"
                  hidden
                  accept=".rnqs"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setSettings({
                      name: file.name,
                      bytes: new Uint8Array(await file.arrayBuffer()),
                    });
                    event.target.value = '';
                  }}
                />

                <button
                  type="button"
                  className="button--primary"
                  disabled={!ready || progress.fase === 'trabajando'}
                  onClick={() => void run()}
                >
                  {progress.fase === 'trabajando' ? 'Aleatorizando...' : 'Aleatorizar y jugar'}
                </button>
              </div>

              {!settings && (
                <p className="hint">
                  Los ajustes se exportan desde el randomizer de escritorio. Pasale el mismo
                  fichero a tu companero para jugar con las mismas reglas.
                </p>
              )}

              {progress.fase === 'hecho' && (
                <>
                  <p className="note">
                    Listo, ya esta corriendo.
                    {progress.seed
                      ? ` Semilla usada: ${progress.seed}.`
                      : ' No pude leer la semilla del registro.'}
                  </p>
                  <p className="hint">
                    Tu companero tendra otra aleatorizacion distinta aunque use los mismos
                    ajustes: el randomizer no permite fijar la semilla.
                  </p>
                  <button type="button" onClick={download}>
                    Descargar la ROM aleatorizada
                  </button>
                </>
              )}

              {progress.fase === 'error' && <p className="alert">{progress.message}</p>}
            </>
          )}
        </>
      )}
    </section>
  );
};

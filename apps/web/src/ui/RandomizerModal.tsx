import { useCallback, useEffect, useState, type RefObject } from 'react';
import {
  checkRandomizer,
  randomizeRom,
  randomizerIsRemote,
  type RandomizerStatus,
  type RandomizeSummary,
} from '../net/randomizer';
import {
  cuando,
  MAX_PARTIDAS,
  nombreParaNueva,
  olvidar,
  partidasDe,
  registrar,
  resumirCambios,
  sePuedeRehacer,
  tocar,
  todasLasPartidas,
  type PartidaGuardada,
} from '../core/partidas';
import { parseGameCode } from '@emupoke/pokemon';
import { crc32 } from '../core/romHeader';
import { codificarReceta, descodificarReceta } from '../core/receta';
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
  baseRom: RefObject<{ bytes: Uint8Array; fileName: string; crc32: string } | null>;
  gameCode: string | null;
  /** true si lo que corre ahora ya es una copia generada por nosotros. */
  yaAleatorizada: boolean;
  /** Carga en el emulador la ROM ya aleatorizada. */
  onRandomized: (bytes: Uint8Array, fileName: string) => Promise<void>;
  /** Continua una partida guardada que ya esta en el nucleo. */
  onContinuar: (fileName: string) => Promise<void>;
  /** Borra los ficheros de una partida guardada. */
  onBorrar: (fileName: string) => void;
  /** Si la copia de una partida sigue en el navegador o hay que rehacerla. */
  existeGuardada: (fileName: string) => boolean;
};

type Progress =
  | { fase: 'eligiendo' }
  | { fase: 'trabajando' }
  | {
      fase: 'hecho';
      seed: string | null;
      fileName: string;
      summary: RandomizeSummary;
      /** Como rehacer esta copia, o null si no se va a poder. */
      receta: string | null;
    }
  | { fase: 'error'; message: string };

/**
 * Los juegos que el servicio sabe aleatorizar.
 *
 * Se repite aqui a proposito, para no pedirle la lista al servicio antes de
 * poder decirle al jugador si su ROM entra o no. La prueba
 * test-juegos-soportados.mjs comprueba que las dos listas coinciden.
 */
const SUPPORTED = new Set([
  // Segunda generacion, Game Boy Color
  'AAU',
  'AAX',
  'BYT',
  'BXT',
  // Tercera generacion, Game Boy Advance
  'BPR',
  'BPG',
  'AXV',
  'AXP',
  'BPE',
]);

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
  onContinuar,
  onBorrar,
  existeGuardada,
}: Props) => {
  const [status, setStatus] = useState<RandomizerStatus>({ estado: 'comprobando' });
  const [progress, setProgress] = useState<Progress>({ fase: 'eligiendo' });
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_SELECTION));
  const [partidas, setPartidas] = useState<PartidaGuardada[]>([]);
  const [otras, setOtras] = useState<PartidaGuardada[]>([]);
  const [recetaPegada, setRecetaPegada] = useState('');

  // La lista se relee al abrir: puede haber cambiado desde la vez anterior.
  const releer = useCallback(() => {
    const crc = baseRom.current?.crc32 ?? '';
    setPartidas(partidasDe(crc));
    // Las de otras ROMs tambien ocupan sitio, asi que hay que poder borrarlas
    // desde aqui: si no, con el cupo lleno de partidas de otro juego no habria
    // forma de hacer hueco.
    setOtras(todasLasPartidas().filter((p) => p.baseCrc32 !== crc));
  }, [baseRom]);

  useEffect(() => {
    if (open) releer();
  }, [open, releer]);

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
  // Un juego que aceptamos pero que nadie ha llegado a jugar por aqui.
  const juego = gameCode !== null ? parseGameCode(gameCode).game : null;
  const sinProbar = supported && juego && !juego.tested ? juego.label : null;
  // Solo se ofrece lo que ese juego tiene de verdad: en segunda generacion no
  // existen las habilidades, y marcar una casilla que no hace nada es peor que
  // no verla.
  const todas = status.estado === 'listo' ? status.health.options : [];
  const options = juego
    ? todas.filter((option) => option.generaciones.includes(juego.generacion))
    : todas;
  const guardadas = partidas.length + otras.length;
  const lleno = guardadas >= MAX_PARTIDAS;
  const canRandomize =
    status.estado === 'listo' &&
    supported &&
    selected.size > 0 &&
    !lleno &&
    progress.fase !== 'trabajando';

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

      // Nombre propio para cada copia: asi conviven varias partidas de la
      // misma ROM sin pisarse el fichero de guardado.
      const fileName = nombreParaNueva(base.fileName);
      const generada = crc32(result.rom);
      await onRandomized(result.rom, fileName);
      registrar({
        fichero: fileName,
        baseNombre: base.fileName,
        baseCrc32: base.crc32,
        semilla: result.seed,
        ajustes: result.ajustes,
        crc32: generada,
        cambiado: result.summary.changed,
      });
      setProgress({
        fase: 'hecho',
        seed: result.seed,
        fileName,
        summary: result.summary,
        // La receta solo tiene sentido si de verdad se puede rehacer con ella.
        receta:
          result.reproducible && result.seed && result.ajustes
            ? codificarReceta({
                baseCrc32: base.crc32,
                crc32: generada,
                semilla: result.seed,
                ajustes: result.ajustes,
              })
            : null,
      });
    } catch (error) {
      setProgress({
        fase: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /**
   * Rehace una partida a partir de una receta que trae el jugador.
   *
   * El mismo camino que `rehacer`, pero para una copia de la que este
   * navegador no sabe nada: otro ordenador, u otra persona que quiere jugar
   * exactamente el mismo mundo.
   */
  const desdeReceta = async () => {
    const base = baseRom.current;
    const receta = descodificarReceta(recetaPegada);
    if (!base) return;
    if (!receta) {
      setProgress({ fase: 'error', message: 'Esa receta no se entiende. Copiala entera.' });
      return;
    }
    if (receta.baseCrc32 !== base.crc32) {
      setProgress({
        fase: 'error',
        message:
          'Esa receta es de otra copia de la ROM original. Hace falta exactamente la misma con la que se creo.',
      });
      return;
    }

    setProgress({ fase: 'trabajando' });
    try {
      const result = await randomizeRom(
        { settingsString: receta.ajustes, seed: receta.semilla },
        base.bytes,
      );
      const generada = crc32(result.rom);
      if (generada !== receta.crc32) {
        setProgress({
          fase: 'error',
          message:
            'Lo generado no coincide con lo que dice la receta, seguramente por una version distinta del randomizer. No lo cargo: seria otro mundo.',
        });
        return;
      }
      const fileName = nombreParaNueva(base.fileName);
      await onRandomized(result.rom, fileName);
      registrar({
        fichero: fileName,
        baseNombre: base.fileName,
        baseCrc32: base.crc32,
        semilla: receta.semilla,
        ajustes: receta.ajustes,
        crc32: generada,
        cambiado: result.summary.changed,
      });
      onClose();
    } catch (error) {
      setProgress({
        fase: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /**
   * Vuelve a generar una partida cuya copia ya no esta en este navegador.
   *
   * Es lo que sustituye a descargar la ROM. Se genera otra vez con su semilla
   * y sus ajustes, y se comprueba que sale exactamente la misma: si no
   * coincidiera, el mundo seria otro y el guardado dejaria de encajar, asi que
   * antes de cargar nada se avisa.
   */
  const rehacer = async (partida: PartidaGuardada) => {
    const base = baseRom.current;
    if (!base || !partida.semilla || !partida.ajustes) return;
    if (base.crc32 !== partida.baseCrc32) {
      setProgress({
        fase: 'error',
        message: 'Esa partida se hizo con otra copia de la ROM original.',
      });
      return;
    }

    setProgress({ fase: 'trabajando' });
    try {
      const result = await randomizeRom(
        { settingsString: partida.ajustes, seed: partida.semilla },
        base.bytes,
      );
      const generada = crc32(result.rom);
      if (partida.crc32 && generada !== partida.crc32) {
        setProgress({
          fase: 'error',
          message:
            'La copia rehecha no es identica a la original, seguramente por un randomizer distinto al de entonces. No la cargo: tu guardado no encajaria con ella.',
        });
        return;
      }
      // Con el mismo nombre de fichero, el guardado que ya hubiera sigue
      // siendo el suyo.
      await onRandomized(result.rom, partida.fichero);
      tocar(partida.id);
      onClose();
    } catch (error) {
      setProgress({
        fase: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
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
        <Resultado progress={progress} onClose={onClose} />
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
              La aleatorizacion esta disponible para Oro, Plata y Cristal, y para Rubi, Zafiro,
              Esmeralda, Rojo Fuego y Verde Hoja. Tu ROM es "
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

              {/* Rojo Fuego y Verde Hoja se han arrancado y jugado de verdad;
                  los otros tres comparten la misma estructura y el randomizer
                  los acepta, pero nadie los ha probado aqui todavia. Decirlo
                  cuesta una linea y evita que alguien pierda una tarde sin
                  saber si el raro es el juego o es el. */}
              {sinProbar && (
                <p className="hint">
                  De {sinProbar} todavia no hemos comprobado una partida entera por aqui. Deberia
                  funcionar igual: si algo sale raro, es util saberlo.
                </p>
              )}

              {partidas.length > 0 && (
                <div className="partidas">
                  <p className="partidas__titulo">Partidas guardadas de esta ROM</p>
                  {partidas.map((partida) => {
                    const aqui = existeGuardada(partida.fichero);
                    const rehacible = sePuedeRehacer(partida);
                    return (
                      <div className="partida" key={partida.id}>
                        <button
                          type="button"
                          className="partida__abrir"
                          // Una partida cuya copia ya no esta y que tampoco se
                          // sabe rehacer no lleva a ningun sitio: se deja a la
                          // vista para poder borrarla, pero sin abrirla.
                          disabled={!aqui && !rehacible}
                          onClick={() => {
                            if (aqui) {
                              tocar(partida.id);
                              void onContinuar(partida.fichero).then(onClose);
                            } else {
                              void rehacer(partida);
                            }
                          }}
                        >
                          <strong>{resumirCambios(partida.cambiado)}</strong>
                          <em>
                            {cuando(partida.creada)}
                            {partida.semilla ? ` · semilla ${partida.semilla.slice(-6)}` : ''}
                            {aqui ? '' : rehacible ? ' · hay que rehacerla' : ' · ya no esta'}
                          </em>
                        </button>
                        <button
                          type="button"
                          className="partida__borrar"
                          title="Borrar esta partida"
                          aria-label={`Borrar la partida de ${cuando(partida.creada)}`}
                          onClick={() => {
                            onBorrar(partida.fichero);
                            olvidar(partida.id);
                            releer();
                          }}
                        >
                          x
                        </button>
                      </div>
                    );
                  })}
                  <p className="hint">
                    Aleatorizar de nuevo crea otra partida aparte. Ninguna se pierde.
                  </p>
                </div>
              )}


              {/* Con el cupo lleno hay que poder hacer hueco desde aqui, incluso
                  si lo ocupan partidas de otro juego. */}
              {lleno && otras.length > 0 && (
                <div className="partidas">
                  <p className="partidas__titulo">De otras ROMs</p>
                  {otras.map((partida) => (
                    <div className="partida" key={partida.id}>
                      <span className="partida__ajena">
                        <strong>{partida.baseNombre.replace(/\.gba$/i, '')}</strong>
                        <em>
                          {resumirCambios(partida.cambiado)} · {cuando(partida.creada)}
                        </em>
                      </span>
                      <button
                        type="button"
                        className="partida__borrar"
                        title="Borrar esta partida"
                        aria-label={`Borrar la partida de ${partida.baseNombre}`}
                        onClick={() => {
                          onBorrar(partida.fichero);
                          olvidar(partida.id);
                          releer();
                        }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* La vuelta de la receta: alguien que juega desde otro ordenador,
                  o que perdio los datos del navegador, trae su linea de texto y
                  su ROM original y recupera el mismo mundo exacto. */}
              <details className="partidas">
                <summary className="partidas__titulo">Tengo una receta</summary>
                <textarea
                  className="field__value mono receta-pegada"
                  rows={2}
                  value={recetaPegada}
                  placeholder="EMUPOKE1..."
                  onChange={(event) => setRecetaPegada(event.target.value)}
                  aria-label="Receta de una partida"
                />
                <button
                  type="button"
                  className="button--wide"
                  disabled={recetaPegada.trim() === '' || lleno || progress.fase === 'trabajando'}
                  onClick={() => void desdeReceta()}
                >
                  Rehacer esa partida
                </button>
                <p className="hint">
                  Hace falta la misma ROM original con la que se creo. La receta sola no sirve de
                  nada: no lleva el juego dentro.
                </p>
              </details>

              {lleno && (
                <p className="warn">
                  Tienes {guardadas} partidas guardadas, el maximo. Cada una es una ROM entera
                  ocupando sitio en el navegador: borra alguna para crear otra.
                </p>
              )}

              {yaAleatorizada && partidas.length === 0 && (
                <p className="hint">Ya estas jugando una copia aleatorizada.</p>
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
  onClose,
}: {
  progress: Extract<Progress, { fase: 'hecho' }>;
  onClose: () => void;
}) => {
  const [copiada, setCopiada] = useState<'no' | 'si' | 'fallo'>('no');

  const copiar = async () => {
    if (!progress.receta) return;
    try {
      await navigator.clipboard.writeText(progress.receta);
      setCopiada('si');
      setTimeout(() => setCopiada('no'), 2200);
    } catch {
      // El portapapeles puede estar denegado. La receta sigue a la vista.
      setCopiada('fallo');
    }
  };

  return (
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

      {progress.summary.omitidas.length > 0 && (
        <p className="warn">
          Este juego no tiene {progress.summary.omitidas.join(', ').toLowerCase()}, asi que eso se
          quedo como estaba.
        </p>
      )}

      {progress.summary.starters.length > 0 && (
        <div className="invite">
          <span className="invite__label">Iniciales</span>
          <strong>{progress.summary.starters.join('  /  ')}</strong>
        </div>
      )}

      {progress.receta ? (
        <>
          <label className="field">
            Receta de esta partida
            <output className="field__value mono receta">{progress.receta}</output>
          </label>
          <button type="button" className="button--wide" onClick={() => void copiar()}>
            {copiada === 'si' ? 'Receta copiada' : 'Copiar la receta'}
          </button>
          <p className="hint">
            {copiada === 'fallo'
              ? 'El navegador no ha dejado copiar. Puedes leerla de arriba.'
              : 'Tu partida se queda guardada en este navegador, asi que normalmente no te hara falta. Guarda la receta por si juegas desde otro ordenador o pierdes los datos: con ella y tu ROM original se vuelve a generar este mismo mundo, identico. Tambien puedes darsela a tu companero para que juegue el mismo.'}
          </p>
        </>
      ) : (
        <p className="warn">
          Esta copia no se va a poder rehacer{progress.seed ? ` (semilla ${progress.seed})` : ''}.
          Vive solo en este navegador: si borras sus datos, se pierde.
        </p>
      )}

      <div className="modal__acciones">
        <button type="button" className="button--primary button--wide" onClick={onClose}>
          Empezar a jugar
        </button>
      </div>
    </>
  );
};

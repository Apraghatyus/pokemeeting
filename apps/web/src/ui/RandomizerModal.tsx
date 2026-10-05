import { useCallback, useEffect, useState, type RefObject } from 'react';
import {
  checkRandomizer,
  randomizeRom,
  type PuestoEnCola,
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
import { codificarSemilla, descodificarSemilla } from '../core/semilla';
import { empaquetar, leerPaquete, nombreDeFichero } from '../core/paquete';
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
  /** El guardado de una partida, para poder llevarsela a otro aparato. */
  leerGuardado: (fileName: string) => Uint8Array | null;
  /** Mete un guardado traido de fuera. */
  escribirGuardado: (fileName: string, bytes: Uint8Array) => Promise<void>;
};

type Progress =
  | { fase: 'eligiendo' }
  | { fase: 'trabajando'; cola?: PuestoEnCola | null }
  | {
      fase: 'hecho';
      seed: string | null;
      fileName: string;
      summary: RandomizeSummary;
      /** Como rehacer esta copia, o null si no se va a poder. */
      semilla: string | null;
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
/**
 * Lo que se le dice a quien espera.
 *
 * Se da una estimacion y no solo el puesto porque "eres el cuarto" no responde
 * la pregunta de verdad, que es si da tiempo a ir por un cafe. Y se redondea
 * hacia arriba a proposito: quedarse corto es lo unico que hace que la gente
 * recargue la pagina.
 */
const textoDeEspera = (cola: PuestoEnCola): string => {
  if (cola.delante === 0) return 'Eres el siguiente. Empieza en cuanto quede un hueco.';

  const segundos = cola.segundosPorCopia;
  if (segundos === null || cola.atendiendo === 0) {
    return `Hay ${cola.delante} esperando antes que tu.`;
  }

  // Las que se hacen a la vez dividen la espera: con cuatro en marcha, el que
  // tiene ocho delante espera dos turnos, no ocho.
  const minutos = Math.ceil((cola.delante / cola.atendiendo) * segundos / 60);
  return (
    `Hay ${cola.delante} esperando antes que tu: ` +
    `unos ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}. ` +
    'Puedes dejar la pestana abierta.'
  );
};

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
  leerGuardado,
  escribirGuardado,
}: Props) => {
  const [status, setStatus] = useState<RandomizerStatus>({ estado: 'comprobando' });
  const [progress, setProgress] = useState<Progress>({ fase: 'eligiendo' });

  /**
   * Apunta el puesto en la cola sin pisar el resto del estado.
   *
   * Solo se refresca si seguimos en la fase de trabajo: una respuesta de la cola
   * que llegue tarde no debe devolver el modal a "esperando" cuando ya acabo.
   */
  const avisarDeLaCola = (cola: PuestoEnCola | null) =>
    setProgress((actual) => (actual.fase === 'trabajando' ? { fase: 'trabajando', cola } : actual));
  const [selected, setSelected] = useState<Set<string>>(new Set(DEFAULT_SELECTION));
  const [partidas, setPartidas] = useState<PartidaGuardada[]>([]);
  const [otras, setOtras] = useState<PartidaGuardada[]>([]);
  const [semillaPegada, setSemillaPegada] = useState('');

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
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      next.add(id);

      // Al marcar una, se desmarcan las que escriben en el mismo ajuste. Si no,
      // el randomizer aplica una de las dos en silencio y el jugador se entera
      // al empezar la partida.
      const elegida = options.find((o) => o.id === id);
      for (const otra of elegida?.chocaCon ?? []) next.delete(otra);
      for (const o of options) {
        if (o.id !== id && o.chocaCon?.includes(id)) next.delete(o.id);
      }
      return next;
    });
  };

  const run = async () => {
    const base = baseRom.current;
    if (!base) return;

    setProgress({ fase: 'trabajando' });
    try {
      // Siempre desde la original: asi el nombre tampoco se encadena.
      const result = await randomizeRom({ options: [...selected] }, base.bytes, avisarDeLaCola);

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
        // La semilla solo tiene sentido si de verdad se puede rehacer con ella.
        semilla:
          result.reproducible && result.seed && result.ajustes
            ? codificarSemilla({
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
   * Descarga una partida entera: el guardado y la semilla, en un fichero.
   *
   * Es lo que se lleva uno al movil o a otro ordenador. No lleva la ROM dentro
   * -de ahi que pese lo que pesa el guardado- asi que al cargarlo hace falta la
   * ROM original, que es la tuya y ya la tienes.
   */
  const exportarPartida = (partida: PartidaGuardada) => {
    const sav = leerGuardado(partida.fichero);
    if (!sav) {
      setProgress({
        fase: 'error',
        message:
          'Esa partida todavia no tiene guardado. Guarda dentro del juego, desde su propio menu, y vuelve a intentarlo.',
      });
      return;
    }
    if (!partida.semilla || !partida.ajustes || !partida.crc32) {
      setProgress({
        fase: 'error',
        message: 'De esa partida no se guardo la semilla, asi que no se puede rehacer en otro sitio.',
      });
      return;
    }

    const bytes = empaquetar({
      semilla: {
        baseCrc32: partida.baseCrc32,
        crc32: partida.crc32,
        semilla: partida.semilla,
        ajustes: partida.ajustes,
      },
      sav,
      nombre: partida.baseNombre,
    });

    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/octet-stream' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombreDeFichero(partida.baseNombre);
    enlace.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Continua una partida traida de otro aparato.
   *
   * Se rehace la copia desde su semilla, se comprueba que salio identica y solo
   * entonces se mete el guardado. El guardado se escribe ANTES de cargar la
   * ROM: asi el juego lo encuentra al arrancar y no hay que reiniciarlo.
   */
  const abrirPartidaDeFichero = async (fichero: File) => {
    const base = baseRom.current;
    if (!base) return;

    const traida = leerPaquete(new Uint8Array(await fichero.arrayBuffer()));
    if (!traida) {
      setProgress({
        fase: 'error',
        message: 'Ese fichero no es una partida de Emupoke. Tiene que ser el .emupoke que descargaste.',
      });
      return;
    }
    if (traida.semilla.baseCrc32 !== base.crc32) {
      setProgress({
        fase: 'error',
        message:
          'Esa partida se jugo con otra copia de la ROM original. Carga la misma con la que se creo.',
      });
      return;
    }

    setProgress({ fase: 'trabajando' });
    try {
      const result = await randomizeRom(
        { settingsString: traida.semilla.ajustes, seed: traida.semilla.semilla },
        base.bytes,
        avisarDeLaCola,
      );
      if (crc32(result.rom) !== traida.semilla.crc32) {
        setProgress({
          fase: 'error',
          message:
            'La copia rehecha no coincide con la de esa partida, seguramente por una version distinta del randomizer. No la cargo: tu guardado no encajaria.',
        });
        return;
      }

      const nombre = nombreParaNueva(base.fileName);
      await escribirGuardado(nombre, traida.sav);
      await onRandomized(result.rom, nombre);
      registrar({
        fichero: nombre,
        baseNombre: base.fileName,
        baseCrc32: base.crc32,
        semilla: traida.semilla.semilla,
        ajustes: traida.semilla.ajustes,
        crc32: traida.semilla.crc32,
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
   * Rehace una partida a partir de una semilla que trae el jugador.
   *
   * El mismo camino que `rehacer`, pero para una copia de la que este
   * navegador no sabe nada: otro ordenador, u otra persona que quiere jugar
   * exactamente el mismo mundo.
   */
  const desdeSemilla = async () => {
    const base = baseRom.current;
    const semilla = descodificarSemilla(semillaPegada);
    if (!base) return;
    if (!semilla) {
      setProgress({ fase: 'error', message: 'Esa semilla no se entiende. Copiala entera.' });
      return;
    }
    if (semilla.baseCrc32 !== base.crc32) {
      setProgress({
        fase: 'error',
        message:
          'Esa semilla es de otra copia de la ROM original. Hace falta exactamente la misma con la que se creo.',
      });
      return;
    }

    setProgress({ fase: 'trabajando' });
    try {
      const result = await randomizeRom(
        { settingsString: semilla.ajustes, seed: semilla.semilla },
        base.bytes,
        avisarDeLaCola,
      );
      const generada = crc32(result.rom);
      if (generada !== semilla.crc32) {
        setProgress({
          fase: 'error',
          message:
            'Lo generado no coincide con lo que dice la semilla, seguramente por una version distinta del randomizer. No lo cargo: seria otro mundo.',
        });
        return;
      }
      const fileName = nombreParaNueva(base.fileName);
      await onRandomized(result.rom, fileName);
      registrar({
        fichero: fileName,
        baseNombre: base.fileName,
        baseCrc32: base.crc32,
        semilla: semilla.semilla,
        ajustes: semilla.ajustes,
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
        avisarDeLaCola,
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
      title={progress.fase === 'hecho' ? 'Partida aleatorizada' : 'Randomizer'}
      subtitle={
        progress.fase === 'hecho'
          ? 'Ya esta corriendo tu copia aleatorizada.'
          : 'Semillas · Opciones · Partida'
      }
      pie={
        progress.fase === 'hecho' ? null : (
          <>
            <span className="aleatorizar__nota">
              Cada jugador ajusta su propio randomizer. Aleatorizar de nuevo no toca las partidas
              que ya tienes.
            </span>
            <span className="aleatorizar__acciones">
              <button type="button" onClick={onClose}>
                Jugar tal cual
              </button>
              <button
                type="button"
                className="button--primary"
                disabled={!canRandomize}
                onClick={() => void run()}
              >
                {progress.fase === 'trabajando' ? 'Aleatorizando...' : 'Aleatorizar y jugar'}
              </button>
            </span>
          </>
        )
      }
    >
      {progress.fase === 'hecho' ? (
        <Resultado progress={progress} onClose={onClose} />
      ) : (
        <div className="aleatorizar">
          {/* Lo que impide o condiciona aleatorizar va arriba del todo y a lo
              ancho: son cosas que hay que leer ANTES de ponerse a marcar
              opciones, no al lado de ellas. */}
          <div className="aleatorizar__avisos">
            {status.estado === 'comprobando' && <p className="hint">Buscando el servicio...</p>}

            {status.estado === 'apagado' && (
              <p className="hint">
                El servicio de aleatorizacion no esta corriendo, asi que solo puedes jugar la ROM
                tal cual. Arrancalo con <code className="mono">npm run dev:all</code>.
              </p>
            )}

            {status.estado === 'incompleto' && <p className="warn">{status.motivo}</p>}

            {status.estado === 'listo' && !supported && (
              <p className="warn">
                La aleatorizacion esta disponible para Oro, Plata y Cristal, y para Rubi, Zafiro,
                Esmeralda, Rojo Fuego y Verde Hoja. Tu ROM es "{gameCode}".
              </p>
            )}

            {/* La promesa de que la ROM no se mueve solo es cierta en local.
                Entrando por un enlace compartido viaja al ordenador de quien lo
                abrio, y eso se dice antes de aleatorizar, no despues. */}
            {status.estado === 'listo' && supported && randomizerIsRemote() && (
              <p className="warn">
                Para aleatorizar, tu ROM se enviara al ordenador de quien abrio esta partida,
                donde se procesa y se borra al terminar. Si prefieres que no salga de tu equipo,
                juega tal cual.
              </p>
            )}

            {/* Rojo Fuego y Verde Hoja se han arrancado y jugado de verdad; los
                otros tres comparten la misma estructura y el randomizer los
                acepta, pero nadie los ha probado aqui todavia. Decirlo cuesta
                una linea y evita que alguien pierda una tarde sin saber si el
                raro es el juego o es el. */}
            {status.estado === 'listo' && supported && sinProbar && (
              <p className="hint">
                De {sinProbar} todavia no hemos comprobado una partida entera por aqui. Deberia
                funcionar igual: si algo sale raro, es util saberlo.
              </p>
            )}

            {lleno && (
              <p className="warn">
                Tienes {guardadas} partidas guardadas, el maximo. Cada una es una ROM entera
                ocupando sitio en el navegador: borra alguna para crear otra.
              </p>
            )}

            {progress.fase === 'error' && <p className="alert">{progress.message}</p>}

            {/* Solo sale si de verdad hay cola. Jugando solo no hay nada que
                contar y un mensaje de espera sobraria. */}
            {progress.fase === 'trabajando' && progress.cola && (
              <p className="hint" role="status">
                {textoDeEspera(progress.cola)}
              </p>
            )}
          </div>

          {status.estado === 'listo' && supported && (
            <div className="aleatorizar__rejilla">
              {/* --------- tus partidas y la semilla --------- */}
              <div className="ajustes__columna">
                <section className="tarjeta">
                  <div className="tarjeta__titulo">
                    <span className="tarjeta__marca tarjeta__marca--azul" />
                    <h2>Tus partidas</h2>
                    <div className="tarjeta__accion">
                      <span className="cuenta">
                        {guardadas}/{MAX_PARTIDAS}
                      </span>
                    </div>
                  </div>

                  <div className="huecos">
                    {partidas.map((partida) => {
                      const aqui = existeGuardada(partida.fichero);
                      const rehacible = sePuedeRehacer(partida);
                      return (
                        <div className="hueco hueco--partida" key={partida.id}>
                          <button
                            type="button"
                            className="hueco__abrir"
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
                            <span className="hueco__nombre">{resumirCambios(partida.cambiado)}</span>
                            <span className="hueco__datos">
                              {partida.semilla && (
                                <span className="hueco__semilla">
                                  semilla {partida.semilla.slice(-6)}
                                </span>
                              )}
                              <span>{cuando(partida.creada)}</span>
                              {!aqui && <span>{rehacible ? 'hay que rehacerla' : 'ya no esta'}</span>}
                            </span>
                          </button>

                          <div className="hueco__acciones">
                            <BotonSemilla partida={partida} />
                            <button
                              type="button"
                              className="hueco__accion"
                              onClick={() => exportarPartida(partida)}
                              title={
                                'Descargar esta partida entera: el guardado y la semilla.\n' +
                                'Es lo que te llevas a otro aparato para seguir ahi.'
                              }
                              aria-label="Descargar esta partida para otro aparato"
                            >
                              ⤓
                            </button>
                            <button
                              type="button"
                              className="hueco__accion hueco__accion--borrar"
                              title="Borrar esta partida"
                              aria-label={`Borrar la partida de ${cuando(partida.creada)}`}
                              onClick={() => {
                                onBorrar(partida.fichero);
                                olvidar(partida.id);
                                releer();
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* Los huecos libres se enseñan en vez de esconderlos: ver
                        cuantas caben todavia es lo que evita la sorpresa de
                        "no puedes, estan llenas" cuando ya habias elegido. */}
                    {Array.from({ length: Math.max(0, MAX_PARTIDAS - guardadas) }, (_, i) => (
                      <button
                        key={`libre-${i}`}
                        type="button"
                        className="hueco hueco--libre"
                        disabled={!canRandomize}
                        onClick={() => void run()}
                        title="Aleatoriza con las opciones marcadas y guarda la partida aqui"
                      >
                        + Crear partida
                      </button>
                    ))}
                  </div>

                  <p className="hint">
                    Crear usa las opciones que tengas marcadas a la derecha. Aleatorizar de nuevo
                    crea otra partida aparte: ninguna se pierde.
                  </p>

                  {/* Con el cupo lleno hay que poder hacer hueco desde aqui,
                      incluso si lo ocupan partidas de otro juego. */}
                  {lleno && otras.length > 0 && (
                    <>
                      <p className="huecos__otras">De otras ROMs</p>
                      {otras.map((partida) => (
                        <div className="hueco hueco--ajena" key={partida.id}>
                          <span className="hueco__abrir">
                            <span className="hueco__nombre">
                              {partida.baseNombre.replace(/\.gba$/i, '')}
                            </span>
                            <span className="hueco__datos">
                              <span>{resumirCambios(partida.cambiado)}</span>
                              <span>{cuando(partida.creada)}</span>
                            </span>
                          </span>
                          <div className="hueco__acciones">
                            <button
                              type="button"
                              className="hueco__accion hueco__accion--borrar"
                              title="Borrar esta partida"
                              aria-label={`Borrar la partida de ${partida.baseNombre}`}
                              onClick={() => {
                                onBorrar(partida.fichero);
                                olvidar(partida.id);
                                releer();
                              }}
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </section>

                {/* La vuelta de la semilla: alguien que juega desde otro
                    ordenador, o que perdio los datos del navegador, trae su
                    linea de texto y su ROM original y recupera el mismo mundo. */}
                <section className="tarjeta">
                  <div className="tarjeta__titulo">
                    <span className="tarjeta__marca tarjeta__marca--azul" />
                    <h2>Tengo una semilla</h2>
                  </div>

                  <div className="semilla-fila">
                    <input
                      className="semilla-fila__campo mono"
                      value={semillaPegada}
                      placeholder="EMUPOKE1..."
                      onChange={(event) => setSemillaPegada(event.target.value)}
                      aria-label="Semilla de una partida"
                    />
                    <button
                      type="button"
                      disabled={
                        semillaPegada.trim() === '' || lleno || progress.fase === 'trabajando'
                      }
                      onClick={() => void desdeSemilla()}
                    >
                      Usar
                    </button>
                  </div>

                  <p className="hint">
                    Hace falta la misma ROM original con la que se creo. La semilla sola no sirve
                    de nada: no lleva el juego dentro.
                  </p>

                  {/* Lo mismo pero con el fichero entero, que ademas trae el
                      guardado: es lo que se lleva uno al movil para seguir ahi. */}
                  <label className="partida__traer">
                    <span>O trae tu partida de otro aparato</span>
                    <input
                      type="file"
                      accept=".emupoke"
                      disabled={lleno || progress.fase === 'trabajando'}
                      onChange={(event) => {
                        const fichero = event.target.files?.[0];
                        // Se limpia para que elegir el mismo fichero dos veces
                        // seguidas vuelva a disparar el cambio.
                        event.target.value = '';
                        if (fichero) void abrirPartidaDeFichero(fichero);
                      }}
                    />
                  </label>
                </section>
              </div>

              {/* --------- que se aleatoriza --------- */}
              <div className="ajustes__columna">
                <section className="tarjeta">
                  <div className="tarjeta__titulo">
                    <span className="tarjeta__marca" />
                    <h2>Opciones</h2>
                    <div className="tarjeta__accion">
                      <span className="cuenta">
                        {selected.size} {selected.size === 1 ? 'activa' : 'activas'}
                      </span>
                    </div>
                  </div>

                  <div className="interruptores">
                    {options.map((option) => (
                      <label
                        className={`interruptor${selected.has(option.id) ? ' is-on' : ''}`}
                        key={option.id}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(option.id)}
                          onChange={() => toggle(option.id)}
                        />
                        <span className="interruptor__texto">
                          <span className="interruptor__nombre">{option.label}</span>
                          <span className="interruptor__nota">{option.description}</span>
                        </span>
                        <span className="interruptor__palanca" aria-hidden="true" />
                      </label>
                    ))}
                  </div>

                  <div className="modal__acciones">
                    <button
                      type="button"
                      onClick={() => {
                        // Marcar todas no puede meter dos que choquen: se queda
                        // la primera de cada grupo.
                        const todas = new Set<string>();
                        for (const o of options) {
                          const choca =
                            o.chocaCon?.some((otra) => todas.has(otra)) ||
                            options.some((x) => todas.has(x.id) && x.chocaCon?.includes(o.id));
                          if (!choca) todas.add(o.id);
                        }
                        setSelected(todas);
                      }}
                    >
                      Marcar todo
                    </button>
                    <button type="button" onClick={() => setSelected(new Set())}>
                      Desmarcar
                    </button>
                  </div>
                </section>
              </div>
            </div>
          )}

          {yaAleatorizada && partidas.length === 0 && (
            <p className="hint">Ya estas jugando una copia aleatorizada.</p>
          )}
        </div>
      )}
    </Modal>
  );
};

/**
 * Copia al portapapeles la semilla de una partida ya creada.
 *
 * Existe porque antes la semilla solo se veia en el momento de generarla: quien
 * cerraba la pestaña se quedaba sin forma de volver a copiarla, y es justo lo
 * que hace falta para seguir en otro ordenador o para darsela al companero.
 */
const BotonSemilla = ({ partida }: { partida: PartidaGuardada }) => {
  const [copiada, setCopiada] = useState(false);

  if (!sePuedeRehacer(partida) || !partida.crc32) return null;

  const semilla = codificarSemilla({
    baseCrc32: partida.baseCrc32,
    crc32: partida.crc32,
    semilla: partida.semilla!,
    ajustes: partida.ajustes!,
  });

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(semilla);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2200);
    } catch {
      // Si el navegador no deja, al menos queda seleccionable en el titulo.
    }
  };

  return (
    <button
      type="button"
      className={`partida__semilla${copiada ? ' is-copiada' : ''}`}
      onClick={() => void copiar()}
      title={copiada ? 'Copiada' : `Copiar la semilla de esta partida:\n${semilla}`}
      aria-label="Copiar la semilla de esta partida"
    >
      {copiada ? '✓' : '⧉'}
    </button>
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
    if (!progress.semilla) return;
    try {
      await navigator.clipboard.writeText(progress.semilla);
      setCopiada('si');
      setTimeout(() => setCopiada('no'), 2200);
    } catch {
      // El portapapeles puede estar denegado. La semilla sigue a la vista.
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

      {progress.semilla ? (
        <>
          <label className="field">
            semilla de esta partida
            <output className="field__value mono semilla">{progress.semilla}</output>
          </label>
          <button type="button" className="button--wide" onClick={() => void copiar()}>
            {copiada === 'si' ? 'semilla copiada' : 'Copiar la semilla'}
          </button>
          <p className="hint">
            {copiada === 'fallo'
              ? 'El navegador no ha dejado copiar. Puedes leerla de arriba.'
              : 'Tu partida se queda guardada en este navegador, asi que normalmente no te hara falta. Guarda la semilla por si juegas desde otro ordenador o pierdes los datos: con ella y tu ROM original se vuelve a generar este mismo mundo, identico. Tambien puedes darsela a tu companero para que juegue el mismo.'}
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

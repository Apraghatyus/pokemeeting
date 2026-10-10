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
  juegoDePartida,
  nombreDePartida,
  nombreParaNueva,
  olvidar,
  renombrar,
  partidasDe,
  registrar,
  sePuedeRehacer,
  tocar,
  todasLasPartidas,
  type PartidaGuardada,
} from '../core/partidas';
import { parseGameCode } from '@emupoke/pokemon';
import { crc32 } from '../core/romHeader';
import { codificarSemilla, descodificarSemilla } from '../core/semilla';
import { rehacerDesdeSemilla } from '../core/rehacer';
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
      /** Para poder ponerle nombre desde la pantalla de resultado. */
      partidaId: string;
      nombre: string;
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
/**
 * Lo que viene marcado al abrir.
 *
 * Las cuatro de siempre. Las demas se marcan a mano a proposito: cambian como
 * se juega -que te venden, que ensena cada MT, que estadisticas tiene cada
 * especie- y eso conviene elegirlo, no encontrarselo.
 */
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
export const textoDeEspera = (cola: PuestoEnCola): string => {
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

/*
 * Los tres iconos de la fila de una partida.
 *
 * Dibujados y no con una letra: la equis que habia antes se leia como "cerrar"
 * -es la misma que cierra el menu, dos centimetros mas arriba- y lo que hace es
 * borrar una partida para siempre. Una papelera no se confunde con nada.
 *
 * `currentColor` para que hereden el color del boton, incluido el rojo que coge
 * al pasar por encima.
 */
const IconoPapelera = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4h11" />
    <path d="M6.5 4V2.5h3V4" />
    <path d="M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4" />
    <path d="M6.6 6.8v4.6M9.4 6.8v4.6" />
  </svg>
);

const IconoLapiz = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.2 2.3l2.5 2.5-8 8-3.2.7.7-3.2z" />
    <path d="M10 3.5l2.5 2.5" />
  </svg>
);

const IconoSi = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

const IconoNo = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

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
  /**
   * La partida que esta preguntando si de verdad se borra, o null.
   *
   * Borrar una partida no se puede deshacer: se va su copia y su guardado, y si
   * es una Soul Link se lleva por delante horas de dos personas. El boton esta
   * a cinco pixeles del de descargar, asi que un roce no puede bastar.
   *
   * Se guarda el id y no un booleano porque hay hasta tres partidas en la
   * lista: con un booleano, preguntar por una preguntaba por todas.
   */
  const [borrando, setBorrando] = useState<string | null>(null);
  /**
   * La partida a la que se le esta cambiando el nombre, y el nombre a medias.
   *
   * El nombre se pone al crearla, en la pantalla de resultado, y hasta ahora no
   * habia forma de cambiarlo despues: una partida mal nombrada se quedaba asi
   * para siempre, y con tres partidas de la misma ROM el nombre es lo unico que
   * las distingue.
   */
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');

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
    // Una pregunta a medias no sobrevive a cerrar el menu: al volver, lo que
    // habria es una ficha pidiendo confirmacion de algo que ya no se recuerda.
    setBorrando(null);
    setRenombrando(null);
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
      // Un nombre de salida que ya distinga una partida de otra de la misma
      // ROM. El jugador lo cambia en la pantalla siguiente si quiere.
      const nombrePorDefecto = `Partida ${partidasDe(base.crc32).length + 1}`;
      const registrada = registrar({
        fichero: fileName,
        baseNombre: base.fileName,
        baseCrc32: base.crc32,
        semilla: result.seed,
        ajustes: result.ajustes,
        crc32: generada,
        cambiado: result.summary.changed,
        nombre: nombrePorDefecto,
        juego: juego?.label ?? null,
        generacion: juego?.generacion ?? null,
      });
      setProgress({
        fase: 'hecho',
        seed: result.seed,
        fileName,
        partidaId: registrada.id,
        nombre: nombrePorDefecto,
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
        nombre: null,
        juego: juego?.label ?? null,
        generacion: juego?.generacion ?? null,
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

    setProgress({ fase: 'trabajando' });
    try {
      // La comprobacion de que lo generado es de verdad el mismo mundo esta en
      // `rehacer.ts`, compartida con el enlace de invitacion: es el sitio donde
      // dos copias habrian acabado separandose.
      await rehacerDesdeSemilla({
        base,
        semilla,
        juego: { label: juego?.label ?? null, generacion: juego?.generacion ?? null },
        cargar: onRandomized,
        alEsperar: avisarDeLaCola,
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
          ? ''
          : 'Semillas · Opciones · Partida'
      }
      pie={
        progress.fase === 'hecho' ? null : (
          <>
            <span className="aleatorizar__nota">
              Creditos al Universal Pokémon Randomizer ZX
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
            {status.estado === 'listo' && supported && randomizerIsRemote()}
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

                  {/* Una sola lista con TODAS las partidas, sean del juego que
                      sean.
                      *
                      * El cupo de tres lo comparten todos los juegos, asi que
                      * separarlas en "las de esta ROM" y "las de otras" partia
                      * en dos algo que es una sola cosa: tus tres partidas. Y
                      * dejaba la cuenta sin cuadrar, porque las de otros juegos
                      * solo salian con el cupo lleno.
                      *
                      * Cada una dice de que juego es, que es lo que las
                      * distingue cuando conviven una de Rojo Fuego y otra de
                      * Cristal. */}
                  <div className="huecos">
                    {[...partidas, ...otras].map((partida) => {
                      const mia = partida.baseCrc32 === (baseRom.current?.crc32 ?? '');
                      const aqui = existeGuardada(partida.fichero);
                      const rehacible = sePuedeRehacer(partida);
                      // Solo se puede entrar en una partida del juego que esta
                      // cargado: para las demas haria falta su ROM.
                      const sePuedeAbrir = mia && (aqui || rehacible);

                      return (
                        <div
                          className={`hueco hueco--partida${mia ? '' : ' hueco--ajena'}`}
                          key={partida.id}
                        >
                          {renombrando === partida.id ? (
                            /* El nombre se edita en el sitio del nombre, no en
                               una ventana aparte: lo que se esta cambiando es
                               esa linea y ahi se ve lo que queda. */
                            <form
                              className="hueco__renombrar"
                              onSubmit={(event) => {
                                event.preventDefault();
                                renombrar(partida.id, nombreNuevo);
                                setRenombrando(null);
                                releer();
                              }}
                            >
                              <input
                                className="hueco__nombre-campo"
                                value={nombreNuevo}
                                maxLength={40}
                                autoFocus
                                aria-label={`Nombre de ${nombreDePartida(partida)}`}
                                onChange={(event) => setNombreNuevo(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') setRenombrando(null);
                                }}
                              />
                              <button
                                type="submit"
                                className="hueco__accion hueco__accion--guardar"
                                title="Guardar el nombre"
                                aria-label="Guardar el nombre"
                              >
                                <IconoSi />
                              </button>
                              <button
                                type="button"
                                className="hueco__accion"
                                title="Dejarlo como estaba"
                                aria-label="Dejar el nombre como estaba"
                                onClick={() => setRenombrando(null)}
                              >
                                <IconoNo />
                              </button>
                            </form>
                          ) : (
                          <button
                            type="button"
                            className="hueco__abrir"
                            disabled={!sePuedeAbrir}
                            // Lo de "hay que rehacerla" no se enseña en la
                            // linea: es jerga nuestra y asustaba sin aportar,
                            // porque al pulsar se rehace sola. Se queda aqui,
                            // para quien pase el raton y se pregunte por que
                            // esta tarda mas.
                            title={
                              !mia
                                ? `Para jugarla, carga ${juegoDePartida(partida)} desde "Cambiar ROM"`
                                : aqui
                                  ? undefined
                                  : rehacible
                                    ? 'Su copia ya no esta en este navegador: al abrirla se vuelve a generar desde su semilla.'
                                    : 'Su copia ya no esta y no tiene semilla, asi que no se puede recuperar.'
                            }
                            onClick={() => {
                              if (aqui) {
                                tocar(partida.id);
                                void onContinuar(partida.fichero).then(onClose);
                              } else {
                                void rehacer(partida);
                              }
                            }}
                          >
                            <span className="hueco__nombre">{nombreDePartida(partida)}</span>
                            <span className="hueco__datos">
                              <span className="hueco__juego">{juegoDePartida(partida)}</span>
                              <span>{cuando(partida.creada)}</span>
                            </span>
                          </button>
                          )}

                          {/* O las acciones, o la pregunta. En el mismo sitio y
                              no debajo: asi la ficha no cambia de alto y las de
                              abajo no dan un salto al preguntar. */}
                          {renombrando === partida.id ? null : borrando === partida.id ? (
                            <div className="hueco__acciones hueco__acciones--seguro">
                              <span className="hueco__seguro">¿Seguro?</span>
                              <button
                                type="button"
                                className="hueco__accion hueco__accion--si"
                                title="Si, borrarla"
                                aria-label={`Confirmar que se borra ${nombreDePartida(partida)}`}
                                onClick={() => {
                                  setBorrando(null);
                                  onBorrar(partida.fichero);
                                  olvidar(partida.id);
                                  releer();
                                }}
                              >
                                <IconoSi />
                              </button>
                              <button
                                type="button"
                                className="hueco__accion"
                                title="No, dejarla"
                                aria-label="Dejar la partida como esta"
                                /* Enfocado al aparecer: asi la tecla de espacio
                                   -o un segundo toque sin mirar- cancela en vez
                                   de borrar. */
                                autoFocus
                                onClick={() => setBorrando(null)}
                              >
                                <IconoNo />
                              </button>
                            </div>
                          ) : (
                            <div className="hueco__acciones">
                              {/* Cambiar el nombre vale para cualquiera, tambien
                                  para las de otra ROM: un nombre es una
                                  etiqueta tuya, no algo del juego. */}
                              <button
                                type="button"
                                className="hueco__accion"
                                title="Cambiarle el nombre"
                                aria-label={`Cambiar el nombre de ${nombreDePartida(partida)}`}
                                onClick={() => {
                                  // Con el nombre que ya tiene dentro, para
                                  // retocarlo en vez de escribirlo entero.
                                  setNombreNuevo(partida.nombre ?? nombreDePartida(partida));
                                  setBorrando(null);
                                  setRenombrando(partida.id);
                                }}
                              >
                                <IconoLapiz />
                              </button>
                              {mia && <BotonSemilla partida={partida} />}
                              {mia && (
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
                              )}
                              <button
                                type="button"
                                className="hueco__accion hueco__accion--borrar"
                                title="Borrar esta partida"
                                aria-label={`Borrar ${nombreDePartida(partida)}`}
                                onClick={() => setBorrando(partida.id)}
                              >
                                <IconoPapelera />
                              </button>
                            </div>
                          )}
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

/**
 * Lo que se ve cuando la copia ya esta hecha.
 *
 * Aqui solo caben dos cosas: ponerle nombre -que es lo que la distinguira
 * despues entre las otras dos- y llevarse la semilla.
 *
 * Lo que ya NO sale, y es deliberado: los iniciales que toco. Era un spoiler
 * servido en bandeja justo antes de empezar a jugar, y descubrirlos es parte de
 * la gracia de aleatorizar. Tampoco salen los tres parrafos que explicaban que
 * es una semilla: quien la necesita la copia, y quien no, no tiene por que
 * leerlos cada vez que crea una partida.
 */
const Resultado = ({
  progress,
  onClose,
}: {
  progress: Extract<Progress, { fase: 'hecho' }>;
  onClose: () => void;
}) => {
  const [nombre, setNombre] = useState(progress.nombre);
  const [copiada, setCopiada] = useState<'no' | 'si' | 'fallo'>('no');

  const copiar = async () => {
    if (!progress.semilla) return;
    try {
      await navigator.clipboard.writeText(progress.semilla);
      setCopiada('si');
      setTimeout(() => setCopiada('no'), 2200);
    } catch {
      // El portapapeles puede estar denegado: queda el boton de descargarla.
      setCopiada('fallo');
    }
  };

  // Se guarda segun se escribe. Un boton de "guardar nombre" seria un paso mas
  // para algo que no puede fallar.
  const cambiarNombre = (valor: string) => {
    setNombre(valor);
    renombrar(progress.partidaId, valor);
  };

  return (
    <div className="hecha">
      <label className="hecha__nombre">
        <span>Como quieres llamarla</span>
        <input
          value={nombre}
          maxLength={40}
          onChange={(event) => cambiarNombre(event.target.value)}
          placeholder="Partida 1"
          aria-label="Nombre de la partida"
        />
      </label>

      {/* Unos ajustes que no tocan nada producen una ROM aparentemente normal.
          Decir que ha cambiado evita descubrirlo tras media hora jugando. */}
      {progress.summary.changed.length === 0 ? (
        <p className="warn">La ROM se genero, pero no se cambio nada.</p>
      ) : (
        <p className="hecha__cambios">
          Ha cambiado: {progress.summary.changed.join(', ').toLowerCase()}.
        </p>
      )}

      {progress.summary.omitidas.length > 0 && (
        <p className="warn">
          Este juego no tiene {progress.summary.omitidas.join(', ').toLowerCase()}, asi que eso se
          quedo como estaba.
        </p>
      )}

      {progress.semilla ? (
        <div className="hecha__semilla">
          <span className="hecha__etiqueta">Semilla</span>
          <code className="mono hecha__codigo">{progress.semilla}</code>
          <button type="button" onClick={() => void copiar()}>
            {copiada === 'si' ? 'Copiada' : 'Copiar'}
          </button>
        </div>
      ) : (
        <p className="warn">
          Esta copia no se va a poder rehacer{progress.seed ? ` (semilla ${progress.seed})` : ''}.
          Vive solo en este navegador: si borras sus datos, se pierde.
        </p>
      )}

      {copiada === 'fallo' && (
        <p className="hint">El navegador no ha dejado copiar. Puedes seleccionarla a mano.</p>
      )}

      <div className="modal__acciones">
        <button type="button" className="button--primary button--wide" onClick={onClose}>
          Empezar a jugar
        </button>
      </div>
    </div>
  );
};

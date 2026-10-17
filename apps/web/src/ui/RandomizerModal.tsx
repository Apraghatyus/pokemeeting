import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  checkRandomizer,
  randomizeRom,
  type PuestoEnCola,
  randomizerIsRemote,
  type RandomizerStatus,
  type RandomizeSummary,
} from '../net/randomizer';
import {
  MAX_PARTIDAS,
  cambiarDificultad,
  cupoDePartidas,
  nombreParaNueva,
  renombrar,
  partidasDe,
  registrar,
  sinRevivirDe,
  tocar,
  todasLasPartidas,
  type PartidaGuardada,
} from '../core/partidas';
import { parseGameCode } from '@emupoke/pokemon';
import { sinRevivirEn, type Dificultad } from '@emupoke/protocol';
import { DIFICULTADES } from '../core/dificultad';
import { crc32 } from '../core/romHeader';
import { codificarSemilla, descodificarSemilla } from '../core/semilla';
import { rehacerDesdeSemilla } from '../core/rehacer';
import { PartidasGuardadas } from './PartidasGuardadas';
import { exportarPartida as exportar } from '../core/exportar';
import { leerPaquete } from '../core/paquete';
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
  /**
   * Si hay sesion iniciada.
   *
   * Sin cuenta se puede aleatorizar y jugar, pero la partida NO se guarda: se
   * pierde al cerrar la pestaña. Las tres ranuras son de quien tiene cuenta.
   */
  conCuenta: boolean;
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
      /** Con que se puede volver a generar esta copia, o null si no se puede. */
      rehacible: { baseCrc32: string; semilla: string; ajustes: string } | null;
      /** Para poder ponerle nombre desde la pantalla de resultado. */
      /**
       * La partida apuntada, o undefined si no se apunto.
       *
       * Sin cuenta la copia se genera y se juega pero no entra en la lista, y
       * entonces no hay nada que renombrar: un nombre para algo que desaparece
       * al recargar es una promesa que no se cumple.
       */
      partidaId?: string;
      nombre: string;
      summary: RandomizeSummary;
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
 * Con que dificultad nace una partida: Nuzlocke, que es a lo que se viene a
 * este programa. Se cambia en la pantalla de despues de aleatorizar.
 */
const DIFICULTAD_DE_SERIE: Dificultad = 'nuzlocke';

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

export const RandomizerModal = ({
  open,
  onClose,
  baseRom,
  gameCode,
  onRandomized,
  onContinuar,
  onBorrar,
  existeGuardada,
  leerGuardado,
  conCuenta,
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
   * Las copias de la partida recien hecha, con y sin los de revivir en las
   * tiendas, segun se van necesitando. La llave es `sinRevivir`.
   *
   * La dificultad se elige DESPUES de aleatorizar, y Normal es la unica que
   * deja Revivir a la venta: eso es otra ROM. Se genera la de las reglas, que
   * es la de serie, y la otra solo si alguien elige Normal; y se guardan las
   * dos para que ir y volver no cueste otra espera.
   */
  const variantes = useRef(new Map<boolean, { rom: Uint8Array; crc: string }>());
  /** Cual de las dos esta cargada en el emulador. */
  const cargada = useRef(sinRevivirEn(DIFICULTAD_DE_SERIE));

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
  // Sin cuenta no hay ranuras, pero si se puede crear: lo que no hay es sitio
  // donde dejarla. Por eso el cupo no entra en `lleno`.
  const cupo = cupoDePartidas(conCuenta);
  const lleno = conCuenta && guardadas >= cupo;
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
      const result = await randomizeRom(
        { options: [...selected], sinRevivir: sinRevivirEn(DIFICULTAD_DE_SERIE) },
        base.bytes,
        avisarDeLaCola,
      );

      // Nombre propio para cada copia: asi conviven varias partidas de la
      // misma ROM sin pisarse el fichero de guardado.
      const fileName = nombreParaNueva(base.fileName);
      const generada = crc32(result.rom);
      variantes.current = new Map([
        [sinRevivirEn(DIFICULTAD_DE_SERIE), { rom: result.rom, crc: generada }],
      ]);
      cargada.current = sinRevivirEn(DIFICULTAD_DE_SERIE);
      await onRandomized(result.rom, fileName);
      // Un nombre de salida que ya distinga una partida de otra de la misma
      // ROM. El jugador lo cambia en la pantalla siguiente si quiere.
      const nombrePorDefecto = `Partida ${partidasDe(base.crc32).length + 1}`;
      // SIN CUENTA NO SE APUNTA. La copia existe y ya esta cargada, asi que
      // se puede jugar; lo que no hace es entrar en la lista, y al cerrar la
      // pestaña se pierde. Eso se avisa ANTES de llegar aqui, no despues.
      const registrada = conCuenta
        ? registrar({
            // Nace sola. Si luego se invita a alguien, se marca entonces.
            soullink: false,
            dificultad: DIFICULTAD_DE_SERIE,
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
          })
        : null;
      setProgress({
        fase: 'hecho',
        seed: result.seed,
        fileName,
        partidaId: registrada?.id,
        nombre: nombrePorDefecto,
        summary: result.summary,
        // La semilla solo tiene sentido si de verdad se puede rehacer con ella.
        rehacible:
          result.reproducible && result.seed && result.ajustes
            ? { baseCrc32: base.crc32, semilla: result.seed, ajustes: result.ajustes }
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
    const problema = exportar(partida, leerGuardado);
    if (problema) setProgress({ fase: 'error', message: problema });
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
        {
          settingsString: traida.semilla.ajustes,
          seed: traida.semilla.semilla,
          sinRevivir: sinRevivirDe(traida.semilla.dificultad),
        },
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
        // Viene de un fichero de partida traido de otro aparato: es la misma
        // partida que alla, pero aqui no se sabe si era de Soul Link.
        soullink: null,
        dificultad: traida.semilla.dificultad ?? null,
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
        {
          settingsString: partida.ajustes,
          seed: partida.semilla,
          sinRevivir: sinRevivirDe(partida.dificultad),
        },
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

  /**
   * La copia que corresponde a una dificultad, generandola si hace falta.
   *
   * Es la misma semilla y los mismos ajustes; solo cambia si los de revivir se
   * quedan en las tiendas. Por eso sale el mismo mundo salvo eso.
   */
  const variante = async (
    rehacible: Extract<Progress, { fase: 'hecho' }>['rehacible'],
    sinRevivir: boolean,
  ) => {
    const ya = variantes.current.get(sinRevivir);
    if (ya) return ya;
    const base = baseRom.current;
    if (!rehacible || !base) {
      throw new Error(
        'Esta copia no se puede volver a generar, asi que se queda con las tiendas como salieron.',
      );
    }
    const result = await randomizeRom(
      { settingsString: rehacible.ajustes, seed: rehacible.semilla, sinRevivir },
      base.bytes,
    );
    const nueva = { rom: result.rom, crc: crc32(result.rom) };
    variantes.current.set(sinRevivir, nueva);
    return nueva;
  };

  /** Deja cargada la copia de la dificultad elegida y cierra. */
  const empezar = async (fileName: string, sinRevivir: boolean) => {
    const elegida = variantes.current.get(sinRevivir);
    if (elegida && cargada.current !== sinRevivir) {
      // Con el mismo nombre de fichero: todavia no se ha jugado nada, pero si
      // hubiera guardado, seguiria siendo el suyo.
      await onRandomized(elegida.rom, fileName);
      cargada.current = sinRevivir;
    }
    onClose();
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
        <Resultado
          progress={progress}
          variante={(sinRevivir) => variante(progress.rehacible, sinRevivir)}
          onEmpezar={(sinRevivir) => empezar(progress.fileName, sinRevivir)}
        />
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

            {/* ANTES de generar nada, no despues. Alguien que juega diez horas
                y descubre al recargar que no habia nada guardado no vuelve, y
                con razon. */}
            {!conCuenta && (
              <p className="warn">
                Sin cuenta puedes aleatorizar y jugar, pero <strong>la partida no se guarda</strong>:
                al cerrar la pestaña se pierde. Crea una cuenta para tener tus tres partidas y
                poder volver a ellas.
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
                        {conCuenta ? `${guardadas}/${MAX_PARTIDAS}` : 'sin guardar'}
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
                  <PartidasGuardadas
                    partidas={[...partidas, ...otras]}
                    crcBase={baseRom.current?.crc32 ?? null}
                    existeGuardada={existeGuardada}
                    /* Sin cuenta, un solo hueco: no es una ranura que se
                       quede, es el boton de "aleatoriza y juega ahora". */
                    libres={conCuenta ? cupo - guardadas : 1}
                    puedeCrear={canRandomize}
                    tituloCrear="Aleatoriza con las opciones marcadas y guarda la partida aqui"
                    onCrear={() => void run()}
                    onAbrir={(partida, aqui) => {
                      // Aqui SI se sabe rehacer una partida cuya copia ya no
                      // esta: este es el menu del aleatorizador. En Ajustes no,
                      // y por eso alli una partida sin copia manda aqui.
                      if (aqui) void onContinuar(partida.fichero).then(onClose);
                      else void rehacer(partida);
                    }}
                    onBorrarFichero={onBorrar}
                    onExportar={exportarPartida}
                    releer={releer}
                    visible={open}
                  />
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
                    Hace falta la misma ROM original con la que se creo.
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
        </div>
      )}
    </Modal>
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
  variante,
  onEmpezar,
}: {
  progress: Extract<Progress, { fase: 'hecho' }>;
  variante: (sinRevivir: boolean) => Promise<{ crc: string }>;
  onEmpezar: (sinRevivir: boolean) => Promise<void>;
}) => {
  const [nombre, setNombre] = useState(progress.nombre);
  const [copiada, setCopiada] = useState<'no' | 'si' | 'fallo'>('no');
  const [dificultad, setDificultad] = useState<Dificultad>(DIFICULTAD_DE_SERIE);
  /** El CRC de la copia que va con la dificultad elegida; null mientras se hace. */
  const [crc, setCrc] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [empezando, setEmpezando] = useState(false);
  const [problema, setProblema] = useState<string | null>(null);
  /** Solo cuenta la ultima eleccion: tocar dos seguidas no debe cruzarlas. */
  const ultima = useRef(0);

  useEffect(() => {
    void variante(sinRevivirEn(DIFICULTAD_DE_SERIE)).then((v) => setCrc(v.crc));
    // Solo al llegar: la de serie ya esta hecha y esto no espera nada.
  }, []);

  const elegir = async (siguiente: Dificultad) => {
    const anterior = dificultad;
    const turno = ++ultima.current;
    setDificultad(siguiente);
    setProblema(null);
    setPreparando(true);
    try {
      const v = await variante(sinRevivirEn(siguiente));
      if (turno !== ultima.current) return;
      setCrc(v.crc);
      if (progress.partidaId) cambiarDificultad(progress.partidaId, siguiente, v.crc);
    } catch (error) {
      if (turno !== ultima.current) return;
      setDificultad(anterior);
      setProblema(error instanceof Error ? error.message : String(error));
    } finally {
      if (turno === ultima.current) setPreparando(false);
    }
  };

  // La semilla va con la copia que de verdad se va a jugar, dificultad incluida.
  const semilla =
    progress.rehacible && crc
      ? codificarSemilla({ ...progress.rehacible, crc32: crc, dificultad })
      : null;

  const copiar = async () => {
    if (!semilla) return;
    try {
      await navigator.clipboard.writeText(semilla);
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
    // Sin partida apuntada no hay nada que renombrar: se jugo sin cuenta.
    if (progress.partidaId) renombrar(progress.partidaId, valor);
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

      {/* Aqui y no en el aleatorizador, que ya va cargado de opciones. Decide
          con que reglas se juega y en que columna del ranking cuenta, y se
          queda fijada al empezar. */}
      <section className="tarjeta">
        <div className="tarjeta__titulo">
          <span className="tarjeta__marca" />
          <h2>Dificultad</h2>
        </div>

        <div className="interruptores" role="radiogroup" aria-label="Dificultad">
          {DIFICULTADES.map((d) => (
            <label className={`interruptor${dificultad === d.id ? ' is-on' : ''}`} key={d.id}>
              <input
                type="radio"
                name="dificultad"
                checked={dificultad === d.id}
                disabled={empezando}
                onChange={() => void elegir(d.id)}
              />
              <span className="interruptor__texto">
                <span className="interruptor__nombre">
                  {d.nombre} · {d.coletilla}
                </span>
                <span className="interruptor__nota">{d.reglas.join(' · ')}</span>
              </span>
              <span className="interruptor__palanca" aria-hidden="true" />
            </label>
          ))}
        </div>
        {preparando ? (
          <p className="hint" role="status">
            Preparando la copia: en Normal se pueden comprar los de revivir, y eso cambia las
            tiendas...
          </p>
        ) : (
          <p className="hint">No se cambia despues: es parte de la partida.</p>
        )}
        {problema && <p className="alert">{problema}</p>}
      </section>

      {!progress.rehacible ? null : semilla ? (
        <div className="hecha__semilla">
          <span className="hecha__etiqueta">Semilla</span>
          <code className="mono hecha__codigo">{semilla}</code>
          <button type="button" onClick={() => void copiar()}>
            {copiada === 'si' ? 'Copiada' : 'Copiar'}
          </button>
        </div>
      ) : null}

      {progress.rehacible ? null : (
        <p className="warn">
          Esta copia no se va a poder rehacer{progress.seed ? ` (semilla ${progress.seed})` : ''}.
          Vive solo en este navegador: si borras sus datos, se pierde.
        </p>
      )}

      {copiada === 'fallo' && (
        <p className="hint">El navegador no ha dejado copiar. Puedes seleccionarla a mano.</p>
      )}

      <div className="modal__acciones">
        <button
          type="button"
          className="button--primary button--wide"
          disabled={preparando || empezando}
          onClick={() => {
            setEmpezando(true);
            void onEmpezar(sinRevivirEn(dificultad)).catch((error: unknown) => {
              setEmpezando(false);
              setProblema(error instanceof Error ? error.message : String(error));
            });
          }}
        >
          {empezando ? 'Cargando...' : 'Empezar a jugar'}
        </button>
      </div>
    </div>
  );
};

import { useEffect, useRef, useState } from 'react';
import type { EquipoResumen, RomFingerprint } from '@emupoke/protocol';
import { useTeclas } from './core/useTeclas';
import { useEmulator } from './core/useEmulator';
import { useKeyboardOwnership } from './core/useKeyboardOwnership';
import { useSession } from './net/useSession';
import { useEquipo } from './core/useEquipo';
import { useTopeDeNivel } from './core/useTopeDeNivel';
import { useFinDePartida } from './core/useFinDePartida';
import { useEquipoOrdenado } from './core/ordenEquipo';
import { useEsEstrecha } from './core/useEsEstrecha';
import { useEspecies } from './core/useEspecies';
import { useMandoTactil } from './core/useMandoTactil';
import { codificarSemilla, type Semilla } from './core/semilla';
import { leerInvitacion, olvidarInvitacion, type Invitacion } from './core/invitacion';
import { nombreDePartida, sePuedeRehacer, todasLasPartidas } from './core/partidas';
import { motesDebilitados, parseGameCode } from '@emupoke/pokemon';
import { EquipoPanel } from './ui/EquipoPanel';
import { AjustesModal } from './ui/AjustesModal';
import { IntercambioModal } from './ui/IntercambioModal';
import { useIntercambio } from './core/useIntercambio';
import { FinModal } from './ui/FinModal';
import { TOTAL_LIGA, type PasoLiga } from './ui/Liga';
import { InvitacionModal } from './ui/InvitacionModal';
import { RandomizerModal } from './ui/RandomizerModal';
import { RomDropZone, RoomDropZoneHint } from './ui/RomDropZone';
import { RoomModal } from './ui/RoomModal';
import { Stage } from './ui/Stage';
import { TouchControls } from './ui/TouchControls';
import { TopBar } from './ui/TopBar';
import { VoiceBar } from './ui/VoiceBar';

export const App = () => {
  const emulator = useEmulator();
  const { state } = emulator;

  // El mapa de teclas se guarda y se le aplica al nucleo en cuanto existe. Hay
  // que reaplicarlo al cargar cada ROM, porque el nucleo vuelve a las de fabrica.
  const teclas = useTeclas(emulator.coreRef, state.status === 'running' || state.status === 'paused');
  const hasRom = state.header !== null && state.platform !== null;

  // Los nombres de especie salen de TU ROM, y sirven tanto para tu equipo como
  // para el de tu companero: por la red viaja el numero, no el nombre.
  const especies = useEspecies(emulator.romBytesRef, state.romName);

  // La invitacion se lee UNA vez, al arrancar, y se borra de la barra de
  // direcciones en el mismo momento: ahi dentro va la contrasena de la sala, y
  // sin borrarla recargar la pagina a media partida volveria a lanzar el cartel
  // de "te han invitado" sobre una sala en la que ya se esta.
  const [invitacion, setInvitacion] = useState<Invitacion | null>(() => leerInvitacion());
  useEffect(() => {
    if (invitacion) olvidarInvitacion();
    // Solo al arrancar: si se pusiera `invitacion` como dependencia, cerrar el
    // cartel volveria a ejecutarlo para nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [roomOpen, setRoomOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tratoOpen, setTratoOpen] = useState(false);
  const [randomizerOpen, setRandomizerOpen] = useState(false);

  // El mando en pantalla aparece solo cuando hace falta: lo decide con que se
  // esta jugando, no que aparato es. Desde el menu se fuerza a mano.
  const mando = useMandoTactil();

  // Con el modal o el menu abiertos el teclado es de la interfaz aunque el foco
  // este en un boton: si no, las flechas moverian al personaje por detras.
  const keyboardOwner = useKeyboardOwnership(
    emulator.coreRef,
    roomOpen || menuOpen || randomizerOpen || tratoOpen || invitacion !== null,
  );

  // Espacio enciende y apaga el avance rapido, como en casi cualquier emulador.
  // Es conmutador y no "mientras lo mantengas": lo que se adelanta de verdad son
  // dialogos largos y rutas ya conocidas, y tener el pulgar ocupado todo ese rato
  // es justo cuando hacen falta las otras teclas.
  useEffect(() => {
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.code !== 'Space') return;
      // Si el teclado es de la interfaz, el espacio es para pulsar botones.
      if (keyboardOwner === 'interfaz') return;
      const donde = evento.target as HTMLElement | null;
      if (donde?.closest('input, textarea, button, select, a')) return;

      // El navegador usa el espacio para bajar la pagina; aqui no.
      evento.preventDefault();
      emulator.toggleFastForward();
    };

    globalThis.addEventListener('keydown', alPulsar);
    return () => globalThis.removeEventListener('keydown', alPulsar);
  }, [keyboardOwner, emulator]);

  // Al cargar una ROM se pregunta como quiere jugarse, antes de empezar:
  // aleatorizar despues de jugar un rato significa perder la partida. No se
  // pregunta por las ROMs que generamos nosotros, o seria un bucle.
  //
  // Y tampoco se pregunta a quien llega por un enlace de invitacion: ahi el
  // mundo ya esta decidido -es el de quien invita, y viene en su semilla-, asi
  // que preguntarle que quiere aleatorizar seria ofrecerle acabar en otro mundo
  // distinto del de su companero.
  useEffect(() => {
    if (invitacion) return;
    if (state.romSource === 'usuario' && state.romName) setRandomizerOpen(true);
  }, [state.romName, state.romSource, invitacion]);

  // La huella de la ROM va en una ref y no en el estado de la sesion porque los
  // callbacks de la senalizacion viven mas que el render que los creo: leerla
  // por ref evita capturar un valor viejo.
  const romRef = useRef<RomFingerprint | null>(null);
  useEffect(() => {
    romRef.current =
      state.header && state.romName
        ? {
            title: state.header.title,
            gameCode: state.header.gameCode,
            version: state.header.version,
            crc32: state.header.crc32,
            fileName: state.romName,
          }
        : null;
  }, [state.header, state.romName]);

  /**
   * Espera a que la huella de la ROM este publicada.
   *
   * Hace falta al entrar por un enlace de invitacion: ahi se genera el mundo y
   * se entra en la sala seguido, y la huella se publica en el efecto de arriba,
   * que todavia no ha corrido cuando la copia acaba de cargarse. En ese hueco,
   * entrar fallaba con "carga primero tu ROM" aunque la partida ya estuviera en
   * marcha.
   *
   * Se rinde a los cinco segundos en vez de esperar para siempre: si la ROM no
   * ha llegado en ese tiempo es que algo fallo antes, y la sala dira que falta.
   */
  const esperarLaRom = async (): Promise<void> => {
    for (let i = 0; i < 100 && romRef.current === null; i += 1) {
      await new Promise((sigue) => setTimeout(sigue, 50));
    }
  };

  const session = useSession(emulator.canvasRef, romRef);

  // Con companero la pantalla comparte sitio con su equipo; sin el, se lo
  // queda. Se mira la conexion y no si ha mandado equipo, para que la columna
  // aparezca en cuanto entra y no de un salto cuando llegue su primer aviso.
  const conCompanero = session.state.phase === 'conectada';

  // Tu equipo se lee de la partida cada pocos segundos y, cuando cambia, se le
  // manda al companero. Si no hay sala, enviarEquipo no hace nada.
  const miEquipo = useEquipo(
    emulator.coreRef,
    state.status === 'running',
    state.romName,
    especies,
  );

  // El panel no sigue el orden de la memoria: el juego sube al que sale a pelear
  // a la primera ranura, asi que mirarla barajaba el panel en mitad de un
  // combate. Se recuerda el orden en que aparecieron y se enseña asi.
  //
  // A cambio, esa misma ranura 0 dice quien esta al frente: durante un combate,
  // el que esta ahi es el que pelea.
  const equipoMio = useEquipoOrdenado(miEquipo.equipo);
  const equipoSuyo = useEquipoOrdenado(session.state.equipoCompanero);

  // Hasta que nivel se puede subir antes del gimnasio que toca. El numero sale
  // de TU ROM -en una aleatorizada los lideres llevan otra cosa- y cual toca,
  // de las medallas que ya llevas.
  const tope = useTopeDeNivel(
    emulator.romBytesRef,
    state.romName,
    state.status === 'running',
    miEquipo.medallas.cuantas,
  );

  // El reto se acaba cuando cae el equipo entero. No lo dice el juego -ahi
  // pierdes, vuelves al Centro Pokemon y sigues-: es la regla de la Nuzlocke,
  // asi que se aplica aqui.
  const intercambio = useIntercambio(
    emulator.coreRef,
    emulator.romBytesRef.current,
    state.romName,
    session.enviarDelTrato,
    session.escucharTrato,
  );

  // Quien ha caido a cada lado. Va antes de la regla de fin de partida porque
  // ahora forma parte de ella: en un Soul Link, una pareja caida cuenta.
  const caidosMios = motesDebilitados(miEquipo.equipo);
  const caidosSuyos = motesDebilitados(session.state.equipoCompanero);

  const fin = useFinDePartida(
    miEquipo.equipo,
    state.romName,
    miEquipo.derrota,
    miEquipo.victoria,
    // En un Soul Link, un Pokemon cuya pareja cayo esta muerto para el reto
    // aunque en tu partida siga en pie.
    caidosSuyos,
  );

  // Mandarle el equipo al companero. Se hace desde un solo sitio y no al
  // leerlo, para que tambien salga cuando abre el canal: quien ya estaba
  // jugando no tiene por que cambiar de equipo justo cuando el otro entra, y
  // asi el recien llegado no se quedaba sin verlo.
  const { enviarEquipo } = session;
  const equipoPropio = miEquipo.equipo;
  useEffect(() => {
    if (equipoPropio) enviarEquipo(equipoPropio);
  }, [equipoPropio, session.state.canalListo, enviarEquipo]);

  // Soul Link: las parejas se reconocen por el mote, que es el mismo en las dos
  // partidas. Si a uno se le cae el suyo, al otro se le marca el emparejado.

  // En pantalla estrecha no caben las dos columnas, asi que se ve un equipo y
  // se cambia con un boton, igual que con las dos partidas.
  const estrecha = useEsEstrecha();

  // Lo que se pone a pantalla completa: la partida Y el mando. Pedirla solo
  // sobre la partida dejaba al jugador de movil sin botones, porque el
  // navegador en pantalla completa pinta unicamente ese elemento.
  const marcoDeJuego = useRef<HTMLDivElement | null>(null);
  /**
   * Si se esta mirando lo del companero: su partida y su equipo.
   *
   * Es una sola decision y por eso es un solo estado. Antes la pantalla lo
   * llevaba por su cuenta y el equipo por la suya, y se desincronizaban:
   * deslizabas a su partida y seguias viendo tu equipo.
   */
  const [verSuEquipo, setVerSuEquipo] = useState(false);
  const unoSolo = estrecha && conCompanero;

  return (
    // Jugando en una pantalla estrecha, la barra se encoge a una sola fila: los
    // 97 pixeles que ocupaba salian del mando, y medidos son justo los que
    // faltaban para que los botones de abajo entraran enteros.
    <div className={`app${estrecha && hasRom ? ' app--jugando' : ''}`}>
      <TopBar
        session={session.state}
        keyboardOwner={keyboardOwner}
        onOpenRoom={() => setRoomOpen(true)}
        onOpenTrade={() => setTratoOpen(true)}
        hayPartida={hasRom}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        menuOpen={menuOpen}
        volume={state.volume}
        onVolume={emulator.setVolume}
        onToggleMute={emulator.toggleMute}
        volumeDisabled={!hasRom}
      />

      <main className="app__main">
       <div className="juego" ref={marcoDeJuego}>
        <div className={`mesa${conCompanero ? '' : ' mesa--solo'}`}>
          {/* Con sitio, los dos equipos a los lados. En pantalla estrecha solo
              cabe uno, asi que se enseña ese y se cambia con el boton. */}
          <EquipoPanel
            titulo={unoSolo && verSuEquipo ? 'Equipo de tu companero' : 'Tu equipo'}
            lado={unoSolo && verSuEquipo ? 'companero' : 'propio'}
            equipo={unoSolo && verSuEquipo ? equipoSuyo.equipo : equipoMio.equipo}
            activo={unoSolo && verSuEquipo ? equipoSuyo.alFrente : equipoMio.alFrente}
            especies={especies}
            caidosDelOtro={unoSolo && verSuEquipo ? caidosMios : caidosSuyos}
            /* Solo en la columna propia: el tope del companero depende de SU
               ROM y de SUS medallas, y ni una ni otras salen de su ordenador.
               Ponerle el tuyo marcaria a sus Pokemon por una regla que no es la
               suya. */
            tope={unoSolo && verSuEquipo ? null : tope}
            onCambiar={unoSolo ? () => setVerSuEquipo((v) => !v) : undefined}
            motivo={unoSolo && verSuEquipo ? 'Todavia no ha mandado su equipo.' : undefined}
          />

          <div className="mesa__centro">
        <Stage
          marcoCompleto={marcoDeJuego}
          /* La pantalla y el equipo que se ensenan son la misma decision: al
             deslizar a su partida tiene que verse tambien su equipo. */
          mirandoLoSuyo={verSuEquipo}
          onCambiarPantalla={() => setVerSuEquipo((v) => !v)}
          canvasRef={emulator.canvasRef}
          remoteStream={session.state.remoteStream}
          /* El nombre del fichero de su ROM no le dice nada a nadie, y ademas
             delata como lo tiene guardado. */
          partnerLabel="Tu companero"
          hasRom={hasRom}
          proporcion={
            state.platform
              ? state.platform.screens[0]!.width / state.platform.screens[0]!.height
              : 240 / 160
          }
          controles={
            <VoiceBar
              voice={session.state.voice}
              connected={session.state.phase === 'conectada'}
              onToggleMic={() => void session.toggleMic()}
              onToggleMute={session.togglePartnerMute}
              onVolume={session.setPartnerVolume}
            />
          }
          /* Con una invitacion delante, la zona de carga vive DENTRO de su
             cartel: ahi es donde se le pide la ROM a quien acaba de llegar, y
             dos zonas de carga a la vez en la pagina no son dos sitios donde
             elegir, son la misma cosa dos veces. */
          dropzone={
            invitacion ? null : (
              <RomDropZone
                onRom={emulator.openRom}
                disabled={state.status !== 'ready'}
                hint={RoomDropZoneHint(state.status)}
              />
            )
          }
        />
          </div>

          {/* La columna de la derecha solo existe con sitio y con companero.
              Jugando solo, la partida se lleva ese hueco. */}
          {conCompanero && !unoSolo && (
            <EquipoPanel
              titulo="Equipo de tu companero"
              lado="companero"
              equipo={equipoSuyo.equipo}
              activo={equipoSuyo.alFrente}
              especies={especies}
              caidosDelOtro={caidosMios}
              motivo=""
            />
          )}
        </div>


        {mando.visible && hasRom && (
          <TouchControls
            coreRef={emulator.coreRef}
            avanceRapido={state.fastForward}
            onAvanceRapido={emulator.toggleFastForward}
          />
        )}
       </div>

        {state.error && (
          <p className="alert" role="alert">
            {state.error}
          </p>
        )}

        {/* Un aviso no es un fallo: el juego sigue corriendo por debajo y se
            puede cerrar. Lleva boton porque antes no habia forma de quitarlo. */}
        {state.aviso && (
          <p className="aviso" role="status">
            <span>{state.aviso}</span>
            <button
              type="button"
              className="aviso__cerrar"
              onClick={emulator.descartarAviso}
              aria-label="Cerrar aviso"
              title="Cerrar aviso"
            >
              ×
            </button>
          </p>
        )}

        {/* Todos los ajustes viven en un modal y no en un cajon lateral: el
            cajon empujaba la partida a un lado cada vez que se abria, y aqui
            lo que no puede moverse es justo la pantalla del juego. */}
        <FinModal
          open={fin.terminada}
          resultado={fin.resultado}
          /* El de la foto fija si lo hay, y si no el de ahora. La foto solo
             existe cuando el cartel salta con la pagina abierta; al recargar
             con la partida ya terminada no hay ninguna, y antes de esto el
             cartel se quedaba sin equipo del todo. Ensenar el de ahora es menos
             exacto que la foto, pero es lo que paso, y el hueco no es nada. */
          equipo={fin.equipoFinal ?? equipoMio.equipo}
          especies={especies}
          nombrePartida={nombreDeLaPartidaEnCurso(state.header?.crc32 ?? null)}
          medallas={miEquipo.medallas.conseguidas}
          /* Llegar al Salon de la Fama exige haber pasado por los cinco, asi
             que en una victoria la Liga se sabe entera sin leer nada mas. En
             una derrota no se sabe por donde ibas -eso son banderas y hay que
             localizarlas-, y mientras no se sepa no se ensena. */
          liga={fin.resultado === 'victoria' ? LIGA_COMPLETA : []}
          caidosDelCompanero={caidosSuyos}
          porElEnlace={fin.porElEnlace}
          onContinuar={fin.continuar}
          onDescartar={fin.descartar}
          /* "Empezar de nuevo" lleva al aleatorizador y no reinicia la ROM que
             esta puesta. Reiniciarla devolvia a la misma partida desde el
             titulo, que no es empezar de nuevo: en una Nuzlocke lo siguiente es
             otro mundo, y ahi es donde se hace. */
          onReiniciar={() => {
            fin.continuar();
            setRandomizerOpen(true);
          }}
        />

        <IntercambioModal
          open={tratoOpen}
          onClose={() => setTratoOpen(false)}
          intercambio={intercambio}
          equipo={equipoMio.equipo}
          especies={especies}
          conCompanero={conCompanero}
          generacion={generacionDelEquipo(equipoMio.equipo)}
        />

        <AjustesModal
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          state={state}
          emulator={emulator}
          teclas={teclas}
          mando={mando}
          hasRom={hasRom}
          conCompanero={conCompanero}
          onAleatorizar={() => {
            setMenuOpen(false);
            setRandomizerOpen(true);
          }}
          copiarSemilla={<CopiarSemilla crc32={state.header?.crc32 ?? null} />}
        />
      </main>

      <RandomizerModal
        open={randomizerOpen}
        onClose={() => setRandomizerOpen(false)}
        baseRom={emulator.baseRomRef}
        gameCode={state.header?.gameCode ?? null}
        yaAleatorizada={state.romSource === 'generada'}
        onRandomized={emulator.openRomBytes}
        onContinuar={emulator.openSavedGame}
        onBorrar={emulator.deleteSavedGame}
        existeGuardada={emulator.existeGuardada}
        leerGuardado={emulator.leerGuardado}
        escribirGuardado={emulator.escribirGuardado}
      />

      {/* Quien llega por un enlace no tiene que escribir nada: el codigo, la
          contrasena y la semilla venian dentro. Lo unico que se le pide es su
          copia del juego, que es lo unico que el enlace no puede traer. */}
      <InvitacionModal
        invitacion={invitacion}
        onClose={() => setInvitacion(null)}
        baseRom={emulator.baseRomRef}
        gameCode={state.header?.gameCode ?? null}
        romCrc32={state.header?.crc32 ?? null}
        nucleoListo={state.status === 'ready'}
        hint={RoomDropZoneHint(state.status)}
        onRom={emulator.openRom}
        onRandomized={emulator.openRomBytes}
        onContinuar={emulator.openSavedGame}
        existeGuardada={emulator.existeGuardada}
        onUnirse={async (sala, clave) => {
          await esperarLaRom();
          await session.joinRoom(sala, clave);
          // Se abre la sala para que se vea en que quedo: si el codigo o la
          // contrasena no valen, el aviso sale ahi. Cerrar el cartel y no
          // enseñar nada mas dejaria a quien llega sin saber si entro.
          setRoomOpen(true);
        }}
      />

      <RoomModal
        open={roomOpen}
        onClose={() => setRoomOpen(false)}
        state={session.state}
        romReady={hasRom}
        onCreate={(password) => void session.createRoom(password)}
        onJoin={(code, password) => void session.joinRoom(code, password)}
        onLeave={() => {
          session.leave();
          setRoomOpen(false);
        }}
        onRetry={session.retryNow}
        /* El enlace que se comparte lleva el mundo dentro: asi quien entra no
           tiene que pedir la semilla aparte ni entender para que sirve. */
        semilla={semillaEnCurso(state.header?.crc32 ?? null)}
      />
    </div>
  );
};

/**
 * Copia la semilla de la partida que se esta jugando.
 *
 * La semilla -ROM base, numero y ajustes- es lo unico que hace falta para
 * rehacer este mundo exacto, asi que el jugador tiene que poder llevarsela en
 * cualquier momento. Antes solo aparecia justo despues de generarla: quien
 * cerraba la pestana se quedaba sin ella.
 *
 * Se busca por el CRC de la ROM que esta corriendo, que es lo que une una
 * partida con su copia. Si no es una copia aleatorizada, o es de las antiguas
 * que nacieron sin semilla, no hay nada que copiar y el boton no sale.
 */
/**
 * Como se llama la partida que corre ahora, si es una aleatorizada con nombre.
 *
 * Se busca por el CRC de la ROM cargada, que es lo que une una partida con su
 * copia. Jugando una ROM tal cual no hay partida que nombrar, y devuelve null.
 */
/** De que juego es el equipo, para elegir la coleccion de sprites. */
const generacionDelEquipo = (equipo: EquipoResumen | null): number =>
  equipo ? (parseGameCode(equipo.juego).game?.generacion ?? 3) : 3;

const LIGA_COMPLETA: readonly PasoLiga[] = Array.from({ length: TOTAL_LIGA }, () => 'derrotado');

/**
 * La semilla del mundo que corre ahora, si es uno que se sabe rehacer.
 *
 * Se busca por el CRC de la ROM cargada, que es lo que une una partida con su
 * copia. Devuelve null jugando una ROM tal cual y tambien en las partidas
 * antiguas que nacieron sin semilla: en los dos casos no hay mundo que pasarle
 * a nadie, y el enlace lleva solo las credenciales.
 */
const semillaEnCurso = (crc32: string | null): Semilla | null => {
  const partida = crc32
    ? todasLasPartidas().find((p) => p.crc32 === crc32 && sePuedeRehacer(p))
    : undefined;
  if (!partida) return null;
  return {
    baseCrc32: partida.baseCrc32,
    crc32: partida.crc32!,
    semilla: partida.semilla!,
    ajustes: partida.ajustes!,
  };
};

const nombreDeLaPartidaEnCurso = (crc32: string | null): string | null => {
  if (!crc32) return null;
  const partida = todasLasPartidas().find((p) => p.crc32 === crc32);
  return partida ? nombreDePartida(partida) : null;
};

const CopiarSemilla = ({ crc32 }: { crc32: string | null }) => {
  const [copiada, setCopiada] = useState(false);

  const semilla = semillaEnCurso(crc32);
  if (!semilla) return null;

  const texto = codificarSemilla(semilla);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2200);
    } catch {
      // Si el navegador no deja copiar, al menos queda a la vista en el titulo.
    }
  };

  return (
    <button
      type="button"
      className={copiada ? 'is-active' : undefined}
      onClick={() => void copiar()}
      title={copiada ? 'Copiada' : texto}
    >
      {copiada ? 'Semilla copiada' : 'Copiar semilla'}
    </button>
  );
};

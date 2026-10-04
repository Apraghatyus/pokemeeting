import { useEffect, useRef, useState } from 'react';
import type { RomFingerprint } from '@emupoke/protocol';
import { useTeclas } from './core/useTeclas';
import { useEmulator } from './core/useEmulator';
import { useKeyboardOwnership } from './core/useKeyboardOwnership';
import { useSession } from './net/useSession';
import { useEquipo } from './core/useEquipo';
import { useEsEstrecha } from './core/useEsEstrecha';
import { useEspecies } from './core/useEspecies';
import { useMandoTactil } from './core/useMandoTactil';
import { codificarSemilla } from './core/semilla';
import { sePuedeRehacer, todasLasPartidas } from './core/partidas';
import { motesDebilitados } from '@emupoke/pokemon';
import { EquipoPanel } from './ui/EquipoPanel';
import { AjustesModal } from './ui/AjustesModal';
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

  const [roomOpen, setRoomOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [randomizerOpen, setRandomizerOpen] = useState(false);

  // El mando en pantalla aparece solo cuando hace falta: lo decide con que se
  // esta jugando, no que aparato es. Desde el menu se fuerza a mano.
  const mando = useMandoTactil();

  // Con el modal o el menu abiertos el teclado es de la interfaz aunque el foco
  // este en un boton: si no, las flechas moverian al personaje por detras.
  const keyboardOwner = useKeyboardOwnership(
    emulator.coreRef,
    roomOpen || menuOpen || randomizerOpen,
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
  useEffect(() => {
    if (state.romSource === 'usuario' && state.romName) setRandomizerOpen(true);
  }, [state.romName, state.romSource]);

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
  const caidosMios = motesDebilitados(miEquipo.equipo);
  const caidosSuyos = motesDebilitados(session.state.equipoCompanero);

  // En pantalla estrecha no caben las dos columnas, asi que se ve un equipo y
  // se cambia con un boton, igual que con las dos partidas.
  const estrecha = useEsEstrecha();

  // Lo que se pone a pantalla completa: la partida Y el mando. Pedirla solo
  // sobre la partida dejaba al jugador de movil sin botones, porque el
  // navegador en pantalla completa pinta unicamente ese elemento.
  const marcoDeJuego = useRef<HTMLDivElement | null>(null);
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
            equipo={unoSolo && verSuEquipo ? session.state.equipoCompanero : miEquipo.equipo}
            especies={especies}
            caidosDelOtro={unoSolo && verSuEquipo ? caidosMios : caidosSuyos}
            onCambiar={unoSolo ? () => setVerSuEquipo((v) => !v) : undefined}
            motivo={unoSolo && verSuEquipo ? 'Todavia no ha mandado su equipo.' : undefined}
          />

          <div className="mesa__centro">
        <Stage
          marcoCompleto={marcoDeJuego}
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
          dropzone={
            <RomDropZone
              onRom={emulator.openRom}
              disabled={state.status !== 'ready'}
              hint={RoomDropZoneHint(state.status)}
            />
          }
        />
          </div>

          {/* La columna de la derecha solo existe con sitio y con companero.
              Jugando solo, la partida se lleva ese hueco. */}
          {conCompanero && !unoSolo && (
            <EquipoPanel
              titulo="Equipo de tu companero"
              lado="companero"
              equipo={session.state.equipoCompanero}
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
const CopiarSemilla = ({ crc32 }: { crc32: string | null }) => {
  const [copiada, setCopiada] = useState(false);

  const partida = crc32
    ? todasLasPartidas().find((p) => p.crc32 === crc32 && sePuedeRehacer(p))
    : undefined;
  if (!partida) return null;

  const texto = codificarSemilla({
    baseCrc32: partida.baseCrc32,
    crc32: partida.crc32!,
    semilla: partida.semilla!,
    ajustes: partida.ajustes!,
  });

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

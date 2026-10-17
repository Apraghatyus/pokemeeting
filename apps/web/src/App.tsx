import { useEffect, useMemo, useRef, useState } from 'react';
import type { EquipoResumen, PokemonResumen, RomFingerprint } from '@emupoke/protocol';
import { useTeclas } from './core/useTeclas';
import { useEmulator } from './core/useEmulator';
import { useKeyboardOwnership } from './core/useKeyboardOwnership';
import { useSession } from './net/useSession';
import { useEquipo, type Vigilante } from './core/useEquipo';
import {
  apuntarEncuentro,
  deberDelCentro,
  ENCUENTROS_VACIOS,
  guardarDisposicionDelCentro,
  guardarEncuentros,
  juzgarCaptura,
  juzgarCentro,
  juzgarLider,
  juzgarPokeball,
  leerDisposicionDelCentro,
  leerEncuentros,
  olvidarEncuentros,
  revividoConObjeto,
  seCuroElEquipo,
  zonasGastadas,
  type MemoriaDeEncuentros,
} from './core/reglasEnVivo';
import { nombreDeZona, zonaCanonica } from './core/zonas';
import { useTopeDeNivel } from './core/useTopeDeNivel';
import { reglasActivas, tiposPrimariosRepetidos } from './core/dificultad';
import { esOtraPartida, useReglasNuzlocke } from './core/reglasNuzlocke';
import { useFinDePartida } from './core/useFinDePartida';
import { useEquipoOrdenado } from './core/ordenEquipo';
import { useEsEstrecha } from './core/useEsEstrecha';
import { usePantallaCompleta } from './core/usePantallaCompleta';
import { useEspecies } from './core/useEspecies';
import { useMandoTactil } from './core/useMandoTactil';
import { useMandoFisico } from './core/useMandoFisico';
import { apodoGuardado, comoSeLlama } from './core/apodo';
import { codificarSemilla, type Semilla } from './core/semilla';
import { leerInvitacion, olvidarInvitacion, type Invitacion } from './core/invitacion';
import {
  companeroDeSoullink,
  descartarSoullink,
  dificultadDe,
  esSoullink,
  marcarSoullink,
  modoSoullink,
  nombreDePartida,
  semillaDePartida,
  sePuedeRehacer,
  todasLasPartidas,
} from './core/partidas';
import {
  aprenderCentro,
  encontrarTablaEvoluciones,
  equiposDeLosLideres,
  familiasEvolutivas,
  motesDebilitados,
  parseGameCode,
  type PokemonDeEntrenador,
} from '@emupoke/pokemon';
import { EquipoPanel } from './ui/EquipoPanel';
import { AjustesModal } from './ui/AjustesModal';
import { CuentaModal } from './ui/CuentaModal';
import { FichaModal } from './ui/FichaModal';
import { Ranking } from './ui/Ranking';
import { useCuenta } from './core/useCuenta';
import { latir } from './core/ficha';
import { IntercambioModal } from './ui/IntercambioModal';
import { useIntercambio } from './core/intercambioWasm';
import { FinModal } from './ui/FinModal';
import { TOTAL_LIGA, type PasoLiga } from './ui/Liga';
import { InvitacionModal } from './ui/InvitacionModal';
import { Medallas } from './ui/Medallas';
import { RandomizerModal } from './ui/RandomizerModal';
import { RomDropZone, RoomDropZoneHint } from './ui/RomDropZone';
import { RoomModal } from './ui/RoomModal';
import { Stage } from './ui/Stage';
import { TouchControls } from './ui/TouchControls';
import { TopBar } from './ui/TopBar';
import { MapaModal } from './ui/MapaModal';
import { SoulLinkModal } from './ui/SoulLinkModal';
import { MoteModal } from './ui/MoteModal';
import { renombrarEnPartida } from './core/mote';
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
  }, []);

  // Y tambien si llega una invitacion con la pagina YA abierta.
  //
  // Es el caso normal del segundo dia: tienes la pestana puesta de ayer, tu
  // amigo te reenvia el enlace y lo pulsas. El navegador no recarga nada -solo
  // cambia lo que va detras del #- asi que sin esto no pasaba absolutamente
  // nada: ni cartel, ni sala, ni aviso.
  useEffect(() => {
    const alCambiar = () => {
      const llega = leerInvitacion();
      if (!llega) return;
      setInvitacion(llega);
      olvidarInvitacion();
    };
    globalThis.addEventListener('hashchange', alCambiar);
    return () => globalThis.removeEventListener('hashchange', alCambiar);
  }, []);

  const [roomOpen, setRoomOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tratoOpen, setTratoOpen] = useState(false);
  const [randomizerOpen, setRandomizerOpen] = useState(false);
  const [cuentaOpen, setCuentaOpen] = useState(false);
  // La app de Android manda aqui con #ranking para ver la clasificacion.
  const [rankingOpen, setRankingOpen] = useState(() => globalThis.location?.hash === '#ranking');
  const [mapaOpen, setMapaOpen] = useState(false);

  // Quien eres, si es que has entrado. No hace falta para jugar: si el
  // servicio de cuentas no esta, esto se queda en null y no se nota.
  const cuenta = useCuenta();

  // El mando en pantalla aparece solo cuando hace falta: lo decide con que se
  // esta jugando, no que aparato es. Desde el menu se fuerza a mano.
  const mando = useMandoTactil();
  // Un mando fisico, si hay alguno. Al jugar con el, el tactil se aparta.
  const mandoFisico = useMandoFisico(
    emulator.coreRef,
    state.status === 'running',
    mando.apartar,
  );

  // Con el modal o el menu abiertos el teclado es de la interfaz aunque el foco
  // este en un boton: si no, las flechas moverian al personaje por detras.
  const keyboardOwner = useKeyboardOwnership(
    emulator.coreRef,
    roomOpen ||
      menuOpen ||
      randomizerOpen ||
      tratoOpen ||
      cuentaOpen ||
      // Con el ranking delante, el teclado es para buscar jugadores: si no,
      // escribir un nombre movia al personaje por detras.
      rankingOpen ||
      invitacion !== null,
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

  // El latido: avisa de que sigues aqui y de a que juegas, para que tus amigos
  // te vean conectado. Cada treinta segundos, que es la mitad de lo que el
  // servidor espera antes de darte por ido: asi un latido perdido no te hace
  // parpadear a "desconectado" y volver.
  //
  // Sin cuenta no se manda nada. No es solo que no sirva: es que no hay motivo
  // para que el servidor sepa que alguien sin cuenta esta jugando.
  const hayCuenta = cuenta.cuenta !== null;
  const juegoEnCurso = state.platform ? parseGameCode(state.header?.gameCode ?? '').game?.label ?? null : null;
  const enSala = session.state.phase !== 'sin-sala';
  useEffect(() => {
    if (!hayCuenta) return;
    const mandar = () => void latir(juegoEnCurso, enSala);
    mandar();
    const reloj = setInterval(mandar, 30_000);
    return () => clearInterval(reloj);
  }, [hayCuenta, juegoEnCurso, enSala]);

  const partidaEnCurso = state.romName;

  // Con companero la pantalla comparte sitio con su equipo; sin el, se lo
  // queda. Se mira la conexion y no si ha mandado equipo, para que la columna
  // aparezca en cuanto entra y no de un salto cuando llegue su primer aviso.
  const conCompanero = session.state.phase === 'conectada';

  // Como llamarle. Su apodo si lo dijo, y "tu companero" si no. Se calcula una
  // vez y se reparte: sale en la etiqueta de su ventana, en su columna de
  // equipo y en su pestana, y lo peor seria que en un sitio diga su nombre y en
  // otro no.
  const nombreDelCompanero = comoSeLlama(session.state.peerNombre);

  // Y como te llamas tu. De la cuenta si has entrado; si no, del apodo que
  // escribiste al abrir la sala. Sin ninguno de los dos se queda en "Tu
  // equipo", que es lo que decia siempre.
  //
  // Se recalcula al entrar en la cuenta y al montar o cambiar de sala, que son
  // los dos momentos en que esto puede cambiar. Leer localStorage en cada
  // pintada seria hacerlo decenas de veces por minuto para nada.
  const miNombre = useMemo(
    () => cuenta.cuenta?.apodo ?? apodoGuardado() ?? 'Tu equipo',
    [cuenta.cuenta, session.state.phase, session.state.roomCode],
  );

  // Tu equipo se lee de la partida cada pocos segundos y, cuando cambia, se le
  // manda al companero. Si no hay sala, enviarEquipo no hace nada.
  // Las reglas del Centro Pokemon se hacen cumplir desde la misma lectura del
  // equipo. Quien decide se define mas abajo, cuando ya se saben la dificultad
  // y el tope; aqui solo se le hace sitio.
  const vigilanteRef = useRef<Vigilante | null>(null);
  /** Los encuentros apuntados de la partida que corre. */
  const encuentrosRef = useRef<{ partida: string; memoria: MemoriaDeEncuentros } | null>(null);
  /**
   * Y los mismos, en estado, para el mapa.
   *
   * La ref la lee el juez, que corre en el bucle de lectura y necesita el valor
   * de ya. Pero una ref no repinta nada, y el mapa tiene que ensenar la zona
   * como gastada en cuanto pasa el encuentro. De ahi las dos copias.
   */
  const [zonasConEncuentro, setZonasConEncuentro] = useState<
    MemoriaDeEncuentros['zonas']
  >({});
  /**
   * Lo que las reglas necesitan de la ROM: los equipos de los lideres y las
   * familias evolutivas. Se busca la primera vez que hace falta, una por ROM.
   */
  const datosRomRef = useRef<{
    rom: Uint8Array;
    lideres: PokemonDeEntrenador[][] | null;
    familia: (especie: number) => number;
  } | null>(null);
  const datosDeLaRom = () => {
    const rom = emulator.romBytesRef.current;
    if (!rom) return { lideres: null, familia: (especie: number) => especie };
    if (datosRomRef.current?.rom !== rom) {
      const evoluciones = encontrarTablaEvoluciones(rom);
      datosRomRef.current = {
        rom,
        lideres: equiposDeLosLideres(rom),
        familia: evoluciones ? familiasEvolutivas(evoluciones) : (especie: number) => especie,
      };
    }
    return datosRomRef.current;
  };
  // La disposicion de los Centros de este juego, para saber cuando se entra en
  // uno. Se aprende jugando y se guarda por juego, asi que aqui solo se mira.
  const disposicionDelCentroRef = useRef<number | null>(null);
  disposicionDelCentroRef.current = state.header?.gameCode
    ? leerDisposicionDelCentro(state.header.gameCode)
    : null;

  const miEquipo = useEquipo(
    emulator.coreRef,
    state.status === 'running',
    state.romName,
    especies,
    emulator.romBytesRef,
    vigilanteRef,
    disposicionDelCentroRef,
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
  const topes = useTopeDeNivel(
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

  // Si esta partida es una Soul Link. Ya no basta con abrir una sala: al entrar
  // el companero, si la partida esta empezando, se pregunta. Lo que se elige
  // se le manda al otro para que las dos partidas vayan iguales. Despues del
  // principio ya no se ofrece: una Soul Link empieza con las parejas desde la
  // primera captura.
  const [versionSoullink, setVersionSoullink] = useState(0);
  /** Lo elegido sin cuenta: no hay partida apuntada donde guardarlo. */
  const [soullinkSinCuenta, setSoullinkSinCuenta] = useState<{
    partida: string;
    activo: boolean;
  } | null>(null);
  const partidaApuntada = useMemo(
    () => partidaEnCurso !== null && todasLasPartidas().some((p) => p.fichero === partidaEnCurso),
    [partidaEnCurso, versionSoullink],
  );
  const modoGuardado = useMemo(
    () => modoSoullink(partidaEnCurso),
    [partidaEnCurso, versionSoullink],
  );
  const modoSoul =
    soullinkSinCuenta && soullinkSinCuenta.partida === partidaEnCurso
      ? soullinkSinCuenta.activo
        ? 'si'
        : 'no'
      : modoGuardado;
  // Empezando: sin medallas y como mucho con el inicial.
  const empezando =
    (miEquipo.medallas.cuantas ?? 0) === 0 &&
    (miEquipo.equipo?.ranuras.filter((p) => !p.huevo).length ?? 0) <= 1;
  const preguntarSoullink =
    conCompanero && hasRom && partidaEnCurso !== null && modoSoul === 'sin-decidir' && empezando;
  // Con quien se empezo la Soul Link: con esa persona hay que seguirla. Solo
  // se vigila con cuenta, que es lo unico que el servidor puede comprobar.
  const companeroInicial = useMemo(
    () => companeroDeSoullink(partidaEnCurso),
    [partidaEnCurso, versionSoullink],
  );
  const peerUsuario = session.state.peerUsuario;
  const otraPersona =
    hayCuenta && modoSoul === 'si' && companeroInicial !== null && peerUsuario !== companeroInicial;
  // Con otra persona no hay parejas: la Soul Link es con quien se empezo.
  const enSoulLink = conCompanero && modoSoul === 'si' && !otraPersona;

  const { enviarSoullink } = session;
  const aplicarSoullink = (activo: boolean) => {
    if (!partidaEnCurso) return;
    if (partidaApuntada) {
      if (activo) marcarSoullink(partidaEnCurso, session.state.peerUsuario);
      else descartarSoullink(partidaEnCurso);
    } else {
      setSoullinkSinCuenta({ partida: partidaEnCurso, activo });
    }
    setVersionSoullink((v) => v + 1);
  };
  const elegirSoullink = (activo: boolean) => {
    aplicarSoullink(activo);
    enviarSoullink(activo);
  };

  // Lo que elige el companero vale tambien aqui, si esto esta empezando.
  const soullinkDelOtro = session.state.soullinkCompanero;
  useEffect(() => {
    if (!soullinkDelOtro || !partidaEnCurso) return;
    if (!empezando && modoSoul !== 'sin-decidir') return;
    if ((modoSoul === 'si') === soullinkDelOtro.activo && modoSoul !== 'sin-decidir') return;
    aplicarSoullink(soullinkDelOtro.activo);
    setAvisoRegla({
      texto: soullinkDelOtro.activo
        ? `${nombreDelCompanero} ha hecho la partida Soul Link: vale también para la tuya.`
        : `${nombreDelCompanero} prefiere jugar sin Soul Link: jugáis juntos, sin parejas.`,
      tipo: 'info',
    });
    // Solo al llegar un aviso nuevo del companero.
  }, [soullinkDelOtro]);

  // Una Soul Link que nacio de una invitacion ya es Soul Link pero no sabe con
  // quien: se apunta con el primero que entra mientras esta empezando.
  useEffect(() => {
    if (!conCompanero || !partidaApuntada || !partidaEnCurso || !peerUsuario) return;
    if (modoSoul !== 'si' || companeroInicial !== null || !empezando) return;
    marcarSoullink(partidaEnCurso, peerUsuario);
    setVersionSoullink((v) => v + 1);
  }, [conCompanero, partidaApuntada, partidaEnCurso, peerUsuario, modoSoul, companeroInicial, empezando]);

  // Y si entra otra persona, se dice: con ella no cuenta.
  useEffect(() => {
    if (!conCompanero || !otraPersona) return;
    setAvisoRegla({
      texto: `Esta Soul Link la empezaste con ${companeroInicial}. Con ${
        peerUsuario ?? nombreDelCompanero
      } podéis jugar juntos, pero sin parejas, y si la terminas así no contará en el ranking.`,
      tipo: 'error',
    });
  }, [conCompanero, otraPersona, companeroInicial, peerUsuario, nombreDelCompanero]);

  // Quien ha caido a cada lado. Va antes de la regla de fin de partida porque
  // ahora forma parte de ella: en un Soul Link, una pareja caida cuenta. Sin
  // Soul Link, lo que le pase al otro no toca a tus Pokemon.
  const caidosMios = motesDebilitados(miEquipo.equipo);
  const caidosSuyos = motesDebilitados(enSoulLink ? session.state.equipoCompanero : null);

  // Cambiar el mote desde la pagina. En una Soul Link se le cambia tambien a
  // su pareja en la partida del otro, que se reconoce por el mote de antes.
  const [moteDe, setMoteDe] = useState<PokemonResumen | null>(null);
  const { enviarMote } = session;
  const cambiarMote = (nuevo: string): string | null => {
    if (!moteDe) return null;
    if (infracciones.memoria.propio !== null && moteDe.entrenador !== infracciones.memoria.propio) {
      return 'Solo se le puede cambiar el mote a lo que capturaste tú, como en el juego.';
    }
    const fallo = renombrarEnPartida(emulator.coreRef.current, moteDe.personalidad, nuevo);
    if (!fallo && enSoulLink && moteDe.mote) enviarMote(moteDe.mote, nuevo.trim());
    return fallo;
  };
  // Y cuando el companero cambia uno, se le cambia aqui a su pareja.
  const moteDelOtro = session.state.moteCompanero;
  useEffect(() => {
    if (!moteDelOtro || !enSoulLink) return;
    const pareja = miEquipo.equipo?.ranuras.find((p) => !p.huevo && p.mote === moteDelOtro.antes);
    if (!pareja) return;
    const fallo = renombrarEnPartida(emulator.coreRef.current, pareja.personalidad, moteDelOtro.nuevo);
    setAvisoRegla({
      texto: fallo
        ? `${nombreDelCompanero} ha cambiado el mote de ${moteDelOtro.antes}, pero aquí no se ha podido: ${fallo}`
        : `${nombreDelCompanero} ha llamado ${moteDelOtro.nuevo} a ${moteDelOtro.antes}: su pareja de aquí también se llama así ahora.`,
      tipo: fallo ? 'error' : 'info',
    });
    // Solo al llegar un cambio nuevo del companero.
  }, [moteDelOtro]);

  // Con que reglas se juega esta partida. Se relee al llegar equipo nuevo y no
  // solo al cambiar de ROM: la partida se apunta en la lista justo DESPUES de
  // cargarla, y leyendola al cargar saldria siempre Normal.
  const dificultad = useMemo(
    () => dificultadDe(state.romName),
    [state.romName, miEquipo.equipo],
  );

  const fin = useFinDePartida(
    miEquipo.equipo,
    state.romName,
    miEquipo.derrota,
    miEquipo.victoria,
    // En un Soul Link, un Pokemon cuya pareja cayo esta muerto para el reto
    // aunque en tu partida siga en pie.
    caidosSuyos,
    // Por donde iba la partida cuando se acabo. No se ensena: se guarda en el
    // historial, para el dia que haya perfiles.
    miEquipo.medallas.cuantas,
    // Si a ELLA se lo dijo su juego. Sin esto, el combate del laboratorio de
    // uno acababa la partida del otro: su inicial se queda a cero por guion y
    // desde aqui se ve igual que una muerte de verdad.
    enSoulLink && session.state.peerPerdio,
    // El tope del proximo lider, SOLO en Nivelada. Quien se pasa no se puede
    // usar, asi que si es el unico que queda no hay con que seguir: eso es el
    // final de la partida aunque siga en pie.
    // Se mira la dificultad y no `reglas`, que ademas apaga las reglas cuando la
    // partida ya acabo: eso se decide AQUI, asi que usarlo seria preguntarle a
    // la respuesta.
    dificultad === 'nivelada' ? (topes.siguiente?.nivel ?? null) : null,
    // Y de que juego es, como se jugo y con quien. Esto solo se sabe mientras
    // se juega: cuando la partida guardada se borre -solo caben tres- ya no
    // habria forma de averiguarlo.
    {
      // El JUEGO, no la consola: "Rojo Fuego", no "Game Boy Advance". La
      // etiqueta de la plataforma es la misma para los cinco, asi que como
      // filtro no separaba nada.
      juego: parseGameCode(state.header?.gameCode ?? '').game?.label ?? null,
      // De la PARTIDA, no de si hay alguien conectado ahora mismo. Una Soul
      // Link se puede acabar un dia que juegas solo, y seguiria siendo una
      // Soul Link: lo que la define es como se monto, no quien estaba delante
      // cuando cayo el ultimo Pokemon.
      modo: esSoullink(state.romName) ? 'soullink' : 'sola',
      companero: conCompanero ? session.state.peerNombre ?? null : null,
      dificultad,
      // Una Soul Link con cuenta solo cuenta si se termina con quien se empezo.
      fueraDelRanking:
        hayCuenta && modoSoul === 'si' && companeroInicial !== null && (!conCompanero || otraPersona)
          ? `Soul Link empezada con ${companeroInicial} y terminada ${
              conCompanero && peerUsuario ? `con ${peerUsuario}` : 'sin esa persona'
            }`
          : null,
    },
  );

  // Lo que vigila la dificultad, y solo mientras el reto siga vivo: despues de
  // caer se puede seguir jugando, pero ya no hay reglas que cumplir.
  const reglas = reglasActivas(dificultad, fin.acabada);
  // Las dos de Nuzlocke que se ven en el equipo: segunda captura en una zona
  // gastada, y un muerto que vuelve a estar en pie. Solo del equipo propio: las
  // del companero las vigila su navegador, con su partida.
  const infracciones = useReglasNuzlocke(
    state.romName,
    miEquipo.equipo,
    reglas.primeraCaptura || reglas.muertoEsMuerto,
  );
  // Las reglas del Centro Pokemon: no curar ni salir con un muerto, ni en
  // Nivelada con alguien por encima del tope. Ver `reglasEnVivo.ts`.
  const codigoJuego = state.header?.gameCode ?? '';
  vigilanteRef.current = (antes, ahora, tabla) => {
    // Donde cura la enfermera es un Centro: asi se aprende cual es.
    if (tabla && ahora.mapa && codigoJuego && seCuroElEquipo(antes, ahora)) {
      const aprendida = aprenderCentro(ahora.mapa, tabla);
      if (aprendida !== null) guardarDisposicionDelCentro(codigoJuego, aprendida);
    }
    const partida = state.romName;
    const propio = infracciones.memoria.propio;

    // --- Centro: curar y salir ---
    const reglasDelCentro = {
      muertoEsMuerto: reglas.muertoEsMuerto,
      muertos: infracciones.memoria.muertos,
      tiposRepetidos: reglas.tipoPrimarioUnico ? (tiposRepetidos ?? null) : null,
      disposicionDelCentro: codigoJuego ? leerDisposicionDelCentro(codigoJuego) : null,
    };
    // Un Revivir es la unica forma de volver: ese deja de estar muerto.
    const resucitado = revividoConObjeto(antes, ahora, reglasDelCentro);
    if (resucitado !== null) {
      infracciones.resucitar(resucitado);
      reglasDelCentro.muertos = reglasDelCentro.muertos.filter((p) => p !== resucitado);
      const quien = ahora.equipo?.ranuras.find((p) => p.personalidad === resucitado);
      setAvisoRegla({
        texto: `${quien?.mote.trim() || 'Tu Pokémon'} ha vuelto con un Revivir: ya no cuenta como muerto.`,
        tipo: 'info',
      });
    }
    const delCentro = juzgarCentro(antes, ahora, reglasDelCentro);
    if (delCentro) return delCentro;

    // --- Nivelada: el lider, con todos dentro del tope ---
    if (reglas.topeDeNivel && topes.siguiente) {
      const veredicto = juzgarLider(
        antes,
        ahora,
        {
          nombre: topes.siguiente.lider,
          tope: topes.siguiente.nivel,
          equipo: datosDeLaRom().lideres?.[topes.siguiente.gimnasio - 1] ?? [],
        },
        propio,
      );
      if (veredicto) return veredicto;
    }

    // --- solo el primer encuentro de cada zona ---
    //
    // Antes esto esperaba a tener DOS Pokemon vistos, para no contar lo del
    // laboratorio y porque hasta ahi no hay Poke Balls. Las dos cosas estaban
    // mal resueltas: en una Nuzlocke el segundo Pokemon ES la primera captura,
    // asi que la regla no empezaba a mirar hasta despues de lo unico que tenia
    // que vigilar en la primera ruta. Lo del laboratorio ya queda fuera por si
    // solo -es un combate contra un entrenador, no contra un salvaje- y lo de
    // las Poke Balls se mira donde se puede mirar: en la mochila.
    if (!reglas.primeraCaptura || !partida) return null;
    const contexto = {
      propio,
      rutas: infracciones.memoria.rutas,
      familia: datosDeLaRom().familia,
    };
    const memoria = encuentrosRef.current?.partida === partida
      ? encuentrosRef.current.memoria
      : leerEncuentros(partida);
    const lanzada = juzgarPokeball(antes, ahora, memoria, contexto, nombreDeZona);
    if (lanzada) return lanzada;
    const captura = juzgarCaptura(antes, ahora, memoria, contexto, nombreDeZona);
    if (captura) return captura;
    const apuntado = apuntarEncuentro(memoria, ahora, contexto, especies.nombre);
    if (apuntado.memoria !== memoria) {
      encuentrosRef.current = { partida, memoria: apuntado.memoria };
      guardarEncuentros(partida, apuntado.memoria);
      setZonasConEncuentro(apuntado.memoria.zonas);
    }
    if (apuntado.aviso) setAvisoRegla({ texto: apuntado.aviso, tipo: 'info' });
    return null;
  };

  // Al cargar una partida se traen sus encuentros: el mapa tiene que ensenar
  // las zonas gastadas antes de que pase nada, no solo las de esta sesion.
  useEffect(() => {
    if (!partidaEnCurso) {
      encuentrosRef.current = null;
      setZonasConEncuentro({});
      return;
    }
    const memoria = leerEncuentros(partidaEnCurso);
    encuentrosRef.current = { partida: partidaEnCurso, memoria };
    setZonasConEncuentro(memoria.zonas);
  }, [partidaEnCurso]);

  // Lo que se ve en el mapa: las zonas gastadas y donde se esta. La cuenta esta
  // en `reglasEnVivo` -ver `zonasGastadas`-: es la misma idea de "gastada" que
  // usan las reglas, y tenerla en dos sitios fue justo lo que la descuadro.
  const zonasDelMapa = useMemo(
    () =>
      zonasGastadas(
        zonasConEncuentro,
        infracciones.memoria.rutas,
        miEquipo.equipo,
        infracciones.memoria.propio,
      ),
    [infracciones.memoria, miEquipo.equipo, zonasConEncuentro],
  );
  const zonaActual = miEquipo.mapa ? zonaCanonica(miEquipo.mapa.zona) : null;
  // Quien salio de cada zona, para decirlo en el mapa. Solo los que van en el
  // equipo: de los demas solo se sabe que la zona esta gastada.
  const capturasMias = useMemo(() => {
    const quien = new Map<number, string>();
    for (const p of miEquipo.equipo?.ranuras ?? []) {
      if (!p.huevo && p.lugar !== null && p.lugar !== undefined) {
        quien.set(zonaCanonica(p.lugar), p.mote);
      }
    }
    return quien;
  }, [miEquipo.equipo]);

  // Y que salvaje fue la oportunidad de cada zona. Es lo que explica una zona
  // gastada en la que no tienes nada: ahi salio ese y no lo cogiste.
  const encuentrosMios = useMemo(() => {
    const cual = new Map<number, string>();
    for (const [zona, encuentro] of Object.entries(zonasConEncuentro)) {
      cual.set(Number(zona), especies.nombre(encuentro.especie));
    }
    return cual;
  }, [zonasConEncuentro, especies]);

  /**
   * OTRA PARTIDA EN EL MISMO FICHERO: se olvida todo lo de la anterior.
   *
   * Se puede empezar un juego nuevo sin crear otra partida aqui, desde la
   * pantalla de titulo del propio juego. Como lo apuntado se guarda por
   * fichero, lo de antes seguia mandando: el inicial no era "tuyo" -el numero
   * de entrenador cambia- asi que ningun salvaje se reconocia y ninguna ruta se
   * gastaba, las rutas viejas salian gastadas en el mapa, y con dos Pokemon ya
   * vistos la caida del laboratorio daba la partida por perdida en el primer
   * combate.
   *
   * Se mira AQUI y no dentro de las reglas porque con el reto dado por acabado
   * -aunque fuera el final de la partida anterior- las reglas estan apagadas y
   * no miran nada. Esto hay que verlo precisamente entonces.
   */
  const olvidarReglasDeAntes = infracciones.olvidar;
  const empezarFinDeCero = fin.empezarDeCero;
  useEffect(() => {
    if (!partidaEnCurso) return;
    if (!esOtraPartida(infracciones.memoria, miEquipo.equipo)) return;
    olvidarReglasDeAntes();
    empezarFinDeCero();
    olvidarEncuentros(partidaEnCurso);
    encuentrosRef.current = { partida: partidaEnCurso, memoria: ENCUENTROS_VACIOS };
    setZonasConEncuentro({});
    setAvisoRegla({
      texto:
        'Esto es una partida nueva: se olvida lo apuntado de la anterior y las reglas empiezan de cero.',
      tipo: 'info',
    });
  }, [
    partidaEnCurso,
    infracciones.memoria,
    miEquipo.equipo,
    olvidarReglasDeAntes,
    empezarFinDeCero,
  ]);

  // El aviso de una regla que se acaba de hacer cumplir. Se va solo.
  const [avisoRegla, setAvisoRegla] = useState<{ texto: string; tipo: 'error' | 'info' } | null>(
    null,
  );
  const deshecho = miEquipo.deshecho;
  useEffect(() => {
    if (!deshecho) return;
    setAvisoRegla({ texto: deshecho.motivo, tipo: 'error' });
  }, [deshecho]);
  // Se va solo: los de una regla rota tardan mas, que hay que leerlos.
  useEffect(() => {
    if (!avisoRegla) return;
    const quitar = setTimeout(() => setAvisoRegla(null), avisoRegla.tipo === 'error' ? 9000 : 6000);
    return () => clearTimeout(quitar);
  }, [avisoRegla]);

  // Y se le cuenta al companero, igual que el equipo.
  const { enviarMapa } = session;
  const clavesMapa = `${zonaActual}|${zonasDelMapa.join(',')}`;
  useEffect(() => {
    if (state.status !== 'running') return;
    enviarMapa({ zona: zonaActual, gastadas: zonasDelMapa });
    // `clavesMapa` resume las dos cosas: solo se manda cuando cambian.
  }, [clavesMapa, session.state.canalListo, enviarMapa, state.status]);

  const tiposRepetidos = useMemo(
    () =>
      reglas.tipoPrimarioUnico
        ? tiposPrimariosRepetidos(miEquipo.equipo, session.state.equipoCompanero)
        : undefined,
    [reglas.tipoPrimarioUnico, miEquipo.equipo, session.state.equipoCompanero],
  );

  /**
   * Lo que hay que hacer antes de seguir, estando dentro de un Centro.
   *
   * No sale del juez sino de la ultima lectura, a proposito: es un DEBER que
   * sigue ahi hasta que se cumple, no un aviso de algo que acaba de pasar. Se
   * queda en pantalla mientras ese Pokemon siga en el equipo y desaparece solo
   * en cuanto se guarda en el PC.
   */
  const deberDelCentroAhora = useMemo(
    () =>
      deberDelCentro(miEquipo.mapa, miEquipo.equipo, {
        muertoEsMuerto: reglas.muertoEsMuerto,
        muertos: infracciones.memoria.muertos,
        tiposRepetidos: reglas.tipoPrimarioUnico ? (tiposRepetidos ?? null) : null,
        disposicionDelCentro: codigoJuego ? leerDisposicionDelCentro(codigoJuego) : null,
      }),
    [
      miEquipo.mapa,
      miEquipo.equipo,
      reglas.muertoEsMuerto,
      reglas.tipoPrimarioUnico,
      infracciones.memoria.muertos,
      tiposRepetidos,
      codigoJuego,
    ],
  );

  // Mandarle el equipo al companero. Se hace desde un solo sitio y no al
  // leerlo, para que tambien salga cuando abre el canal: quien ya estaba
  // jugando no tiene por que cambiar de equipo justo cuando el otro entra, y
  // asi el recien llegado no se quedaba sin verlo.
  const { enviarEquipo } = session;
  const equipoPropio = miEquipo.equipo;
  // Con `derrota`: que el juego haya cantado la derrota es lo unico que
  // distingue, al otro lado, una muerte de verdad del combate del laboratorio.
  useEffect(() => {
    if (equipoPropio) enviarEquipo(equipoPropio, miEquipo.derrota);
  }, [equipoPropio, session.state.canalListo, enviarEquipo, miEquipo.derrota]);

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
   * Que se esta mirando de el: su partida y su equipo, por separado.
   *
   * Van en dos estados y la relacion entre ellos NO es simetrica, a proposito:
   *
   *   - Cambiar de partida arrastra el equipo. Si te pasas a su partida y
   *     debajo sigue tu equipo, lo que hay debajo de su partida no es suyo, y
   *     eso se mira sin leer -son seis fichas que se parecen- asi que se
   *     confunde enseguida.
   *   - Cambiar de equipo NO arrastra la partida. Mirar como va su equipo es
   *     algo que se hace de reojo, a cada rato, y no tiene por que costarte
   *     perder de vista tu propia partida.
   */
  const [verSuPantalla, setVerSuPantalla] = useState(false);
  const [verSuEquipo, setVerSuEquipo] = useState(false);

  /** Cambia de partida, y con ella de equipo. Ver arriba por que solo en ese sentido. */
  const cambiarDePantalla = () => {
    const suya = !verSuPantalla;
    setVerSuPantalla(suya);
    setVerSuEquipo(suya);
  };

  // A pantalla completa pasa lo mismo que en una pantalla estrecha: cabe UNA
  // columna de equipo, no dos, porque todo el sitio es para la partida. Asi que
  // se ve un equipo y se cambia, con las dos pestanas de la cabecera o con el
  // mismo boton que cambia de partida.
  //
  // Y cambia las dos cosas a la vez a proposito: si te pasas a su pantalla y
  // sigues viendo tu equipo, lo que hay debajo de su partida no es suyo.
  const enCompleta = usePantallaCompleta();
  const unoSolo = (estrecha || enCompleta) && conCompanero;

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
        tratoAMedias={hasRom && intercambio.estado.aMedias}
        onToggleMenu={() => setMenuOpen((v) => !v)}
        menuOpen={menuOpen}
        volume={state.volume}
        onVolume={emulator.setVolume}
        onToggleMute={emulator.toggleMute}
        volumeDisabled={!hasRom}
        cuenta={cuenta.cuenta}
        onOpenCuenta={() => setCuentaOpen(true)}
        cuentaOpen={cuentaOpen}
        onOpenRanking={() => setRankingOpen(true)}
      />

      <main className="app__main">
       <div className="juego" ref={marcoDeJuego}>
        {/* Dentro del marco que va a pantalla completa: fuera de el no se veria
            jugando a pantalla completa, que es justo cuando salta. */}
        {/* Los dos carteles van en una columna y no cada uno pegado al borde:
            con los textos largos del Centro en una pantalla estrecha ocupan
            varias lineas cada uno y se pisaban. */}
        {(deberDelCentroAhora || avisoRegla) && (
          <div className="avisos">
            {/* El deber del Centro no se puede quitar: no es un aviso de algo
                que paso, es lo que falta por hacer. Se va al cumplirse. */}
            {deberDelCentroAhora && (
              <div className="aviso-regla aviso-regla--deber" role="alert">
                <span className="aviso-regla__marca" aria-hidden="true">
                  PC
                </span>
                <span>{deberDelCentroAhora}</span>
              </div>
            )}

            {avisoRegla && (
              <div
                className={`aviso-regla aviso-regla--${avisoRegla.tipo}`}
                role={avisoRegla.tipo === 'error' ? 'alert' : 'status'}
              >
                <span className="aviso-regla__marca" aria-hidden="true">
                  {avisoRegla.tipo === 'error' ? '!' : 'i'}
                </span>
                <span>{avisoRegla.texto}</span>
                <button type="button" onClick={() => setAvisoRegla(null)}>
                  Entendido
                </button>
              </div>
            )}
          </div>
        )}

        {/* Con una sola columna de equipo -pantalla completa, o estrecha- la mesa
            es la de jugar solo: si no, se quedaba reservada la columna del
            companero, vacia, y la partida perdia 230 pixeles de ancho por un
            hueco que no pintaba nada. */}
        <div className={`mesa${conCompanero && !unoSolo ? '' : ' mesa--solo'}`}>
          {/* Con sitio, los dos equipos a los lados. En pantalla estrecha solo
              cabe uno, asi que se enseña ese y se cambia con el boton. */}
          <EquipoPanel
            titulo={unoSolo && verSuEquipo ? `Equipo de ${nombreDelCompanero}` : miNombre}
            lado={unoSolo && verSuEquipo ? 'companero' : 'propio'}
            onElegir={unoSolo && verSuEquipo ? undefined : setMoteDe}
            equipo={unoSolo && verSuEquipo ? equipoSuyo.equipo : equipoMio.equipo}
            activo={unoSolo && verSuEquipo ? equipoSuyo.alFrente : equipoMio.alFrente}
            especies={especies}
            caidosDelOtro={unoSolo && verSuEquipo ? caidosMios : caidosSuyos}
            /* Solo en la columna propia: el tope del companero depende de SU
               ROM y de SUS medallas, y ni una ni otras salen de su ordenador.
               Ponerle el tuyo marcaria a sus Pokemon por una regla que no es la
               suya. */
            tope={(unoSolo && verSuEquipo) || !reglas.topeDeNivel ? null : topes.siguiente}
            /* La regla mira los dos equipos a la vez, asi que la marca sale en
               los dos lados: tu ves cual de los tuyos choca y cual de los suyos. */
            tiposRepetidos={tiposRepetidos}
            /* Solo en la columna propia, como el tope. */
            infracciones={unoSolo && verSuEquipo ? undefined : infracciones}
            onCambiar={unoSolo ? () => setVerSuEquipo((v) => !v) : undefined}
            nombreDelOtro={nombreDelCompanero}
            nombrePropio={miNombre}
          />

          {/* Por donde va la partida, en una columna pegada al equipo: las ocho
              medallas -a color las que lleva, apagadas las que no- y debajo de
              cada una el nivel mas alto del lider de ese gimnasio.

              Al lado del equipo y no sobre la pantalla porque es ahi donde se
              compara: el tope de la medalla que toca es el que deja a un Pokemon
              fuera por pasado de nivel, y las dos cosas tienen que poder mirarse
              de un vistazo sin mover los ojos por toda la ventana.

              Solo con partida en marcha; sin ella no hay nada que contar. */}
          {/* Se queda puesta aunque mires su equipo: son TUS medallas, no las de
              la columna de al lado. Quitarlas al cambiar de pestana encogia la
              mesa 62 pixeles y la partida se reescalaba de golpe cada vez. */}
          {hasRom && (
            <Medallas
              variante="tira"
              conseguidas={miEquipo.medallas.conseguidas}
              topes={topes.todos}
            />
          )}

          <div className="mesa__centro">
        <Stage
          marcoCompleto={marcoDeJuego}
          /* La pantalla y el equipo que se ensenan son la misma decision: al
             deslizar a su partida tiene que verse tambien su equipo. */
          mirandoLoSuyo={verSuPantalla}
          onCambiarPantalla={cambiarDePantalla}
          onAbrirMapa={() => setMapaOpen(true)}
          canvasRef={emulator.canvasRef}
          companeroSinVideo={session.state.peerSinVideo}
          remoteStream={session.state.remoteStream}
          /* Su apodo, si lo dijo al entrar en la sala. El nombre del fichero
             de su ROM no sale nunca: no le dice nada a nadie y ademas delata
             como lo tiene guardado. */
          partnerLabel={nombreDelCompanero}
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
              /* Su nombre a secas, como el tuyo en la otra columna. "Equipo de
                 Mateo" al lado de "Juan" se lee como si fueran dos cosas
                 distintas, y son lo mismo visto desde cada lado. */
              titulo={nombreDelCompanero}
              lado="companero"
              equipo={equipoSuyo.equipo}
              activo={equipoSuyo.alFrente}
              especies={especies}
              caidosDelOtro={caidosMios}
              tiposRepetidos={tiposRepetidos}
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
        porElTope={fin.porElTope}
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

        {/* Con sesion, el boton de la cuenta abre tu ficha; sin ella, la
            pantalla de entrar. Son dos cosas distintas y no tiene sentido
            meterlas en el mismo cartel. */}
        {cuenta.cuenta ? (
          <FichaModal
            open={cuentaOpen}
            onClose={() => setCuentaOpen(false)}
            cuenta={cuenta}
            especies={especies}
          />
        ) : (
          <CuentaModal open={cuentaOpen} onClose={() => setCuentaOpen(false)} cuenta={cuenta} />
        )}

        <AjustesModal
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          state={state}
          emulator={emulator}
          teclas={teclas}
          mando={mando}
          mandoFisico={mandoFisico}
          video={{ enviando: session.enviandoVideo, cambiar: session.cambiarEnvioDeVideo }}
          hasRom={hasRom}
          conCompanero={conCompanero}
          onAleatorizar={() => {
            setMenuOpen(false);
            setRandomizerOpen(true);
          }}
          existeGuardada={emulator.existeGuardada}
          onContinuar={emulator.openSavedGame}
          onBorrarPartida={emulator.deleteSavedGame}
          leerGuardado={emulator.leerGuardado}
          baseRom={emulator.baseRomRef}
          conCuenta={cuenta.cuenta !== null}
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
        /* Sin cuenta se puede aleatorizar y jugar, pero la partida no se
           guarda: las tres ranuras son de quien inicia sesion. */
        conCuenta={cuenta.cuenta !== null}
      />

      {/* Quien llega por un enlace no tiene que escribir nada: el codigo, la
          contrasena y la semilla venian dentro. Lo unico que se le pide es su
          copia del juego, que es lo unico que el enlace no puede traer. */}
      <InvitacionModal
        invitacion={invitacion}
        onClose={() => setInvitacion(null)}
        baseRom={emulator.baseRomRef}
        gameCode={state.header?.gameCode ?? null}
        romName={state.romName}
        nucleoListo={state.status === 'ready'}
        hint={RoomDropZoneHint(state.status)}
        onRom={emulator.openRom}
        onRandomized={emulator.openRomBytes}
        onContinuar={emulator.openSavedGame}
        existeGuardada={emulator.existeGuardada}
        conCuenta={cuenta.cuenta !== null}
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
        /* Con cuenta, la sala no vuelve a preguntar como te llamas. */
        cuenta={cuenta.cuenta}
        /* Con el mundo que se esta jugando: se queda en la sala y asi el
           enlace que se comparte lleva solo el codigo y la contrasena. */
        onCreate={(password, nombre) =>
          void session.createRoom(
            password,
            (() => {
              const suya = semillaEnCurso(state.header?.crc32 ?? null);
              return suya ? codificarSemilla(suya) : null;
            })(),
            nombre,
          )
        }
        onJoin={(code, password, nombre) => void session.joinRoom(code, password, nombre)}
        onLeave={() => {
          session.leave();
          setRoomOpen(false);
        }}
        onRetry={session.retryNow}
        /* El enlace que se comparte lleva el mundo dentro: asi quien entra no
           tiene que pedir la semilla aparte ni entender para que sirve. */
        semilla={semillaEnCurso(state.header?.crc32 ?? null)}
        gameCode={state.header?.gameCode ?? null}
      />

      {/* El ranking va ENCIMA, no en lugar de la partida: el emulador sigue
          montado debajo. Desmontarlo para ensenar una tabla seria apagarle el
          juego a alguien por mirar quien va ganando, y volver costaria cargar
          el nucleo otra vez. */}
      <MoteModal
        pokemon={
          moteDe
            ? { mote: moteDe.mote, nombreEspecie: especies.nombre(moteDe.especie) }
            : null
        }
        conPareja={enSoulLink ? nombreDelCompanero : null}
        onCerrar={() => setMoteDe(null)}
        onCambiar={cambiarMote}
      />

      <SoulLinkModal
        open={preguntarSoullink}
        nombreDelCompanero={nombreDelCompanero}
        onElegir={elegirSoullink}
      />

      <MapaModal
        open={mapaOpen}
        onClose={() => setMapaOpen(false)}
        codigoJuego={state.header?.gameCode ?? null}
        zonaMia={zonaActual}
        gastadasMias={zonasDelMapa}
        capturasMias={capturasMias}
        encuentrosMios={encuentrosMios}
        zonaSuya={conCompanero ? (session.state.mapaCompanero?.zona ?? null) : null}
        gastadasSuyas={conCompanero ? (session.state.mapaCompanero?.gastadas ?? []) : null}
        nombreSuyo={nombreDelCompanero}
      />

      {rankingOpen && (
        <Ranking
          onVolver={() => setRankingOpen(false)}
          usuario={cuenta.cuenta?.usuario ?? null}
          especies={especies}
        />
      )}
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
  return partida ? semillaDePartida(partida) : null;
};

const nombreDeLaPartidaEnCurso = (crc32: string | null): string | null => {
  if (!crc32) return null;
  const partida = todasLasPartidas().find((p) => p.crc32 === crc32);
  return partida ? nombreDePartida(partida) : null;
};


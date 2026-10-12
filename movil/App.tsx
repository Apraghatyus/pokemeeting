// Pokemeeting para Android.
//
// Dos pantallas: elegir la partida y jugar. Jugando se ve la consola, el
// equipo de los dos, las medallas y el mando, y desde ahi se entra en una sala
// de la web. Lo que pasa mientras se juega (reglas, Soul Link, fin de partida,
// intercambios...) esta en src/partidaViva.ts y es el mismo codigo que la web.
//
// LA ROM NO SALE DEL TELEFONO. Se copia a la carpeta privada de la app para
// poder abrirla y de ahi no se mueve: por la sala viaja su huella -titulo,
// codigo y CRC-, igual que en la web.

import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {RTCView} from 'react-native-webrtc';
import type {Dificultad, PokemonResumen} from '@emupoke/protocol';
import {parseGameCode} from '@emupoke/pokemon';
import {readRomHeader} from '../apps/web/src/core/romHeader';
import {DIFICULTADES} from '../apps/web/src/core/dificultad';
import {apodoGuardado} from '../apps/web/src/core/apodo';
import {leerPaquete, type Partida as PartidaTraida} from '../apps/web/src/core/paquete';
import {
  codificarSemilla,
} from '../apps/web/src/core/semilla';
import {
  cuando,
  juegoDePartida,
  nombreDePartida,
  registrar,
  reglasDe,
  semillaDePartida,
  tocar,
  todasLasPartidas,
  type PartidaGuardada,
} from '../apps/web/src/core/partidas';
import {subirLoDeAqui} from '../apps/web/src/core/cuenta';
import type {Invitacion} from '../apps/web/src/core/invitacion';
import {useCuenta, type EstadoDeCuenta} from '../apps/web/src/core/useCuenta';
import {Aleatorizar} from './src/Aleatorizar';
import {traerPartida, type PuestoEnCola} from './src/aleatorizar';
import {Invitado} from './src/Invitado';
import {invitacionDeEnlace} from './src/invitacion';
import {PanelDeCuenta} from './src/PanelDeCuenta';
import {PanelDeEstados} from './src/PanelDeEstados';
import {Aviso} from './src/Aviso';
import {desdeBase64} from './src/base64';
import {Boton} from './src/Boton';
import {Equipo} from './src/Equipo';
import {leerEspecies, SIN_ESPECIES} from './src/especies';
import {Mando} from './src/Mando';
import {Medallas} from './src/Medallas';
import {eventosDelEmulador, Mgba, Pantalla, type Rom} from './src/nativo';
import {PanelDelMando} from './src/PanelDelMando';
import {PanelDeSala} from './src/PanelDeSala';
import {usePartidaViva, type DatosDePartida} from './src/partidaViva';
import {CambiarMote, FinDePartida, IntercambioVentana, PreguntaSoulLink} from './src/Ventanas';

type Pantalla =
  | {tipo: 'inicio'}
  | {tipo: 'aleatorizar'}
  | {tipo: 'invitado'; invitacion: Invitacion}
  | {tipo: 'traer'; traida: PartidaTraida}
  | {tipo: 'reglas'; datos: DatosDePartida; unirseA: Invitacion | null}
  | {tipo: 'jugando'; datos: DatosDePartida; unirseA: Invitacion | null};

const App = () => {
  const [pantalla, setPantalla] = useState<Pantalla>({tipo: 'inicio'});
  const [problema, setProblema] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [roms, setRoms] = useState<Rom[]>([]);
  const cuenta = useCuenta();
  /** Una invitacion que llega jugando: se atiende al salir. */
  const [invitacionPendiente, setInvitacionPendiente] = useState<Invitacion | null>(null);

  const releerRoms = useCallback(() => void Mgba.romsGuardadas().then(setRoms), []);
  useEffect(releerRoms, [releerRoms]);

  // El enlace de invitacion de la web abre la app: al arrancar o con ella abierta.
  const pantallaRef = useRef(pantalla);
  pantallaRef.current = pantalla;
  useEffect(() => {
    const recibir = (url: string | null) => {
      const invitacion = invitacionDeEnlace(url);
      if (!invitacion) return;
      if (pantallaRef.current.tipo === 'jugando') setInvitacionPendiente(invitacion);
      else setPantalla({tipo: 'invitado', invitacion});
    };
    void Linking.getInitialURL().then(recibir);
    const sub = Linking.addEventListener('url', ({url}) => recibir(url));
    return () => sub.remove();
  }, []);

  const abrir = async (rom: Rom, unirseA: Invitacion | null = null) => {
    setCargando(true);
    setProblema(null);
    try {
      // La ROM entera se lee una vez: de ella salen la huella para la sala,
      // los nombres y tipos de cada especie y lo que necesitan las reglas.
      const bytes = desdeBase64(await Mgba.leerBase64(rom.ruta));
      const cabecera = readRomHeader(bytes);
      const datos: DatosDePartida = {
        fichero: rom.nombre,
        rom: bytes,
        huella: {
          title: cabecera.title,
          gameCode: cabecera.gameCode,
          version: cabecera.version,
          crc32: cabecera.crc32,
          fileName: rom.nombre,
        },
        especies: cabecera.platform === 'gba' ? leerEspecies(bytes) : SIN_ESPECIES,
      };
      if (!(await Mgba.cargar(rom.ruta))) throw new Error('El emulador no reconoce ese fichero como un juego.');
      // Una partida sin apuntar: se pregunta con que reglas se juega, una vez.
      const registrada = todasLasPartidas().find(p => p.fichero === rom.nombre);
      if (registrada) {
        tocar(registrada.id);
        setPantalla({tipo: 'jugando', datos, unirseA});
      } else setPantalla({tipo: 'reglas', datos, unirseA});
    } catch (error) {
      setProblema(error instanceof Error ? error.message : String(error));
      setPantalla({tipo: 'inicio'});
    } finally {
      setCargando(false);
      releerRoms();
    }
  };

  const apuntar = (datos: DatosDePartida, dificultad: Dificultad, unirseA: Invitacion | null) => {
    const juego = parseGameCode(datos.huella.gameCode).game;
    registrar({
      soullink: false,
      dificultad,
      fichero: datos.fichero,
      baseNombre: datos.fichero,
      baseCrc32: datos.huella.crc32,
      semilla: null,
      ajustes: null,
      crc32: datos.huella.crc32,
      cambiado: [],
      nombre: null,
      juego: juego?.label ?? null,
      generacion: juego?.generacion ?? null,
    });
    setPantalla({tipo: 'jugando', datos, unirseA});
  };

  const anadirRom = async () => {
    const rom = await Mgba.elegirRom();
    releerRoms();
    return rom;
  };

  const traer = async () => {
    setProblema(null);
    const fichero = await Mgba.abrirFichero().catch(() => null);
    if (!fichero) return;
    const traida = leerPaquete(desdeBase64(fichero.base64));
    if (!traida) {
      setProblema('Ese fichero no es una partida de Pokemeeting. Tiene que ser el .emupoke que exportaste.');
      return;
    }
    setPantalla({tipo: 'traer', traida});
  };

  const volverAlInicio = () => {
    if (invitacionPendiente) {
      setPantalla({tipo: 'invitado', invitacion: invitacionPendiente});
      setInvitacionPendiente(null);
    } else setPantalla({tipo: 'inicio'});
  };

  return (
    <SafeAreaView style={estilos.raiz}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f14" />
      {pantalla.tipo === 'jugando' ? (
        <Juego
          partida={pantalla.datos}
          unirseA={pantalla.unirseA}
          hayCuenta={cuenta.cuenta !== null}
          invitacionPendiente={invitacionPendiente !== null}
          onSalir={() => {
            Mgba.cerrar();
            volverAlInicio();
          }}
        />
      ) : pantalla.tipo === 'reglas' ? (
        <ElegirDificultad onElegir={d => apuntar(pantalla.datos, d, pantalla.unirseA)} />
      ) : pantalla.tipo === 'aleatorizar' ? (
        <Aleatorizar roms={roms} onListo={rom => void abrir(rom)} onVolver={() => setPantalla({tipo: 'inicio'})} />
      ) : pantalla.tipo === 'invitado' ? (
        <Invitado
          invitacion={pantalla.invitacion}
          roms={roms}
          onAnadirRom={() => void anadirRom()}
          onListo={rom => void abrir(rom, pantalla.invitacion)}
          onVolver={() => setPantalla({tipo: 'inicio'})}
        />
      ) : pantalla.tipo === 'traer' ? (
        <Traer
          traida={pantalla.traida}
          roms={roms}
          onAnadirRom={() => void anadirRom()}
          onListo={rom => void abrir(rom)}
          onVolver={() => setPantalla({tipo: 'inicio'})}
        />
      ) : (
        <Inicio
          roms={roms}
          cuenta={cuenta}
          onAbrir={rom => void abrir(rom)}
          onAnadir={async () => {
            const rom = await anadirRom();
            if (rom) void abrir(rom);
          }}
          onAleatorizar={() => setPantalla({tipo: 'aleatorizar'})}
          onTraer={() => void traer()}
          cargando={cargando}
          problema={problema}
        />
      )}
    </SafeAreaView>
  );
};

/** Con que reglas se juega una partida nueva. Se elige una vez y no cambia. */
const ElegirDificultad = ({onElegir}: {onElegir: (d: Dificultad) => void}) => (
  <ScrollView contentContainerStyle={estilos.inicio}>
    <Text style={estilos.seccion}>¿Con qué reglas juegas esta partida?</Text>
    <Text style={estilos.nota}>Se elige ahora y no se cambia después: es parte de la partida.</Text>
    {DIFICULTADES.map(d => (
      <View key={d.id} style={estilos.tarjeta}>
        <Text style={estilos.tarjetaTitulo}>
          {d.nombre} · {d.coletilla}
        </Text>
        {d.reglas.map(r => (
          <Text key={r} style={estilos.nota}>
            › {r}
          </Text>
        ))}
        <Boton texto={`Jugar en ${d.nombre}`} principal={d.id === 'nuzlocke'} onPress={() => onElegir(d.id)} />
      </View>
    ))}
  </ScrollView>
);

/** Que es cada ROM de la lista: su partida apuntada, si la tiene. */
const etiquetaDe = (rom: Rom, partidas: PartidaGuardada[]) => {
  const p = partidas.find(x => x.fichero === rom.nombre);
  if (!p) return {titulo: rom.nombre, detalle: null};
  const reglas = DIFICULTADES.find(d => d.id === reglasDe(p))?.nombre ?? '';
  const aleatoria = p.semilla !== null;
  return {
    titulo: aleatoria ? `${juegoDePartida(p)} · ${nombreDePartida(p)}` : juegoDePartida(p),
    detalle: [aleatoria ? 'Aleatoria' : 'Tal cual', reglas, p.soullink ? 'Soul Link' : null, cuando(p.jugada)]
      .filter(Boolean)
      .join(' · '),
  };
};

const Inicio = ({
  roms,
  cuenta,
  onAbrir,
  onAnadir,
  onAleatorizar,
  onTraer,
  cargando,
  problema,
}: {
  roms: Rom[];
  cuenta: EstadoDeCuenta;
  onAbrir: (rom: Rom) => void;
  onAnadir: () => void;
  onAleatorizar: () => void;
  onTraer: () => void;
  cargando: boolean;
  problema: string | null;
}) => {
  const partidas = todasLasPartidas();
  // Lo jugado hace poco, arriba; lo que no tiene partida, detras.
  const orden = (r: Rom) => partidas.find(p => p.fichero === r.nombre)?.jugada ?? 0;
  const lista = [...roms].sort((a, b) => orden(b) - orden(a));

  return (
    <ScrollView contentContainerStyle={estilos.inicio}>
      <Text style={estilos.marca}>Pokemeeting</Text>
      <Text style={estilos.nota}>
        Tus ROMs se quedan en este teléfono: no se suben a ningún sitio ni se le mandan a nadie.
      </Text>
      <Boton texto={cargando ? 'Abriendo…' : 'Añadir una ROM'} principal onPress={onAnadir} />
      <View style={estilos.fila}>
        <View style={estilos.mitad}>
          <Boton texto="Aleatorizar" onPress={onAleatorizar} />
        </View>
        <View style={estilos.mitad}>
          <Boton texto="Traer partida" onPress={onTraer} />
        </View>
      </View>
      {problema && <Text style={estilos.error}>{problema}</Text>}
      {lista.length > 0 && <Text style={estilos.seccion}>Tus juegos</Text>}
      {lista.map(rom => {
        const {titulo, detalle} = etiquetaDe(rom, partidas);
        return (
          <Pressable
            key={rom.ruta}
            onPress={() => onAbrir(rom)}
            style={({pressed}) => [estilos.tarjeta, pressed && {opacity: 0.7}]}>
            <Text style={estilos.tarjetaTitulo} numberOfLines={1}>
              {titulo}
            </Text>
            {detalle && <Text style={estilos.nota}>{detalle}</Text>}
          </Pressable>
        );
      })}
      <Text style={estilos.seccion}>Tu cuenta</Text>
      <PanelDeCuenta cuenta={cuenta} />
    </ScrollView>
  );
};

/** Elegir la ROM original para seguir una partida traida en un .emupoke. */
const Traer = ({
  traida,
  roms,
  onAnadirRom,
  onListo,
  onVolver,
}: {
  traida: PartidaTraida;
  roms: Rom[];
  onAnadirRom: () => void;
  onListo: (rom: Rom) => void;
  onVolver: () => void;
}) => {
  const [trabajando, setTrabajando] = useState(false);
  const [puesto, setPuesto] = useState<PuestoEnCola | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const bases = roms.filter(r => !/-aleatoria-/.test(r.nombre));

  const usar = async (base: Rom) => {
    setTrabajando(true);
    setProblema(null);
    try {
      onListo(await traerPartida(base, traida, setPuesto));
    } catch (error) {
      setProblema(error instanceof Error ? error.message : String(error));
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={estilos.inicio}>
      <Text style={estilos.marca}>Traer «{traida.nombre}»</Text>
      {trabajando ? (
        <Text style={estilos.nota}>
          {puesto && puesto.delante > 0
            ? `Rehaciendo tu mundo… hay ${puesto.delante} delante.`
            : 'Rehaciendo tu mundo desde la semilla…'}
        </Text>
      ) : (
        <>
          <Text style={estilos.nota}>
            Elige la ROM original con la que se creó: de ella y la semilla sale la misma copia, y ahí se mete tu
            guardado.
          </Text>
          {bases.map(r => (
            <Boton key={r.ruta} texto={r.nombre} onPress={() => void usar(r)} />
          ))}
          <Boton texto="Añadir una ROM" principal={bases.length === 0} onPress={onAnadirRom} />
          {problema && <Text style={estilos.error}>{problema}</Text>}
          <Boton texto="Volver" onPress={onVolver} />
        </>
      )}
    </ScrollView>
  );
};

const Juego = ({
  partida,
  unirseA,
  hayCuenta,
  invitacionPendiente,
  onSalir,
}: {
  partida: DatosDePartida;
  /** Si se llega por un enlace de invitacion: se entra en esa sala sola. */
  unirseA: Invitacion | null;
  hayCuenta: boolean;
  invitacionPendiente: boolean;
  onSalir: () => void;
}) => {
  const viva = usePartidaViva(partida, hayCuenta);
  const {sala, lectura, intercambio} = viva;
  const {equipo} = lectura;
  const [verSala, setVerSala] = useState(unirseA !== null);
  const [verEstados, setVerEstados] = useState(false);

  // Por el enlace se entra en la sala sin teclear nada.
  const unido = useRef(false);
  useEffect(() => {
    if (!unirseA || unido.current) return;
    unido.current = true;
    sala.unirse(unirseA.sala, unirseA.clave, apodoGuardado());
  }, [unirseA, sala]);

  // Al terminar con sesion, el final se sube solo para el ranking.
  useEffect(() => {
    if (viva.fin.acabada && hayCuenta) void subirLoDeAqui().catch(() => undefined);
  }, [viva.fin.acabada, hayCuenta]);

  // La semilla de esta partida, para que quien entre rehaga el mismo mundo.
  const registro = todasLasPartidas().find(p => p.fichero === partida.fichero);
  const semillaRegistro = registro ? semillaDePartida(registro) : null;
  const semilla = semillaRegistro ? codificarSemilla(semillaRegistro) : null;
  const [verLoSuyo, setVerLoSuyo] = useState(false);
  const [menu, setMenu] = useState(false);
  const [verMando, setVerMando] = useState(false);
  const [verTrato, setVerTrato] = useState(false);
  const [moteDe, setMoteDe] = useState<PokemonResumen | null>(null);
  // Con un mando fisico en la mano el tactil sobra, como en la web: se aparta
  // al usarlo y vuelve en cuanto se toca la pantalla.
  const [conMandoFisico, setConMandoFisico] = useState(false);
  useEffect(() => {
    const sub = eventosDelEmulador.addListener('mandoFisicoUsado', () => setConMandoFisico(true));
    return () => sub.remove();
  }, []);
  const alTocarLaPantalla = () => {
    if (!conMandoFisico) return;
    setConMandoFisico(false);
    Mgba.mandoTactilVisible();
  };
  // Tumbado se juega como en la web: la partida a todo el alto y el mando
  // flotando encima. Se mira el tamaño y no un sensor: es lo que manda.
  const {width, height} = useWindowDimensions();
  const horizontal = width > height;

  const conCompanero = sala.estado.fase === 'conectada';
  const suPantalla = sala.estado.pantallaCompanero;
  // La pantalla y el equipo que se ven son la misma decision, como en la web.
  const mirandoLoSuyo = verLoSuyo && conCompanero;
  const nombreDelOtro = viva.nombreDelCompanero;

  // Al salir de la app el juego se para y deja de sonar; al volver sigue.
  useEffect(() => {
    const sub = AppState.addEventListener('change', estado => Mgba.pausar(estado !== 'active'));
    return () => sub.remove();
  }, []);

  const consola = (
    <>
      <Pantalla style={[estilos.pantalla, mirandoLoSuyo && suPantalla ? estilos.oculta : null]} />
      {mirandoLoSuyo && suPantalla && (
        <RTCView streamURL={suPantalla.toURL()} style={estilos.pantalla} objectFit="contain" />
      )}
      {mirandoLoSuyo && sala.estado.companeroSinVideo && (
        <View style={[estilos.pantalla, estilos.sinVideo]}>
          <Text style={estilos.nota}>{nombreDelOtro} no manda su pantalla: su móvil va justo.</Text>
        </View>
      )}
    </>
  );

  // Las reglas sobre el equipo propio, para las etiquetas.
  const marcasPropias = {
    tope: viva.tope?.nivel ?? null,
    tiposRepetidos: viva.tiposRepetidos,
    infracciones: viva.infracciones,
  };

  const ventanas = (
    <>
      <Aviso aviso={viva.aviso} onCerrar={viva.cerrarAviso} />
      <FinDePartida
        fin={viva.fin}
        medallas={lectura.medallas.cuantas}
        especies={partida.especies}
        nombreDelCompanero={nombreDelOtro}
      />
      <PreguntaSoulLink abierta={viva.preguntarSoullink} nombreDelCompanero={nombreDelOtro} onElegir={viva.elegirSoullink} />
      <CambiarMote
        pokemon={moteDe}
        especies={partida.especies}
        conPareja={viva.enSoulLink ? nombreDelOtro : null}
        onCerrar={() => setMoteDe(null)}
        onCambiar={nuevo => (moteDe ? viva.cambiarMote(moteDe, nuevo) : Promise.resolve(null))}
      />
      <IntercambioVentana
        abierta={verTrato}
        onCerrar={() => setVerTrato(false)}
        intercambio={intercambio}
        equipo={equipo}
        especies={partida.especies}
        conCompanero={conCompanero}
      />
    </>
  );

  const opcionesDelMenu = (cerrar: () => void) => (
    <>
      <Boton texto={conCompanero ? `Sala · ${nombreDelOtro}` : 'Sala'} onPress={() => setVerSala(true)} />
      {conCompanero && (
        <Boton
          texto={mirandoLoSuyo ? 'Ver mi partida' : `Ver la partida de ${nombreDelOtro}`}
          onPress={() => {
            setVerLoSuyo(v => !v);
            cerrar();
          }}
        />
      )}
      {(conCompanero || intercambio.estado.aMedias) && (
        <Boton
          texto="Intercambiar"
          onPress={() => {
            setVerTrato(true);
            cerrar();
          }}
        />
      )}
      <Boton texto="Estados y exportar" onPress={() => setVerEstados(true)} />
      <Boton texto="Mando físico" onPress={() => setVerMando(true)} />
      <Boton texto={invitacionPendiente ? 'Salir (tienes una invitación)' : 'Salir del juego'} onPress={onSalir} />
    </>
  );

  if (horizontal) {
    return (
      <View style={estilos.tumbado} onTouchStart={alTocarLaPantalla}>
        <StatusBar hidden />
        {/* 3:2 a todo el alto y centrada: lo que sobra de ancho se reparte a
            los lados, y ahi caen los botones. */}
        <View style={[estilos.consolaTumbada, {height, width: Math.min(width, height * 1.5)}]}>{consola}</View>

        {!conMandoFisico && <Mando horizontal />}

        {/* El equipo arriba, sobre la banda negra. Tocarlo cambia al del
            companero, y con el su partida. */}
        <Pressable
          style={estilos.tiraArriba}
          onPress={() => conCompanero && setVerLoSuyo(v => !v)}
          accessibilityLabel={mirandoLoSuyo ? `Equipo de ${nombreDelOtro}` : 'Tu equipo'}>
          <Equipo
            compacta
            titulo={mirandoLoSuyo ? `Equipo de ${nombreDelOtro}` : 'Tu equipo'}
            equipo={mirandoLoSuyo ? sala.estado.equipoCompanero : equipo}
            especies={partida.especies}
            caidosDelOtro={mirandoLoSuyo ? viva.caidosMios : viva.caidosSuyos}
            {...(mirandoLoSuyo ? {} : marcasPropias)}
          />
        </Pressable>

        {/* La barra no cabe: lo que tenia va a un menu, encima de Select y Start. */}
        <Pressable style={estilos.botonMenu} onPress={() => setMenu(true)} hitSlop={8}>
          <Text style={estilos.botonMenuTexto}>☰</Text>
        </Pressable>

        {(menu || verSala || verMando || verEstados) && (
          <View style={estilos.velo}>
            {verEstados ? (
              <PanelDeEstados
                fichero={partida.fichero}
                titulo={partida.huella.title}
                onCerrar={() => {
                  setVerEstados(false);
                  setMenu(false);
                }}
              />
            ) : verMando ? (
              <PanelDelMando
                onCerrar={() => {
                  setVerMando(false);
                  setMenu(false);
                }}
              />
            ) : verSala ? (
              <PanelDeSala
                sala={sala}
                semilla={semilla}
                juego={registro?.juego ?? partida.huella.title}
                onCerrar={() => {
                  setVerSala(false);
                  setMenu(false);
                }}
              />
            ) : (
              <ScrollView contentContainerStyle={estilos.menu}>
                <Boton texto="Volver al juego" principal onPress={() => setMenu(false)} />
                <Medallas medallas={lectura.medallas} topes={viva.topes} siguiente={viva.tope} />
                {opcionesDelMenu(() => setMenu(false))}
              </ScrollView>
            )}
          </View>
        )}
        {ventanas}
      </View>
    );
  }

  return (
    <View style={estilos.juego} onTouchStart={alTocarLaPantalla}>
      <StatusBar hidden={false} />
      <View style={estilos.barra}>
        <Pressable onPress={() => setMenu(m => !m)} hitSlop={10}>
          <Text style={estilos.barraBoton}>☰ Menú</Text>
        </Pressable>
        <Text style={estilos.barraTitulo} numberOfLines={1}>
          {partida.huella.title}
        </Text>
        <View style={estilos.barraDerecha}>
          <Pressable onPress={() => setVerMando(v => !v)} hitSlop={10} accessibilityLabel="Mando físico">
            <Text style={estilos.barraBoton}>🎮</Text>
          </Pressable>
          <Pressable onPress={() => setVerSala(v => !v)} hitSlop={10}>
            <Text style={estilos.barraBoton}>{conCompanero ? `Sala · ${nombreDelOtro}` : 'Sala'}</Text>
          </Pressable>
        </View>
      </View>

      {/* La consola, o la del companero si se esta mirando la suya. */}
      <View style={estilos.consola}>
        {consola}
        {conCompanero && (
          <Pressable style={estilos.cambiar} onPress={() => setVerLoSuyo(v => !v)}>
            <Text style={estilos.barraBoton}>{mirandoLoSuyo ? 'Mi partida' : 'Su partida'}</Text>
          </Pressable>
        )}
      </View>

      {menu && !verEstados ? (
        <ScrollView contentContainerStyle={estilos.panel}>
          {opcionesDelMenu(() => setMenu(false))}
          <Boton texto="Volver al juego" principal onPress={() => setMenu(false)} />
        </ScrollView>
      ) : verEstados ? (
        <PanelDeEstados fichero={partida.fichero} titulo={partida.huella.title} onCerrar={() => setVerEstados(false)} />
      ) : verMando ? (
        <PanelDelMando onCerrar={() => setVerMando(false)} />
      ) : verSala ? (
        <PanelDeSala
          sala={sala}
          semilla={semilla}
          juego={registro?.juego ?? partida.huella.title}
          onCerrar={() => setVerSala(false)}
        />
      ) : (
        <>
          <Medallas medallas={lectura.medallas} topes={viva.topes} siguiente={viva.tope} />
          <Equipo
            titulo="Tu equipo · toca uno para cambiarle el mote"
            equipo={equipo}
            especies={partida.especies}
            caidosDelOtro={viva.caidosSuyos}
            onElegir={setMoteDe}
            {...marcasPropias}
          />
          {conCompanero && (
            <Equipo
              titulo={`Equipo de ${nombreDelOtro}`}
              equipo={sala.estado.equipoCompanero}
              especies={partida.especies}
              caidosDelOtro={viva.caidosMios}
              tiposRepetidos={viva.tiposRepetidos}
            />
          )}
          {!conMandoFisico && <Mando />}
        </>
      )}
      {ventanas}
    </View>
  );
};

const estilos = StyleSheet.create({
  raiz: {flex: 1, backgroundColor: '#0b0f14'},
  inicio: {padding: 20, gap: 12},
  marca: {color: '#ffcb05', fontSize: 30, fontWeight: '800', marginTop: 24},
  nota: {color: '#8b9aab', fontSize: 14, lineHeight: 20},
  seccion: {color: '#e8eef5', fontSize: 16, fontWeight: '700', marginTop: 12},
  error: {color: '#ee1515', fontSize: 14},
  tarjeta: {padding: 14, gap: 6, borderRadius: 14, borderWidth: 1, borderColor: '#26313d', backgroundColor: '#131a22'},
  tarjetaTitulo: {color: '#e8eef5', fontSize: 16, fontWeight: '700'},
  fila: {flexDirection: 'row', gap: 8},
  mitad: {flex: 1},
  juego: {flex: 1},
  barra: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 44},
  barraDerecha: {flexDirection: 'row', alignItems: 'center', gap: 16},
  barraTitulo: {color: '#e8eef5', fontWeight: '700', flexShrink: 1, marginHorizontal: 8},
  barraBoton: {color: '#ffcb05', fontWeight: '700', fontSize: 14},
  // 3:2, la proporcion de la GBA. El sistema escala los pixeles.
  consola: {width: '100%', aspectRatio: 3 / 2, backgroundColor: '#000'},
  pantalla: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  oculta: {opacity: 0},
  sinVideo: {alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: '#000'},
  cambiar: {position: 'absolute', right: 8, bottom: 8, padding: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)'},
  tumbado: {flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center'},
  consolaTumbada: {backgroundColor: '#000'},
  tiraArriba: {position: 'absolute', top: 0, alignSelf: 'center', maxWidth: '62%'},
  botonMenu: {
    position: 'absolute',
    bottom: '14%',
    alignSelf: 'center',
    width: 40,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(28, 37, 48, 0.7)',
  },
  botonMenuTexto: {color: '#e8eef5', fontSize: 18},
  velo: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11, 15, 20, 0.92)'},
  menu: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: '25%', paddingVertical: 16, gap: 10},
  panel: {padding: 16, gap: 10},
});

export default App;

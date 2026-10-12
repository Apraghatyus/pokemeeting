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

import {useEffect, useState} from 'react';
import {
  AppState,
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
import {registrar, todasLasPartidas} from '../apps/web/src/core/partidas';
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

const App = () => {
  const [partida, setPartida] = useState<DatosDePartida | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  /** Una ROM abierta que todavia no tiene reglas elegidas. */
  const [eligiendo, setEligiendo] = useState<DatosDePartida | null>(null);

  const abrir = async (rom: Rom) => {
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
      if (todasLasPartidas().some(p => p.fichero === rom.nombre)) setPartida(datos);
      else setEligiendo(datos);
    } catch (error) {
      setProblema(error instanceof Error ? error.message : String(error));
    } finally {
      setCargando(false);
    }
  };

  const apuntar = (datos: DatosDePartida, dificultad: Dificultad) => {
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
    setEligiendo(null);
    setPartida(datos);
  };

  return (
    <SafeAreaView style={estilos.raiz}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f14" />
      {partida ? (
        <Juego
          partida={partida}
          onSalir={() => {
            Mgba.cerrar();
            setPartida(null);
          }}
        />
      ) : eligiendo ? (
        <ElegirDificultad onElegir={d => apuntar(eligiendo, d)} />
      ) : (
        <Inicio onAbrir={rom => void abrir(rom)} cargando={cargando} problema={problema} />
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

const Inicio = ({
  onAbrir,
  cargando,
  problema,
}: {
  onAbrir: (rom: Rom) => void;
  cargando: boolean;
  problema: string | null;
}) => {
  const [roms, setRoms] = useState<Rom[]>([]);
  useEffect(() => {
    void Mgba.romsGuardadas().then(setRoms);
  }, []);

  return (
    <ScrollView contentContainerStyle={estilos.inicio}>
      <Text style={estilos.marca}>Pokemeeting</Text>
      <Text style={estilos.nota}>
        Elige tu ROM. Se queda en este telefono: no se sube a ningun sitio ni se le manda a nadie.
      </Text>
      <Boton
        texto={cargando ? 'Abriendo…' : 'Elegir una ROM'}
        principal
        onPress={async () => {
          const rom = await Mgba.elegirRom();
          if (rom) onAbrir(rom);
        }}
      />
      {problema && <Text style={estilos.error}>{problema}</Text>}
      {roms.length > 0 && <Text style={estilos.seccion}>Tus juegos</Text>}
      {roms.map(rom => (
        <Boton key={rom.ruta} texto={rom.nombre} onPress={() => onAbrir(rom)} />
      ))}
    </ScrollView>
  );
};

const Juego = ({partida, onSalir}: {partida: DatosDePartida; onSalir: () => void}) => {
  const viva = usePartidaViva(partida, false);
  const {sala, lectura, intercambio} = viva;
  const {equipo} = lectura;
  const [verSala, setVerSala] = useState(false);
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
      <Boton texto="Mando físico" onPress={() => setVerMando(true)} />
      <Boton texto="Salir del juego" onPress={onSalir} />
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

        {(menu || verSala || verMando) && (
          <View style={estilos.velo}>
            {verMando ? (
              <PanelDelMando
                onCerrar={() => {
                  setVerMando(false);
                  setMenu(false);
                }}
              />
            ) : verSala ? (
              <PanelDeSala
                sala={sala}
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

      {menu ? (
        <ScrollView contentContainerStyle={estilos.panel}>
          {opcionesDelMenu(() => setMenu(false))}
          <Boton texto="Volver al juego" principal onPress={() => setMenu(false)} />
        </ScrollView>
      ) : verMando ? (
        <PanelDelMando onCerrar={() => setVerMando(false)} />
      ) : verSala ? (
        <PanelDeSala sala={sala} onCerrar={() => setVerSala(false)} />
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

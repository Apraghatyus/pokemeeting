// Pokemeeting para Android.
//
// Dos pantallas: elegir la ROM y jugar. Jugando se ve la consola, el equipo de
// los dos y el mando, y desde ahi se entra en una sala de la web.
//
// LA ROM NO SALE DEL TELEFONO. Se copia a la carpeta privada de la app para
// poder abrirla y de ahi no se mueve: por la sala viaja su huella -titulo,
// codigo y CRC-, igual que en la web.

import {useEffect, useMemo, useState} from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {RTCView} from 'react-native-webrtc';
import type {RomFingerprint} from '@emupoke/protocol';
import {motesDebilitados} from '@emupoke/pokemon';
import {readRomHeader} from '../apps/web/src/core/romHeader';
import {desdeBase64} from './src/base64';
import {Equipo} from './src/Equipo';
import {useEquipo} from './src/equipo';
import {leerEspecies, SIN_ESPECIES, type Especies} from './src/especies';
import {Mando} from './src/Mando';
import {Mgba, Pantalla, type Rom} from './src/nativo';
import {useSala} from './src/sala';

type Partida = {rom: Rom; huella: RomFingerprint; especies: Especies};

const App = () => {
  const [partida, setPartida] = useState<Partida | null>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const abrir = async (rom: Rom) => {
    setCargando(true);
    setProblema(null);
    try {
      // La ROM entera se lee una vez: de ella salen la huella para la sala y
      // los nombres y tipos de cada especie.
      const bytes = desdeBase64(await Mgba.leerBase64(rom.ruta));
      const cabecera = readRomHeader(bytes);
      if (!(await Mgba.cargar(rom.ruta))) throw new Error('El emulador no reconoce ese fichero como un juego.');
      setPartida({
        rom,
        huella: {
          title: cabecera.title,
          gameCode: cabecera.gameCode,
          version: cabecera.version,
          crc32: cabecera.crc32,
          fileName: rom.nombre,
        },
        especies: cabecera.platform === 'gba' ? leerEspecies(bytes) : SIN_ESPECIES,
      });
    } catch (error) {
      setProblema(error instanceof Error ? error.message : String(error));
    } finally {
      setCargando(false);
    }
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
      ) : (
        <Inicio onAbrir={rom => void abrir(rom)} cargando={cargando} problema={problema} />
      )}
    </SafeAreaView>
  );
};

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

const Juego = ({partida, onSalir}: {partida: Partida; onSalir: () => void}) => {
  const {equipo, derrota} = useEquipo(true, partida.especies);
  const sala = useSala(partida.huella);
  const [verSala, setVerSala] = useState(false);
  const [verSuPantalla, setVerSuPantalla] = useState(false);

  // Mandarle el equipo al companero cada vez que cambia, y al abrirse el canal.
  const {enviarEquipo} = sala;
  useEffect(() => {
    if (equipo) enviarEquipo(equipo, derrota);
  }, [equipo, derrota, enviarEquipo, sala.estado.fase]);

  const caidosMios = useMemo(() => motesDebilitados(equipo), [equipo]);
  const caidosSuyos = useMemo(() => motesDebilitados(sala.estado.equipoCompanero), [sala.estado.equipoCompanero]);
  const conCompanero = sala.estado.fase === 'conectada';
  const suPantalla = sala.estado.pantallaCompanero;

  return (
    <View style={estilos.juego}>
      <View style={estilos.barra}>
        <Pressable onPress={onSalir} hitSlop={10}>
          <Text style={estilos.barraBoton}>‹ Salir</Text>
        </Pressable>
        <Text style={estilos.barraTitulo} numberOfLines={1}>
          {partida.huella.title}
        </Text>
        <Pressable onPress={() => setVerSala(v => !v)} hitSlop={10}>
          <Text style={estilos.barraBoton}>
            {conCompanero ? `Sala · ${sala.estado.companero ?? 'compañero'}` : 'Sala'}
          </Text>
        </Pressable>
      </View>

      {/* La consola, o la del companero si se esta mirando la suya. */}
      <View style={estilos.consola}>
        <Pantalla style={[estilos.pantalla, verSuPantalla && suPantalla ? estilos.oculta : null]} />
        {verSuPantalla && suPantalla && (
          <RTCView streamURL={suPantalla.toURL()} style={estilos.pantalla} objectFit="contain" />
        )}
        {suPantalla && (
          <Pressable style={estilos.cambiar} onPress={() => setVerSuPantalla(v => !v)}>
            <Text style={estilos.barraBoton}>{verSuPantalla ? 'Mi partida' : 'Su partida'}</Text>
          </Pressable>
        )}
      </View>

      {verSala ? (
        <PanelDeSala sala={sala} onCerrar={() => setVerSala(false)} />
      ) : (
        <>
          <Equipo titulo="Tu equipo" equipo={equipo} especies={partida.especies} caidosDelOtro={caidosSuyos} />
          {conCompanero && (
            <Equipo
              titulo={`Equipo de ${sala.estado.companero ?? 'tu compañero'}`}
              equipo={sala.estado.equipoCompanero}
              especies={partida.especies}
              caidosDelOtro={caidosMios}
            />
          )}
          <Mando />
        </>
      )}
    </View>
  );
};

const PanelDeSala = ({sala, onCerrar}: {sala: ReturnType<typeof useSala>; onCerrar: () => void}) => {
  const [codigo, setCodigo] = useState('');
  const [clave, setClave] = useState('');
  const [apodo, setApodo] = useState('');
  const {estado} = sala;

  if (estado.fase !== 'sin-sala') {
    return (
      <View style={estilos.panel}>
        <Text style={estilos.seccion}>
          {estado.fase === 'conectada'
            ? `Jugando con ${estado.companero ?? 'tu compañero'}`
            : estado.fase === 'perdida'
              ? 'Se perdio la conexion'
              : 'Esperando a tu compañero…'}
        </Text>
        {estado.codigo && <Text style={estilos.codigo}>{estado.codigo}</Text>}
        <Text style={estilos.nota}>
          Tu compañero entra con este codigo y la contraseña, desde otro telefono o desde
          emupoke.aguaquim.com.
        </Text>
        <Boton texto="Volver al juego" principal onPress={onCerrar} />
        <Boton texto="Salir de la sala" onPress={sala.salir} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.panel}>
      <TextInput style={estilos.campo} placeholder="Tu apodo" placeholderTextColor="#8b9aab" value={apodo} onChangeText={setApodo} maxLength={17} />
      <TextInput style={estilos.campo} placeholder="Contraseña de la sala" placeholderTextColor="#8b9aab" value={clave} onChangeText={setClave} secureTextEntry />
      <Boton texto="Crear sala" principal onPress={() => clave && sala.crear(clave, apodo || null)} />
      <Text style={estilos.seccion}>O entra en una</Text>
      <TextInput style={estilos.campo} placeholder="Codigo (6 letras)" placeholderTextColor="#8b9aab" value={codigo} onChangeText={setCodigo} autoCapitalize="characters" maxLength={6} />
      <Boton texto="Entrar" onPress={() => codigo && clave && sala.unirse(codigo, clave, apodo || null)} />
      {estado.error && <Text style={estilos.error}>{estado.error}</Text>}
      <Boton texto="Volver al juego" onPress={onCerrar} />
    </ScrollView>
  );
};

const Boton = ({texto, onPress, principal}: {texto: string; onPress: () => void; principal?: boolean}) => (
  <Pressable onPress={onPress} style={({pressed}) => [estilos.boton, principal && estilos.principal, pressed && {opacity: 0.7}]}>
    <Text style={[estilos.botonTexto, principal && estilos.principalTexto]}>{texto}</Text>
  </Pressable>
);

const estilos = StyleSheet.create({
  raiz: {flex: 1, backgroundColor: '#0b0f14'},
  inicio: {padding: 20, gap: 12},
  marca: {color: '#ffcb05', fontSize: 30, fontWeight: '800', marginTop: 24},
  nota: {color: '#8b9aab', fontSize: 14, lineHeight: 20},
  seccion: {color: '#e8eef5', fontSize: 16, fontWeight: '700', marginTop: 12},
  error: {color: '#ee1515', fontSize: 14},
  boton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#1c2530',
    borderWidth: 1,
    borderColor: '#26313d',
  },
  principal: {backgroundColor: '#ffcb05', borderColor: '#ffcb05'},
  botonTexto: {color: '#e8eef5', fontSize: 15, fontWeight: '600'},
  principalTexto: {color: '#2a2a2a'},
  juego: {flex: 1},
  barra: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 44},
  barraTitulo: {color: '#e8eef5', fontWeight: '700', flexShrink: 1, marginHorizontal: 8},
  barraBoton: {color: '#ffcb05', fontWeight: '700', fontSize: 14},
  // 3:2, la proporcion de la GBA. El sistema escala los pixeles.
  consola: {width: '100%', aspectRatio: 3 / 2, backgroundColor: '#000'},
  pantalla: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  oculta: {opacity: 0},
  cambiar: {position: 'absolute', right: 8, bottom: 8, padding: 8, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.6)'},
  panel: {padding: 16, gap: 10},
  codigo: {color: '#ffcb05', fontSize: 34, fontWeight: '800', letterSpacing: 4},
  campo: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26313d',
    backgroundColor: '#131a22',
    color: '#e8eef5',
    fontSize: 15,
  },
});

export default App;

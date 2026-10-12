// La sala: crearla o entrar en una, y una vez dentro, la voz, la pantalla y
// la reconexion. Igual que "Jugar con un amigo" en la web.

import {useState} from 'react';
import {ScrollView, Share, StyleSheet, Text, TextInput} from 'react-native';
import {apodoGuardado, guardarApodo} from '../../apps/web/src/core/apodo';
import {enlaceDeInvitacion} from './config';
import {Boton} from './Boton';
import {MAX_REINTENTOS, type useSala} from './sala';

export const PanelDeSala = ({
  sala,
  semilla,
  juego,
  onCerrar,
}: {
  sala: ReturnType<typeof useSala>;
  /** La semilla de la partida: con ella quien entre rehace el mismo mundo. */
  semilla: string | null;
  juego: string | null;
  onCerrar: () => void;
}) => {
  const [codigo, setCodigo] = useState('');
  const [clave, setClave] = useState('');
  const [apodo, setApodo] = useState(() => apodoGuardado() ?? '');
  const {estado} = sala;

  if (estado.fase !== 'sin-sala') {
    const {reconexion} = estado;
    const nombre = estado.companero ?? 'tu compañero';
    return (
      <ScrollView contentContainerStyle={estilos.panel}>
        <Text style={estilos.seccion}>
          {estado.fase === 'conectada'
            ? `Jugando con ${nombre}`
            : reconexion.intentando
              ? `Reconectando… (intento ${reconexion.intentos} de ${MAX_REINTENTOS})`
              : estado.fase === 'perdida'
                ? 'Se perdio la conexion'
                : estado.fase === 'conectando'
                  ? 'Conectando…'
                  : 'Esperando a tu compañero…'}
        </Text>
        {reconexion.agotada && (
          <>
            <Text style={estilos.error}>No se pudo volver a entrar. Cuando vuelva la red, reintenta.</Text>
            <Boton texto="Reintentar ahora" principal onPress={sala.reintentar} />
          </>
        )}
        {estado.codigo && <Text style={estilos.codigo}>{estado.codigo}</Text>}
        {estado.codigo && clave !== '' && (
          <Boton
            texto="Compartir invitación"
            principal={estado.fase !== 'conectada'}
            onPress={() =>
              void Share.share({
                message: [
                  `Juega conmigo: ${enlaceDeInvitacion(estado.codigo!, clave)}`,
                  `Sala: ${estado.codigo}`,
                  `Contraseña: ${clave}`,
                  `Necesitas tu propia copia de ${juego ?? 'el juego'}: el enlace no la lleva.`,
                ].join('\n'),
              })
            }
          />
        )}
        <Text style={estilos.nota}>
          Tu compañero entra con este codigo y la contraseña, desde otro telefono o desde
          emupoke.aguaquim.com.
        </Text>

        {/* La voz y la pantalla, como en la web. */}
        <Boton
          texto={
            estado.micro === 'encendido'
              ? '🎤 Apagar el micrófono'
              : estado.micro === 'pidiendo'
                ? '🎤 Pidiendo permiso…'
                : '🎤 Encender el micrófono'
          }
          principal={estado.micro !== 'encendido'}
          onPress={() => void sala.cambiarMicro()}
        />
        {estado.micro === 'denegado' && (
          <Text style={estilos.error}>
            Sin permiso para el micrófono. Puedes darlo en los ajustes de Android, en Pokemeeting.
          </Text>
        )}
        <Boton
          texto={estado.companeroSilenciado ? `🔈 Volver a oír a ${nombre}` : `🔇 Silenciar a ${nombre}`}
          onPress={sala.cambiarSilencio}
        />
        <Boton
          texto={estado.enviandoVideo ? 'Dejar de mandar mi pantalla' : 'Volver a mandar mi pantalla'}
          onPress={() => sala.cambiarEnvioDeVideo(!estado.enviandoVideo)}
        />
        {!estado.enviandoVideo && (
          <Text style={estilos.nota}>
            Tu compañero no ve tu partida, pero sigue viendo tu equipo y oyéndote. Útil si el móvil va justo.
          </Text>
        )}

        <Boton texto="Volver al juego" onPress={onCerrar} />
        <Boton texto="Salir de la sala" onPress={sala.salir} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.panel}>
      <TextInput style={estilos.campo} placeholder="Tu apodo" placeholderTextColor="#8b9aab" value={apodo} onChangeText={setApodo} maxLength={17} />
      <TextInput style={estilos.campo} placeholder="Contraseña de la sala" placeholderTextColor="#8b9aab" value={clave} onChangeText={setClave} secureTextEntry />
      <Boton texto="Crear sala" principal onPress={() => {
          if (!clave) return;
          if (apodo) guardarApodo(apodo);
          sala.crear(clave, apodo || null, semilla);
        }} />
      <Text style={estilos.seccion}>O entra en una</Text>
      <TextInput style={estilos.campo} placeholder="Codigo (6 letras)" placeholderTextColor="#8b9aab" value={codigo} onChangeText={setCodigo} autoCapitalize="characters" maxLength={6} />
      <Boton texto="Entrar" onPress={() => {
          if (!codigo || !clave) return;
          if (apodo) guardarApodo(apodo);
          sala.unirse(codigo, clave, apodo || null);
        }} />
      {estado.error && <Text style={estilos.error}>{estado.error}</Text>}
      <Boton texto="Volver al juego" onPress={onCerrar} />
    </ScrollView>
  );
};

const estilos = StyleSheet.create({
  panel: {padding: 16, gap: 10},
  seccion: {color: '#e8eef5', fontSize: 16, fontWeight: '700', marginTop: 12},
  nota: {color: '#8b9aab', fontSize: 14, lineHeight: 20},
  error: {color: '#ee1515', fontSize: 14},
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

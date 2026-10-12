// La cuenta en la app: la misma que en la web y el mismo servicio.
//
// Con sesion, el historial y las partidas se suben solos al entrar y al
// terminar una partida, y cuentan para el ranking. Sin ella se juega igual.

import {useState} from 'react';
import {Linking, StyleSheet, Text, TextInput, View} from 'react-native';
import {subirLoDeAqui} from '../../apps/web/src/core/cuenta';
import type {EstadoDeCuenta} from '../../apps/web/src/core/useCuenta';
import {Boton} from './Boton';
import {ORIGEN} from './config';

export const PanelDeCuenta = ({cuenta}: {cuenta: EstadoDeCuenta}) => {
  const [modo, setModo] = useState<'cerrado' | 'entrar' | 'crear'>('cerrado');
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  const [apodo, setApodo] = useState('');
  const [problema, setProblema] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const hacer = async (accion: () => Promise<void>) => {
    setOcupado(true);
    setProblema(null);
    try {
      await accion();
      setModo('cerrado');
      setClave('');
    } catch (error) {
      setProblema(error instanceof Error ? error.message : String(error));
    } finally {
      setOcupado(false);
    }
  };

  const verRanking = () => void Linking.openURL(`${ORIGEN}/#ranking`);

  if (cuenta.comprobando) return null;

  if (cuenta.cuenta) {
    const {apodo: suApodo, tag} = cuenta.cuenta;
    return (
      <View style={estilos.caja}>
        <Text style={estilos.titulo}>
          {suApodo}
          <Text style={estilos.tag}>#{tag}</Text>
        </Text>
        <Text style={estilos.nota}>
          {cuenta.subido
            ? `Subido: ${cuenta.subido.partidas} partidas y ${cuenta.subido.finales} finales nuevos.`
            : 'Tus partidas y finales se suben solos y cuentan para el ranking.'}
        </Text>
        {aviso && <Text style={estilos.nota}>{aviso}</Text>}
        <View style={estilos.fila}>
          <View style={estilos.mitad}>
            <Boton
              texto="Subir ahora"
              desactivado={ocupado}
              onPress={() =>
                void hacer(async () => {
                  const hecho = await subirLoDeAqui();
                  setAviso(`Subido: ${hecho.partidas.nuevas} partidas y ${hecho.finales.nuevos} finales nuevos.`);
                })
              }
            />
          </View>
          <View style={estilos.mitad}>
            <Boton texto="Ranking" onPress={verRanking} />
          </View>
        </View>
        {problema && <Text style={estilos.error}>{problema}</Text>}
        <Boton texto="Cerrar sesión" onPress={() => void hacer(cuenta.salir)} />
      </View>
    );
  }

  if (modo === 'cerrado') {
    return (
      <View style={estilos.caja}>
        <Text style={estilos.nota}>
          Sin cuenta se juega igual. Con ella tus partidas cuentan para el ranking y las ves en la web.
        </Text>
        <View style={estilos.fila}>
          <View style={estilos.mitad}>
            <Boton texto="Iniciar sesión" onPress={() => setModo('entrar')} />
          </View>
          <View style={estilos.mitad}>
            <Boton texto="Crear cuenta" onPress={() => setModo('crear')} />
          </View>
        </View>
        <Boton texto="Ver el ranking" onPress={verRanking} />
      </View>
    );
  }

  return (
    <View style={estilos.caja}>
      <Text style={estilos.titulo}>{modo === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
      <TextInput
        style={estilos.campo}
        placeholder="Usuario"
        placeholderTextColor="#8b9aab"
        value={usuario}
        onChangeText={setUsuario}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={estilos.campo}
        placeholder="Contraseña"
        placeholderTextColor="#8b9aab"
        value={clave}
        onChangeText={setClave}
        secureTextEntry
      />
      {modo === 'crear' && (
        <TextInput
          style={estilos.campo}
          placeholder="Apodo (como te ven los demás)"
          placeholderTextColor="#8b9aab"
          value={apodo}
          onChangeText={setApodo}
          maxLength={17}
        />
      )}
      {problema && <Text style={estilos.error}>{problema}</Text>}
      <Boton
        texto={ocupado ? 'Un momento…' : modo === 'entrar' ? 'Entrar' : 'Crear'}
        principal
        desactivado={ocupado || !usuario || !clave}
        onPress={() =>
          void hacer(() =>
            modo === 'entrar' ? cuenta.entrar(usuario.trim(), clave) : cuenta.registrar(usuario.trim(), clave, apodo.trim() || null),
          )
        }
      />
      <Boton
        texto="Cancelar"
        onPress={() => {
          setModo('cerrado');
          setProblema(null);
        }}
      />
    </View>
  );
};

const estilos = StyleSheet.create({
  caja: {padding: 14, gap: 8, borderRadius: 14, borderWidth: 1, borderColor: '#26313d', backgroundColor: '#131a22'},
  titulo: {color: '#e8eef5', fontSize: 17, fontWeight: '800'},
  tag: {color: '#8b9aab', fontWeight: '400'},
  nota: {color: '#8b9aab', fontSize: 14, lineHeight: 20},
  error: {color: '#ee1515', fontSize: 14},
  fila: {flexDirection: 'row', gap: 8},
  mitad: {flex: 1},
  campo: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26313d',
    backgroundColor: '#0b0f14',
    color: '#e8eef5',
    fontSize: 15,
  },
});

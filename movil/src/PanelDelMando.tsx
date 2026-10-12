// Reasignar los botones del mando fisico, como en Ajustes de la web.
//
// Se toca la fila y luego se pulsa el boton del mando. El mapa lo guarda el
// propio emulador en el telefono, y el cambio vale al momento.

import {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {ENTRADAS, eventosDelEmulador, Mgba} from './nativo';

export const PanelDelMando = ({onCerrar}: {onCerrar: () => void}) => {
  const [mapa, setMapa] = useState<Record<string, string>>({});
  const [esperando, setEsperando] = useState<string | null>(null);

  useEffect(() => {
    void Mgba.mandoFisico().then(setMapa);
    const sub = eventosDelEmulador.addListener('mandoAprendido', () => {
      setEsperando(null);
      void Mgba.mandoFisico().then(setMapa);
    });
    return () => {
      sub.remove();
      // Al salir sin pulsar nada, se deja de esperar.
      Mgba.aprenderBoton(null);
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={estilos.panel}>
      <Text style={estilos.titulo}>Mando físico</Text>
      <Text style={estilos.nota}>
        Conéctalo por Bluetooth o USB y funciona solo: el botón de la derecha es A y el de abajo B,
        como en la consola. Para cambiar uno, toca su fila y pulsa el botón del mando.
      </Text>
      {ENTRADAS.map(({entrada, etiqueta}) => (
        <Pressable
          key={entrada}
          style={[estilos.fila, esperando === entrada && estilos.esperando]}
          onPress={() => {
            const siguiente = esperando === entrada ? null : entrada;
            setEsperando(siguiente);
            Mgba.aprenderBoton(siguiente);
          }}>
          <Text style={estilos.que}>{etiqueta}</Text>
          <Text style={estilos.boton}>{esperando === entrada ? 'Pulsa…' : mapa[entrada] || '—'}</Text>
        </Pressable>
      ))}
      <View style={estilos.acciones}>
        <Pressable
          style={estilos.accion}
          onPress={() => {
            Mgba.restaurarMando();
            setEsperando(null);
            void Mgba.mandoFisico().then(setMapa);
          }}>
          <Text style={estilos.accionTexto}>Restablecer</Text>
        </Pressable>
        <Pressable style={[estilos.accion, estilos.principal]} onPress={onCerrar}>
          <Text style={[estilos.accionTexto, estilos.principalTexto]}>Listo</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

const estilos = StyleSheet.create({
  panel: {padding: 16, gap: 8},
  titulo: {color: '#e8eef5', fontSize: 18, fontWeight: '700'},
  nota: {color: '#8b9aab', fontSize: 13, lineHeight: 19, marginBottom: 6},
  fila: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#1c2530',
    borderWidth: 1,
    borderColor: '#26313d',
  },
  esperando: {borderColor: '#ffcb05'},
  que: {color: '#e8eef5', fontSize: 15, fontWeight: '600'},
  boton: {color: '#ffcb05', fontSize: 14},
  acciones: {flexDirection: 'row', gap: 10, marginTop: 8},
  accion: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#1c2530',
    borderWidth: 1,
    borderColor: '#26313d',
  },
  principal: {backgroundColor: '#ffcb05', borderColor: '#ffcb05'},
  accionTexto: {color: '#e8eef5', fontWeight: '600'},
  principalTexto: {color: '#2a2a2a'},
});

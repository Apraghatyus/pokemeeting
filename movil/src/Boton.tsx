// El boton de toda la app: amarillo el principal, oscuro el resto.

import {Pressable, StyleSheet, Text} from 'react-native';

export const Boton = ({
  texto,
  onPress,
  principal,
  desactivado,
}: {
  texto: string;
  onPress: () => void;
  principal?: boolean;
  desactivado?: boolean;
}) => (
  <Pressable
    onPress={desactivado ? undefined : onPress}
    style={({pressed}) => [
      estilos.boton,
      principal && estilos.principal,
      (pressed || desactivado) && {opacity: desactivado ? 0.4 : 0.7},
    ]}>
    <Text style={[estilos.texto, principal && estilos.principalTexto]}>{texto}</Text>
  </Pressable>
);

const estilos = StyleSheet.create({
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
  texto: {color: '#e8eef5', fontSize: 15, fontWeight: '600'},
  principalTexto: {color: '#2a2a2a'},
});

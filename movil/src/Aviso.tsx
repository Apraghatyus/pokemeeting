// El aviso de una regla: lo que se acaba de deshacer y por que, o algo que
// conviene saber (el primer encuentro de una zona). Se va solo.

import {useEffect} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import type {Aviso as DatosDelAviso} from './partidaViva';

export const Aviso = ({aviso, onCerrar}: {aviso: DatosDelAviso | null; onCerrar: () => void}) => {
  useEffect(() => {
    if (!aviso) return;
    const quitar = setTimeout(onCerrar, aviso.tipo === 'error' ? 9000 : 6000);
    return () => clearTimeout(quitar);
  }, [aviso, onCerrar]);

  if (!aviso) return null;
  const error = aviso.tipo === 'error';
  return (
    <View style={[estilos.aviso, error ? estilos.error : estilos.info]} accessibilityRole="alert">
      <Text style={[estilos.marca, error ? estilos.marcaError : estilos.marcaInfo]}>{error ? '!' : 'i'}</Text>
      <Text style={estilos.texto}>{aviso.texto}</Text>
      <Pressable onPress={onCerrar} hitSlop={10}>
        <Text style={estilos.cerrar}>OK</Text>
      </Pressable>
    </View>
  );
};

const estilos = StyleSheet.create({
  aviso: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#1c2530',
    zIndex: 50,
    elevation: 12,
  },
  error: {borderColor: '#ee1515'},
  info: {borderColor: '#ffcb05'},
  marca: {
    width: 26,
    height: 26,
    borderRadius: 13,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '800',
    overflow: 'hidden',
  },
  marcaError: {backgroundColor: '#ee1515', color: '#fff'},
  marcaInfo: {backgroundColor: '#ffcb05', color: '#2a2a2a'},
  texto: {flex: 1, color: '#e8eef5', fontSize: 13, lineHeight: 18},
  cerrar: {color: '#8b9aab', fontWeight: '700'},
});

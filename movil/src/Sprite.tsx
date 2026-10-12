// El dibujo de un Pokemon, de la misma fuente que la web (apps/web/src/ui/Sprite.tsx).
//
// No va dentro de la app: se pide a PokeAPI y el sistema lo cachea. Sin
// internet cada uno tiene su plan B, las iniciales, porque sin internet tambien
// se juega.

import {useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';

/** Primero como en el juego (Rojo Fuego), si no la general. */
const candidatas = (nacional: number): string[] =>
  nacional > 0
    ? [
        `${BASE}/pokemon/versions/generation-iii/firered-leafgreen/${nacional}.png`,
        `${BASE}/pokemon/${nacional}.png`,
      ]
    : [];

export const Sprite = ({nacional, nombre, tamaño}: {nacional: number; nombre: string; tamaño: number}) => {
  const [intento, setIntento] = useState(0);
  const urls = candidatas(nacional);
  const caja = {width: tamaño, height: tamaño};

  if (intento >= urls.length) {
    return (
      <View style={[estilos.respaldo, caja]}>
        <Text style={estilos.iniciales}>{nombre.slice(0, 2).toUpperCase()}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{uri: urls[intento]}}
      style={caja}
      // Pixeles grandes y nitidos, como en la consola.
      resizeMethod="scale"
      onError={() => setIntento(n => n + 1)}
    />
  );
};

const estilos = StyleSheet.create({
  respaldo: {alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#26313d'},
  iniciales: {color: '#e8eef5', fontSize: 11, fontWeight: '700'},
});

// Las ocho medallas, con su imagen, y el tope de nivel del lider que toca.
// Igual que la tira de la web, en una fila.

import {useState} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import type {Medallas as DatosDeMedallas, TopeDeNivel} from '@emupoke/pokemon';

const IMAGEN = (n: number) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/badges/${n}.png`;

const Medalla = ({numero, conseguida, tope}: {numero: number; conseguida: boolean; tope: number | null}) => {
  const [fallo, setFallo] = useState(false);
  return (
    <View style={estilos.medalla}>
      {fallo ? (
        <View style={[estilos.marca, conseguida && estilos.marcaConseguida]} />
      ) : (
        <Image
          source={{uri: IMAGEN(numero)}}
          style={[estilos.imagen, !conseguida && estilos.apagada]}
          onError={() => setFallo(true)}
        />
      )}
      {tope !== null && <Text style={estilos.tope}>{tope}</Text>}
    </View>
  );
};

export const Medallas = ({
  medallas,
  topes,
  siguiente,
}: {
  medallas: DatosDeMedallas;
  topes: number[] | null;
  siguiente: TopeDeNivel | null;
}) => {
  if (medallas.cuantas === null) return null;
  return (
    <View style={estilos.bloque}>
      <View style={estilos.fila}>
        {Array.from({length: 8}, (_, i) => (
          <Medalla key={i} numero={i + 1} conseguida={medallas.conseguidas[i] === true} tope={topes?.[i] ?? null} />
        ))}
      </View>
      {siguiente && (
        <Text style={estilos.nota}>
          Siguiente: {siguiente.lider} · tope Nv.{siguiente.nivel}
        </Text>
      )}
    </View>
  );
};

const estilos = StyleSheet.create({
  bloque: {paddingHorizontal: 12, paddingVertical: 4},
  fila: {flexDirection: 'row', justifyContent: 'space-between'},
  medalla: {alignItems: 'center', width: 36},
  imagen: {width: 24, height: 24},
  apagada: {opacity: 0.25},
  marca: {width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: '#26313d', margin: 4},
  marcaConseguida: {backgroundColor: '#ffcb05', borderColor: '#ffcb05'},
  tope: {color: '#8b9aab', fontSize: 9},
  nota: {color: '#8b9aab', fontSize: 11, marginTop: 2},
});

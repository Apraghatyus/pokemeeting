// El mando tactil.
//
// UNA SOLA SUPERFICIE Y NO UN BOTON POR TECLA, y es lo que lo hace jugable: el
// sistema de toques de React Native solo deja un "responder" a la vez, asi que
// con botones sueltos no se puede mantener la cruceta y pulsar A al mismo
// tiempo, que es como se juega a cualquier cosa. Aqui se mira cada dedo que
// toca, se averigua sobre que boton esta y se manda el conjunto de una vez.
//
// La cruceta deja las diagonales: un dedo entre arriba y derecha pulsa los dos.

import {useRef, useState} from 'react';
import {StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent} from 'react-native';
import {BOTON, Mgba} from './nativo';

type Zona = {bits: number; x: number; y: number; ancho: number; alto: number};

/**
 * Donde esta cada cosa, en fracciones del mando: asi vale para cualquier pantalla.
 *
 * En vertical el mando tiene su propia franja bajo la partida. En horizontal
 * ocupa la pantalla entera y flota por encima, como en la web: la cruceta abajo
 * a la izquierda y A y B abajo a la derecha, que es donde caen los pulgares al
 * sujetar el telefono tumbado, y L y R en las esquinas de arriba.
 */
const ZONAS = (ancho: number, alto: number, horizontal: boolean): Zona[] => {
  const cruz = horizontal ? Math.min(alto * 0.46, ancho * 0.22) : Math.min(ancho * 0.42, alto * 0.8);
  const cx = horizontal ? 12 : ancho * 0.05;
  const cy = horizontal ? alto - cruz - 10 : (alto - cruz) / 2 + alto * 0.06;
  const tercio = cruz / 3;
  const boton = horizontal ? cruz * 0.42 : Math.min(ancho * 0.18, alto * 0.36);
  const pequeño = horizontal
    ? {ancho: ancho * 0.09, alto: alto * 0.1}
    : {ancho: ancho * 0.16, alto: alto * 0.14};
  const hombro = horizontal ? {ancho: ancho * 0.16, alto: alto * 0.13} : {ancho: ancho * 0.28, alto: alto * 0.16};
  const derecha = ancho - 12;
  return [
    // La cruceta en tres por tres: las esquinas son las diagonales.
    ...[
      [BOTON.ARRIBA | BOTON.IZQUIERDA, BOTON.ARRIBA, BOTON.ARRIBA | BOTON.DERECHA],
      [BOTON.IZQUIERDA, 0, BOTON.DERECHA],
      [BOTON.ABAJO | BOTON.IZQUIERDA, BOTON.ABAJO, BOTON.ABAJO | BOTON.DERECHA],
    ].flatMap((fila, f) =>
      fila.map((bits, c) => ({bits, x: cx + c * tercio, y: cy + f * tercio, ancho: tercio, alto: tercio})),
    ),
    horizontal
      ? {bits: BOTON.A, x: derecha - boton, y: alto - boton * 2.15, ancho: boton, alto: boton}
      : {bits: BOTON.A, x: ancho * 0.95 - boton, y: alto * 0.28, ancho: boton, alto: boton},
    horizontal
      ? {bits: BOTON.B, x: derecha - boton * 2.1, y: alto - boton * 1.25, ancho: boton, alto: boton}
      : {bits: BOTON.B, x: ancho * 0.95 - boton * 2.1, y: alto * 0.48, ancho: boton, alto: boton},
    {bits: BOTON.L, x: horizontal ? 12 : 0, y: horizontal ? 8 : 0, ...hombro},
    {bits: BOTON.R, x: ancho - hombro.ancho - (horizontal ? 12 : 0), y: horizontal ? 8 : 0, ...hombro},
    {bits: BOTON.SELECT, x: ancho * 0.5 - pequeño.ancho - 6, y: alto - pequeño.alto - 8, ...pequeño},
    {bits: BOTON.START, x: ancho * 0.5 + 6, y: alto - pequeño.alto - 8, ...pequeño},
  ];
};

const ETIQUETA: Record<number, string> = {
  [BOTON.A]: 'A',
  [BOTON.B]: 'B',
  [BOTON.L]: 'L',
  [BOTON.R]: 'R',
  [BOTON.SELECT]: 'SELECT',
  [BOTON.START]: 'START',
  [BOTON.ARRIBA]: '▲',
  [BOTON.ABAJO]: '▼',
  [BOTON.IZQUIERDA]: '◀',
  [BOTON.DERECHA]: '▶',
};

export const Mando = ({horizontal = false}: {horizontal?: boolean}) => {
  const [tamaño, setTamaño] = useState({ancho: 0, alto: 0});
  const [pulsados, setPulsados] = useState(0);
  const ultimo = useRef(0);
  const zonas = ZONAS(tamaño.ancho, tamaño.alto, horizontal);

  const alTocar = (e: GestureResponderEvent) => {
    let bits = 0;
    for (const dedo of e.nativeEvent.touches) {
      const {locationX: x, locationY: y} = dedo;
      for (const z of zonas) {
        if (x >= z.x && x <= z.x + z.ancho && y >= z.y && y <= z.y + z.alto) bits |= z.bits;
      }
    }
    // Solo cuando cambia: los toques llegan decenas de veces por segundo.
    if (bits === ultimo.current) return;
    ultimo.current = bits;
    setPulsados(bits);
    Mgba.teclas(bits);
  };

  return (
    <View
      style={horizontal ? estilos.flotante : estilos.mando}
      onLayout={(e: LayoutChangeEvent) =>
        setTamaño({ancho: e.nativeEvent.layout.width, alto: e.nativeEvent.layout.height})
      }
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={alTocar}
      onResponderMove={alTocar}
      onResponderRelease={alTocar}
      onResponderTerminate={() => {
        ultimo.current = 0;
        setPulsados(0);
        Mgba.teclas(0);
      }}>
      {/* Lo que se ve. No recibe toques: los recoge el contenedor. */}
      {zonas
        .filter(z => ETIQUETA[z.bits])
        .map(z => (
          <View
            key={z.bits}
            pointerEvents="none"
            style={[
              estilos.boton,
              z.bits === BOTON.A || z.bits === BOTON.B ? estilos.redondo : null,
              {left: z.x, top: z.y, width: z.ancho, height: z.alto},
              horizontal ? estilos.translucido : null,
              (pulsados & z.bits) === z.bits ? estilos.pulsado : null,
            ]}>
            <Text style={estilos.texto}>{ETIQUETA[z.bits]}</Text>
          </View>
        ))}
    </View>
  );
};

const estilos = StyleSheet.create({
  mando: {flex: 1, position: 'relative'},
  // Encima de la partida, de borde a borde. Lo que no es un boton no hace nada.
  flotante: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  // Se ve la partida a traves: en horizontal los botones caen encima de ella.
  translucido: {opacity: 0.7},
  boton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1c2530',
    borderColor: '#26313d',
    borderWidth: 1,
    borderRadius: 10,
  },
  redondo: {borderRadius: 999, backgroundColor: '#2a2f8a'},
  pulsado: {backgroundColor: '#ffcb05'},
  texto: {color: '#e8eef5', fontWeight: '700', fontSize: 15},
});

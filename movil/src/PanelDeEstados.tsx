// Guardar y cargar estados, y llevarse la partida a otro aparato.
//
// Los estados son como los de la web: una foto de la maquina en una de tres
// ranuras por ROM, que se quedan en el telefono. "Llevarse la partida" hace el
// mismo fichero .emupoke que exporta la web -semilla y guardado, sin la ROM-,
// asi que se puede seguir en el navegador, y al reves desde la pantalla de
// inicio ("Traer una partida").

import {useCallback, useEffect, useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {empaquetar, nombreDeFichero} from '../../apps/web/src/core/paquete';
import {nombreDePartida, semillaDePartida, todasLasPartidas} from '../../apps/web/src/core/partidas';
import {aBase64, desdeBase64} from './base64';
import {Boton} from './Boton';
import {Mgba} from './nativo';

const RANURAS = [1, 2, 3];

const hora = (ms: number) => {
  const f = new Date(ms);
  const dosCifras = (n: number) => String(n).padStart(2, '0');
  return `${f.getDate()}/${f.getMonth() + 1} ${dosCifras(f.getHours())}:${dosCifras(f.getMinutes())}`;
};

export const PanelDeEstados = ({
  fichero,
  titulo,
  onCerrar,
}: {
  fichero: string;
  titulo: string;
  onCerrar: () => void;
}) => {
  const [ocupadas, setOcupadas] = useState<Record<string, number>>({});
  const [aviso, setAviso] = useState<{texto: string; error?: boolean} | null>(null);

  const mirar = useCallback(() => void Mgba.ranuras(fichero).then(setOcupadas), [fichero]);
  useEffect(mirar, [mirar]);

  const guardar = async (n: number) => {
    const ok = await Mgba.guardarRanura(fichero, n);
    setAviso(ok ? {texto: `Estado guardado en la ranura ${n}.`} : {texto: 'No se pudo guardar el estado.', error: true});
    mirar();
  };

  const cargar = async (n: number) => {
    const ok = await Mgba.cargarRanura(fichero, n);
    setAviso(ok ? {texto: `Cargado el estado de la ranura ${n}.`} : {texto: 'Esa ranura está vacía.', error: true});
    if (ok) onCerrar();
  };

  const llevarse = async () => {
    const partida = todasLasPartidas().find(p => p.fichero === fichero);
    const semilla = partida ? semillaDePartida(partida) : null;
    if (!partida || !semilla) {
      setAviso({
        texto:
          'Esta partida no se puede llevar: solo las aleatorizadas con semilla se pueden rehacer en otro sitio. Una ROM sin aleatorizar se sigue con su .sav.',
        error: true,
      });
      return;
    }
    const sav = await Mgba.guardado().catch(() => null);
    if (!sav) {
      setAviso({texto: 'Todavía no hay guardado: guarda dentro del juego (Start → Guardar) y vuelve a probar.', error: true});
      return;
    }
    const nombre = partida.nombre ?? partida.juego ?? nombreDePartida(partida);
    const paquete = empaquetar({semilla, sav: desdeBase64(sav), nombre});
    const ok = await Mgba.guardarFichero(nombreDeFichero(nombre), aBase64(paquete)).catch(() => false);
    if (ok) {
      setAviso({
        texto: 'Listo. Ábrelo en emupoke.aguaquim.com (Aleatorizar → «trae tu partida de otro aparato») o en otro teléfono, con tu ROM original.',
      });
    }
  };

  return (
    <ScrollView contentContainerStyle={estilos.panel}>
      <Text style={estilos.seccion}>Estados · {titulo}</Text>
      <Text style={estilos.nota}>
        Una foto del momento exacto. Lo que de verdad cuenta sigue siendo guardar dentro del juego.
      </Text>
      {RANURAS.map(n => {
        const cuando = ocupadas[String(n)];
        return (
          <View key={n} style={estilos.fila}>
            <Text style={estilos.ranura}>
              {n} · {cuando ? hora(cuando) : 'vacía'}
            </Text>
            <View style={estilos.boton}>
              <Boton texto="Guardar" onPress={() => void guardar(n)} />
            </View>
            <View style={estilos.boton}>
              <Boton texto="Cargar" desactivado={!cuando} onPress={() => void cargar(n)} />
            </View>
          </View>
        );
      })}

      <Text style={estilos.seccion}>Llevarse la partida</Text>
      <Text style={estilos.nota}>
        Un fichero .emupoke con la semilla y tu guardado, sin la ROM. Sirve para seguir en la web o en otro
        teléfono.
      </Text>
      <Boton texto="Exportar .emupoke" onPress={() => void llevarse()} />

      {aviso && <Text style={aviso.error ? estilos.error : estilos.nota}>{aviso.texto}</Text>}
      <Boton texto="Volver al juego" principal onPress={onCerrar} />
    </ScrollView>
  );
};

const estilos = StyleSheet.create({
  panel: {padding: 16, gap: 10},
  seccion: {color: '#e8eef5', fontSize: 16, fontWeight: '700', marginTop: 8},
  nota: {color: '#8b9aab', fontSize: 14, lineHeight: 20},
  error: {color: '#ee1515', fontSize: 14},
  fila: {flexDirection: 'row', alignItems: 'center', gap: 8},
  ranura: {color: '#e8eef5', fontSize: 15, flex: 1},
  boton: {width: 100},
});

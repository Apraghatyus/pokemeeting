// Una tira con el equipo: mote, nivel, tipo y estado. La misma informacion que
// el panel de la web, en el sitio que deja un telefono.

import {ScrollView, StyleSheet, Text, View} from 'react-native';
import type {EquipoResumen} from '@emupoke/protocol';
import {parejaCaida, TIPOS_GEN3} from '@emupoke/pokemon';
import type {Especies} from './especies';

const SIGLA: Record<string, string> = {
  debilitado: 'DEB',
  dormido: 'DOR',
  congelado: 'CON',
  paralizado: 'PAR',
  quemado: 'QUE',
  envenenado: 'ENV',
};

type Props = {
  titulo: string;
  equipo: EquipoResumen | null;
  especies: Especies;
  /** Los motes caidos al otro lado, para marcar las parejas del Soul Link. */
  caidosDelOtro: ReadonlySet<string>;
};

export const Equipo = ({titulo, equipo, especies, caidosDelOtro}: Props) => (
  <View style={estilos.bloque}>
    <Text style={estilos.titulo}>{titulo}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {(equipo?.ranuras ?? []).map(p => {
        const enlace = !p.estado && parejaCaida(p.mote, caidosDelOtro);
        const caido = p.estado === 'debilitado' || enlace;
        return (
          <View key={p.personalidad} style={[estilos.ficha, caido && estilos.caido]}>
            <Text style={estilos.nombre} numberOfLines={1}>
              {p.huevo ? 'Huevo' : p.mote || especies.nombre(p.especie)}
            </Text>
            <Text style={estilos.linea}>
              {p.huevo ? '' : `Nv.${p.nivel}`}
              {p.tipos ? `  ${TIPOS_GEN3[p.tipos[0]] ?? ''}` : ''}
            </Text>
            {p.estado && <Text style={estilos.estado}>{SIGLA[p.estado] ?? p.estado}</Text>}
            {enlace && <Text style={[estilos.estado, estilos.enlace]}>ENLACE</Text>}
          </View>
        );
      })}
      {!equipo && <Text style={estilos.vacio}>Todavia sin equipo</Text>}
    </ScrollView>
  </View>
);

const estilos = StyleSheet.create({
  bloque: {paddingHorizontal: 12, paddingVertical: 6},
  titulo: {color: '#8b9aab', fontSize: 12, marginBottom: 4},
  ficha: {
    width: 96,
    marginRight: 8,
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#1c2530',
    borderWidth: 1,
    borderColor: '#26313d',
  },
  caido: {opacity: 0.45},
  nombre: {color: '#e8eef5', fontWeight: '700', fontSize: 13},
  linea: {color: '#8b9aab', fontSize: 11, marginTop: 2},
  estado: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 5,
    borderRadius: 4,
    backgroundColor: '#ee1515',
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
  },
  enlace: {backgroundColor: '#3b4cca'},
  vacio: {color: '#8b9aab', fontSize: 12, paddingVertical: 12},
});

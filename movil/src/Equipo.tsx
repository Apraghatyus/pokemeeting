// El equipo: sprite, mote, nivel, tipo y estado. La misma informacion que el
// panel de la web, en el sitio que deja un telefono.
//
// Tumbado hay una version compacta, como la de la web: solo los sprites, en una
// tira que flota sobre la banda negra de arriba. El nombre y el nivel no caben,
// y el dibujo basta para ver de un vistazo quien sigue en pie.

import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {EquipoResumen, PokemonResumen} from '@emupoke/protocol';
import type {Infracciones} from '../../apps/web/src/core/reglasNuzlocke';
import {parejaCaida, TIPOS_GEN3} from '@emupoke/pokemon';
import type {Especies} from './especies';
import {Sprite} from './Sprite';

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
  compacta?: boolean;
  /** El nivel que no se puede pasar antes del siguiente lider, si hay tope. */
  tope?: number | null;
  /** Tipos primarios repetidos entre los dos equipos (Nivelada). */
  tiposRepetidos?: ReadonlySet<number>;
  /** Lo que las reglas de Nuzlocke marcan: ruta repetida y revividos. */
  infracciones?: Infracciones;
  /** Al pulsar un Pokemon: para cambiarle el mote. */
  onElegir?: (pokemon: PokemonResumen) => void;
};

/** Las etiquetas de las reglas, en rojo: para el reto no se puede usar. */
const etiquetas = (
  p: PokemonResumen,
  tope: number | null,
  tiposRepetidos: ReadonlySet<number> | undefined,
  infracciones: Infracciones | undefined,
): string[] => {
  if (p.huevo) return [];
  const lista: string[] = [];
  if (tope !== null && p.nivel > tope) lista.push(`+${p.nivel - tope}`);
  if (infracciones?.revividos.has(p.personalidad)) lista.push('REVIVIDO');
  if (infracciones?.rutaRepetida.has(p.personalidad)) lista.push('RUTA');
  if (p.tipos && tiposRepetidos?.has(p.tipos[0])) lista.push('TIPO REPETIDO');
  return lista;
};

export const Equipo = ({
  titulo,
  equipo,
  especies,
  caidosDelOtro,
  compacta = false,
  tope = null,
  tiposRepetidos,
  infracciones,
  onElegir,
}: Props) => {
  const ranuras = equipo?.ranuras ?? [];

  if (compacta) {
    return (
      <View style={estilos.tira} accessibilityLabel={titulo}>
        {ranuras.map(p => {
          const caido =
            p.estado === 'debilitado' ||
            (!p.estado && parejaCaida(p.mote, caidosDelOtro)) ||
            etiquetas(p, tope, tiposRepetidos, infracciones).length > 0;
          const nombre = p.mote || especies.nombre(p.especie);
          return (
            <View key={p.personalidad} style={caido ? estilos.caido : null}>
              <Sprite nacional={p.huevo ? 0 : especies.nacional(p.especie)} nombre={nombre} tamaño={30} />
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={estilos.bloque}>
      <Text style={estilos.titulo}>{titulo}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {ranuras.map(p => {
          const enlace = !p.estado && parejaCaida(p.mote, caidosDelOtro);
          const reglas = etiquetas(p, tope, tiposRepetidos, infracciones);
          const caido = p.estado === 'debilitado' || enlace || reglas.length > 0;
          const nombre = p.huevo ? 'Huevo' : p.mote || especies.nombre(p.especie);
          return (
            <Pressable
              key={p.personalidad}
              disabled={!onElegir || p.huevo}
              onPress={() => onElegir?.(p)}
              style={[estilos.ficha, caido && estilos.caido]}>
              <Sprite nacional={p.huevo ? 0 : especies.nacional(p.especie)} nombre={nombre} tamaño={40} />
              <Text style={estilos.nombre} numberOfLines={1}>
                {nombre}
              </Text>
              <Text style={estilos.linea}>
                {p.huevo ? '' : `Nv.${p.nivel}`}
                {p.tipos ? `  ${TIPOS_GEN3[p.tipos[0]] ?? ''}` : ''}
              </Text>
              {p.estado && <Text style={estilos.estado}>{SIGLA[p.estado] ?? p.estado}</Text>}
              {enlace && <Text style={[estilos.estado, estilos.enlace]}>ENLACE</Text>}
              {reglas.map(r => (
                <Text key={r} style={estilos.estado}>
                  {r}
                </Text>
              ))}
            </Pressable>
          );
        })}
        {!equipo && <Text style={estilos.vacio}>Todavia sin equipo</Text>}
      </ScrollView>
    </View>
  );
};

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
  caido: {opacity: 0.35},
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
  tira: {
    flexDirection: 'row',
    gap: 2,
    paddingHorizontal: 8,
    paddingBottom: 3,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
});

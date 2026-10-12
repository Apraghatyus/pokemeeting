// Aleatorizar desde la app: la ROM base, las reglas y que se mezcla.
//
// Lo mismo que el menu de la web, en una pantalla: el servicio dice que
// opciones hay y para que generacion, se marcan, y mientras se hace la copia
// se ve el puesto en la cola. Al acabar se abre la partida nueva.

import {useEffect, useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import type {Dificultad} from '@emupoke/protocol';
import {parseGameCode} from '@emupoke/pokemon';
import {DIFICULTADES} from '../../apps/web/src/core/dificultad';
import {aleatorizarNueva, DE_SERIE, opcionesDelServicio, type Opcion, type PuestoEnCola} from './aleatorizar';
import {Boton} from './Boton';
import {Mgba, type Rom} from './nativo';

export const Aleatorizar = ({
  roms,
  onListo,
  onVolver,
}: {
  /** Las ROMs que ya hay en el telefono; las copias aleatorias no sirven de base. */
  roms: Rom[];
  onListo: (rom: Rom) => void;
  onVolver: () => void;
}) => {
  const [base, setBase] = useState<Rom | null>(null);
  const [generacion, setGeneracion] = useState<number | null>(null);
  const [opciones, setOpciones] = useState<Opcion[] | null | 'cargando'>('cargando');
  const [elegidas, setElegidas] = useState<Set<string>>(new Set(DE_SERIE));
  const [dificultad, setDificultad] = useState<Dificultad>('nuzlocke');
  const [trabajando, setTrabajando] = useState(false);
  const [puesto, setPuesto] = useState<PuestoEnCola | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    void opcionesDelServicio().then(setOpciones);
  }, []);

  useEffect(() => {
    setGeneracion(null);
    if (!base) return;
    void Mgba.codigoDeJuego(base.ruta).then(codigo => setGeneracion(parseGameCode(codigo).game?.generacion ?? null));
  }, [base]);

  const bases = useMemo(() => roms.filter(r => !/-aleatoria-/.test(r.nombre)), [roms]);
  const visibles =
    opciones === 'cargando' || !opciones
      ? []
      : opciones.filter(o => generacion === null || o.generaciones.includes(generacion));

  const cambiar = (id: string) =>
    setElegidas(antes => {
      const despues = new Set(antes);
      if (despues.has(id)) {
        despues.delete(id);
        return despues;
      }
      despues.add(id);
      // Las que chocan con esta se quitan, en los dos sentidos, como en la web.
      const elegida = visibles.find(o => o.id === id);
      for (const otra of elegida?.chocaCon ?? []) despues.delete(otra);
      for (const o of visibles) if (o.id !== id && o.chocaCon?.includes(id)) despues.delete(o.id);
      return despues;
    });

  const empezar = async () => {
    if (!base) return;
    setTrabajando(true);
    setProblema(null);
    setPuesto(null);
    try {
      const ids = visibles.filter(o => elegidas.has(o.id)).map(o => o.id);
      const {rom} = await aleatorizarNueva(base, ids, dificultad, setPuesto);
      onListo(rom);
    } catch (error) {
      setProblema(error instanceof Error ? error.message : String(error));
    } finally {
      setTrabajando(false);
    }
  };

  if (trabajando) {
    return (
      <View style={estilos.esperando}>
        <Text style={estilos.titulo}>Haciendo tu copia…</Text>
        <Text style={estilos.nota}>
          {puesto && puesto.delante > 0
            ? `Hay ${puesto.delante} ${puesto.delante === 1 ? 'copia' : 'copias'} delante${
                puesto.segundosPorCopia ? `: unos ${Math.ceil((puesto.delante * puesto.segundosPorCopia) / 60)} min` : ''
              }.`
            : 'Suele tardar menos de un minuto. La ROM viaja cifrada y no se guarda en el servidor.'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.pantalla}>
      <Text style={estilos.titulo}>Aleatorizar</Text>
      <Text style={estilos.seccion}>1 · La ROM original</Text>
      {bases.length === 0 && <Text style={estilos.nota}>Primero añade una ROM desde la pantalla de inicio.</Text>}
      {bases.map(r => (
        <Boton key={r.ruta} texto={`${base?.ruta === r.ruta ? '● ' : ''}${r.nombre}`} principal={base?.ruta === r.ruta} onPress={() => setBase(r)} />
      ))}

      <Text style={estilos.seccion}>2 · Las reglas</Text>
      <View style={estilos.fila}>
        {DIFICULTADES.map(d => (
          <Casilla key={d.id} texto={d.nombre} marcada={dificultad === d.id} onPress={() => setDificultad(d.id)} />
        ))}
      </View>
      <Text style={estilos.nota}>{DIFICULTADES.find(d => d.id === dificultad)?.reglas.join(' · ')}</Text>

      <Text style={estilos.seccion}>3 · Qué se mezcla</Text>
      {opciones === 'cargando' && <Text style={estilos.nota}>Preguntando al servicio…</Text>}
      {opciones === null && (
        <Text style={estilos.error}>El servicio de aleatorizar no responde. Prueba en un rato.</Text>
      )}
      {visibles.map(o => (
        <Pressable key={o.id} onPress={() => cambiar(o.id)} style={[estilos.opcion, elegidas.has(o.id) && estilos.opcionMarcada]}>
          <Text style={estilos.opcionTitulo}>
            {elegidas.has(o.id) ? '☑' : '☐'} {o.label}
          </Text>
          <Text style={estilos.nota}>{o.description}</Text>
        </Pressable>
      ))}

      {problema && <Text style={estilos.error}>{problema}</Text>}
      <Boton
        texto="Aleatorizar y jugar"
        principal
        desactivado={!base || !Array.isArray(opciones)}
        onPress={() => void empezar()}
      />
      <Boton texto="Volver" onPress={onVolver} />
    </ScrollView>
  );
};

const Casilla = ({texto, marcada, onPress}: {texto: string; marcada: boolean; onPress: () => void}) => (
  <Pressable onPress={onPress} style={[estilos.casilla, marcada && estilos.casillaMarcada]}>
    <Text style={[estilos.casillaTexto, marcada && estilos.casillaTextoMarcada]}>{texto}</Text>
  </Pressable>
);

const estilos = StyleSheet.create({
  pantalla: {padding: 20, gap: 10},
  esperando: {flex: 1, padding: 24, gap: 12, justifyContent: 'center'},
  titulo: {color: '#ffcb05', fontSize: 26, fontWeight: '800', marginTop: 12},
  seccion: {color: '#e8eef5', fontSize: 16, fontWeight: '700', marginTop: 12},
  nota: {color: '#8b9aab', fontSize: 14, lineHeight: 20},
  error: {color: '#ee1515', fontSize: 14},
  fila: {flexDirection: 'row', gap: 8, flexWrap: 'wrap'},
  casilla: {paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#26313d', backgroundColor: '#131a22'},
  casillaMarcada: {backgroundColor: '#ffcb05', borderColor: '#ffcb05'},
  casillaTexto: {color: '#e8eef5', fontWeight: '700'},
  casillaTextoMarcada: {color: '#0b0f14'},
  opcion: {padding: 12, gap: 4, borderRadius: 12, borderWidth: 1, borderColor: '#26313d', backgroundColor: '#131a22'},
  opcionMarcada: {borderColor: '#ffcb05'},
  opcionTitulo: {color: '#e8eef5', fontSize: 15, fontWeight: '700'},
});

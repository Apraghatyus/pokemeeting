// Las ventanas que salen encima de la partida: el fin de partida, la pregunta
// de Soul Link, cambiar un mote y el intercambio. Lo mismo que los modales de
// la web, con los componentes de React Native.

import {useEffect, useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import type {EquipoResumen, PokemonResumen} from '@emupoke/protocol';
import {LARGO_MOTE} from '@emupoke/pokemon';
import type {FinDePartida as DatosDelFin} from '../../apps/web/src/core/useFinDePartida';
import type {Intercambio} from '../../apps/web/src/core/useIntercambio';
import {Boton} from './Boton';
import type {Especies} from './especies';
import {Sprite} from './Sprite';

const Ventana = ({abierta, onCerrar, titulo, children}: {
  abierta: boolean;
  onCerrar: () => void;
  titulo: string;
  children: React.ReactNode;
}) => (
  <Modal visible={abierta} transparent animationType="fade" onRequestClose={onCerrar} supportedOrientations={['portrait', 'landscape']}>
    <View style={estilos.velo}>
      <ScrollView contentContainerStyle={estilos.caja}>
        <Text style={estilos.titulo}>{titulo}</Text>
        {children}
      </ScrollView>
    </View>
  </Modal>
);

/** El cartel de fin de partida: como acabo, y seguir jugando o no. */
export const FinDePartida = ({
  fin,
  medallas,
  especies,
  nombreDelCompanero,
}: {
  fin: DatosDelFin;
  medallas: number | null;
  especies: Especies;
  nombreDelCompanero: string;
}) => {
  const victoria = fin.resultado === 'victoria';
  return (
    <Ventana abierta={fin.terminada} onCerrar={fin.continuar} titulo={victoria ? '¡Reto completado!' : 'Fin de la partida'}>
      <Text style={estilos.texto}>
        {victoria
          ? 'Has llegado al Salón de la Fama.'
          : fin.porElEnlace
            ? `Ha caído la pareja de tu Pokémon en la partida de ${nombreDelCompanero}: en un Soul Link eso acaba el reto.`
            : 'Tu equipo ha caído entero.'}
      </Text>
      {medallas !== null && <Text style={estilos.nota}>Medallas: {medallas} de 8</Text>}
      <View style={estilos.fila}>
        {(fin.equipoFinal?.ranuras ?? [])
          .filter(p => !p.huevo)
          .map(p => (
            <View key={p.personalidad} style={estilos.mini}>
              <Sprite nacional={especies.nacional(p.especie)} nombre={p.mote || especies.nombre(p.especie)} tamaño={40} />
              <Text style={estilos.miniTexto} numberOfLines={1}>
                {p.mote || especies.nombre(p.especie)}
              </Text>
            </View>
          ))}
      </View>
      <Text style={estilos.nota}>
        Queda apuntado en tu historial. Puedes seguir jugando, pero lo que pase desde ahora ya no cuenta.
      </Text>
      <Boton texto="Seguir jugando" principal onPress={fin.continuar} />
      <Boton texto="No ha terminado (fue un error)" onPress={fin.descartar} />
    </Ventana>
  );
};

/** La pregunta de si la partida que se empieza juntos es una Soul Link. */
export const PreguntaSoulLink = ({
  abierta,
  nombreDelCompanero,
  onElegir,
}: {
  abierta: boolean;
  nombreDelCompanero: string;
  onElegir: (si: boolean) => void;
}) => (
  <Ventana abierta={abierta} onCerrar={() => onElegir(false)} titulo="¿Hacerla Soul Link?">
    <Text style={estilos.texto}>
      {nombreDelCompanero} ha entrado en tu partida y estáis empezando. Podéis jugarla como Soul Link:
    </Text>
    <Text style={estilos.nota}>• Cada captura va en pareja con la del otro en la misma zona, con el mismo mote.</Text>
    <Text style={estilos.nota}>• Si cae uno, su pareja también está muerta.</Text>
    <Text style={estilos.nota}>• Cuenta en el ranking de Soul Link, no en el de jugar solo.</Text>
    <Text style={estilos.nota}>Se elige ahora y vale para las dos partidas.</Text>
    <Boton texto="Sí, Soul Link" principal onPress={() => onElegir(true)} />
    <Boton texto="No, solo jugar juntos" onPress={() => onElegir(false)} />
  </Ventana>
);

/** Cambiarle el mote a un Pokemon del equipo, dentro de la partida. */
export const CambiarMote = ({
  pokemon,
  especies,
  conPareja,
  onCerrar,
  onCambiar,
}: {
  pokemon: PokemonResumen | null;
  especies: Especies;
  conPareja: string | null;
  onCerrar: () => void;
  onCambiar: (nuevo: string) => Promise<string | null>;
}) => {
  const [texto, setTexto] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);
  useEffect(() => {
    setTexto(pokemon?.mote ?? '');
    setFallo(null);
  }, [pokemon]);

  return (
    <Ventana abierta={pokemon !== null} onCerrar={onCerrar} titulo="Cambiar el mote">
      <Text style={estilos.nota}>{pokemon ? especies.nombre(pokemon.especie) : ''}</Text>
      <TextInput
        style={estilos.campo}
        value={texto}
        onChangeText={setTexto}
        maxLength={LARGO_MOTE}
        autoFocus
        placeholderTextColor="#8b9aab"
      />
      <Text style={estilos.nota}>
        Hasta {LARGO_MOTE} caracteres. Se escribe dentro de tu partida, como el Tasador de Motes.
        {conPareja ? ` También se le cambia a su pareja en la partida de ${conPareja}.` : ''}
      </Text>
      {fallo && <Text style={estilos.error}>{fallo}</Text>}
      <Boton
        texto="Cambiar"
        principal
        onPress={() =>
          void onCambiar(texto).then(problema => {
            if (problema) setFallo(problema);
            else onCerrar();
          })
        }
      />
      <Boton texto="Cancelar" onPress={onCerrar} />
    </Ventana>
  );
};

const Lado = ({titulo, mote, especie, nivel, especies, vacio}: {
  titulo: string;
  mote?: string;
  especie?: number;
  nivel?: number;
  especies: Especies;
  vacio: string;
}) => (
  <View style={estilos.lado}>
    <Text style={estilos.seccion}>{titulo}</Text>
    {especie === undefined ? (
      <Text style={estilos.nota}>{vacio}</Text>
    ) : (
      <View style={estilos.filaCentrada}>
        <Sprite nacional={especies.nacional(especie)} nombre={mote || especies.nombre(especie)} tamaño={44} />
        <View>
          <Text style={estilos.texto}>{mote || especies.nombre(especie)}</Text>
          <Text style={estilos.nota}>
            {especies.nombre(especie)} · Nv.{nivel}
          </Text>
        </View>
      </View>
    )}
  </View>
);

/** El intercambio: el mismo motor que la web, con su pantalla. */
export const IntercambioVentana = ({
  abierta,
  onCerrar,
  intercambio,
  equipo,
  especies,
  conCompanero,
}: {
  abierta: boolean;
  onCerrar: () => void;
  intercambio: Intercambio;
  equipo: EquipoResumen | null;
  especies: Especies;
  conCompanero: boolean;
}) => {
  const {estado, ofrecer, confirmar, cancelar, rematar, olvidar} = intercambio;
  const ranuras = (equipo?.ranuras ?? []).filter(r => !r.huevo);
  const puedoConfirmar = estado.mia !== null && estado.suya !== null && !estado.miListo;

  return (
    <Ventana abierta={abierta} onCerrar={onCerrar} titulo="Intercambiar">
      {estado.aMedias && (
        <View style={estilos.alerta}>
          <Text style={estilos.texto}>Tienes un intercambio sin terminar.</Text>
          <Text style={estilos.nota}>
            Se quedó a medias, seguramente porque se cortó la conexión. Lo que te daban está guardado: se puede
            terminar ahora sin tu compañero.
          </Text>
          <Boton texto="Terminarlo" principal onPress={rematar} />
        </View>
      )}
      {estado.aviso && <Text style={estilos.error}>{estado.aviso}</Text>}
      {estado.evolucion && (
        <Text style={estilos.texto}>
          ¡{estado.evolucion.de} ha evolucionado en {estado.evolucion.a} al llegar!
        </Text>
      )}

      {!conCompanero ? (
        <Text style={estilos.nota}>Para intercambiar hace falta estar en una sala con alguien.</Text>
      ) : (
        <>
          <Lado
            titulo="Entregas"
            mote={estado.mia?.mote}
            especie={estado.mia?.especie}
            nivel={estado.mia?.nivel}
            especies={especies}
            vacio="Elige abajo a cuál entregas."
          />
          <Lado
            titulo="Recibes"
            mote={estado.suya?.mote}
            especie={estado.suya?.especie}
            nivel={estado.suya?.nivel}
            especies={especies}
            vacio="Tu compañero todavía no ha elegido."
          />
          {estado.fase !== 'hecho' && estado.fase !== 'aplicando' && (
            <>
              <Text style={estilos.seccion}>{estado.mia ? 'Cambiar de Pokémon' : 'Tu equipo'}</Text>
              <View style={estilos.fila}>
                {ranuras.map(r => (
                  <Pressable
                    key={r.personalidad}
                    onPress={() => ofrecer(r.ranura)}
                    style={[estilos.mini, estado.mia?.ranura === r.ranura && estilos.elegido]}>
                    <Sprite nacional={especies.nacional(r.especie)} nombre={r.mote || especies.nombre(r.especie)} tamaño={40} />
                    <Text style={estilos.miniTexto} numberOfLines={1}>
                      {r.mote || especies.nombre(r.especie)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
          {estado.miListo && !estado.suListo && <Text style={estilos.nota}>Esperando a que tu compañero confirme…</Text>}
          {estado.suListo && !estado.miListo && <Text style={estilos.nota}>Tu compañero ya ha dicho que sí.</Text>}
          {estado.fase === 'aplicando' && <Text style={estilos.nota}>Escribiéndolo en tu partida…</Text>}
          {estado.fase === 'hecho' ? (
            <Boton texto="Hecho" principal onPress={() => { olvidar(); onCerrar(); }} />
          ) : (
            <>
              <Boton texto="Confirmar el intercambio" principal desactivado={!puedoConfirmar} onPress={confirmar} />
              {(estado.mia || estado.suya) && <Boton texto="Cancelar el trato" onPress={cancelar} />}
            </>
          )}
        </>
      )}
      <Boton texto="Cerrar" onPress={onCerrar} />
    </Ventana>
  );
};

const estilos = StyleSheet.create({
  velo: {flex: 1, backgroundColor: 'rgba(11, 15, 20, 0.88)', justifyContent: 'center'},
  caja: {
    margin: 16,
    padding: 18,
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#26313d',
    backgroundColor: '#131a22',
  },
  titulo: {color: '#e8eef5', fontSize: 20, fontWeight: '800'},
  seccion: {color: '#e8eef5', fontSize: 15, fontWeight: '700', marginTop: 6},
  texto: {color: '#e8eef5', fontSize: 14, lineHeight: 20},
  nota: {color: '#8b9aab', fontSize: 13, lineHeight: 18},
  error: {color: '#ee1515', fontSize: 13},
  fila: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  filaCentrada: {flexDirection: 'row', alignItems: 'center', gap: 10},
  mini: {width: 72, alignItems: 'center', padding: 6, borderRadius: 10, backgroundColor: '#1c2530'},
  elegido: {borderWidth: 2, borderColor: '#ffcb05'},
  miniTexto: {color: '#e8eef5', fontSize: 11, marginTop: 2},
  lado: {padding: 10, borderRadius: 12, backgroundColor: '#1c2530', gap: 6},
  alerta: {padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#ee1515', gap: 6},
  campo: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#26313d',
    backgroundColor: '#0b0f14',
    color: '#e8eef5',
    fontSize: 16,
  },
});

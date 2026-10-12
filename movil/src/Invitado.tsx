// Te han invitado: el enlace de la web abre la app aqui.
//
// Igual que el cartel de la web: se pregunta a la sala a que se juega y con
// que semilla, se elige la ROM original propia, se rehace el mismo mundo y se
// entra en la sala sola. Si ya se rehizo antes -volver a una Soul Link-, se
// abre la copia que hay.

import {useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, Text} from 'react-native';
import type {DatosDeSala} from '@emupoke/protocol';
import {parseGameCode} from '@emupoke/pokemon';
import type {Invitacion} from '../../apps/web/src/core/invitacion';
import {todasLasPartidas} from '../../apps/web/src/core/partidas';
import {descodificarSemilla} from '../../apps/web/src/core/semilla';
import {OtraRomError, rehacerDesdeSemilla, type PuestoEnCola} from './aleatorizar';
import {Boton} from './Boton';
import {preguntarSala} from './invitacion';
import {Mgba, type Rom} from './nativo';

export const Invitado = ({
  invitacion,
  roms,
  onAnadirRom,
  onListo,
  onVolver,
}: {
  invitacion: Invitacion;
  roms: Rom[];
  onAnadirRom: () => void;
  onListo: (rom: Rom) => void;
  onVolver: () => void;
}) => {
  const [datos, setDatos] = useState<DatosDeSala | null | 'preguntando'>('preguntando');
  const [trabajando, setTrabajando] = useState(false);
  const [puesto, setPuesto] = useState<PuestoEnCola | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  useEffect(() => {
    void preguntarSala(invitacion.sala).then(setDatos);
  }, [invitacion.sala]);

  const info = datos === 'preguntando' ? null : datos;
  const semilla = useMemo(
    () => (info?.semilla ? descodificarSemilla(info.semilla) : invitacion.semilla),
    [info, invitacion.semilla],
  );
  const juego = info ? (parseGameCode(info.gameCode).game?.label ?? info.title) : null;
  const bases = roms.filter(r => !/-aleatoria-/.test(r.nombre));

  // La copia ya rehecha de esta misma semilla, si la hay: no se vuelve a pedir.
  const yaRehecha = useMemo(() => {
    if (!semilla) return null;
    const p = todasLasPartidas().find(x => x.crc32 === semilla.crc32 && x.semilla === semilla.semilla);
    return p ? (roms.find(r => r.nombre === p.fichero) ?? null) : null;
  }, [semilla, roms]);

  const usar = async (base: Rom) => {
    setTrabajando(true);
    setProblema(null);
    try {
      if (semilla) {
        onListo(await rehacerDesdeSemilla(base, semilla, true, setPuesto));
        return;
      }
      // Sin semilla se juega la ROM tal cual: tiene que ser el mismo juego.
      if (info) {
        const codigo = await Mgba.codigoDeJuego(base.ruta);
        if (codigo && info.gameCode && codigo !== info.gameCode) {
          throw new Error(`Esa ROM no es ${juego ?? 'el mismo juego'}. Elige la que juega tu compañero.`);
        }
      }
      onListo(base);
    } catch (error) {
      setProblema(
        error instanceof OtraRomError || error instanceof Error ? error.message : String(error),
      );
    } finally {
      setTrabajando(false);
    }
  };

  if (trabajando) {
    return (
      <ScrollView contentContainerStyle={estilos.pantalla}>
        <Text style={estilos.titulo}>Rehaciendo el mismo mundo…</Text>
        <Text style={estilos.nota}>
          {puesto && puesto.delante > 0
            ? `Hay ${puesto.delante} ${puesto.delante === 1 ? 'copia' : 'copias'} delante.`
            : 'Con tu ROM y la semilla de tu compañero sale la misma copia, byte a byte.'}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.pantalla}>
      <Text style={estilos.titulo}>Te han invitado</Text>
      <Text style={estilos.nota}>
        {datos === 'preguntando'
          ? 'Preguntando a la sala…'
          : info
            ? `${info.anfitrion ?? 'Tu compañero'} te invita a jugar ${juego}${semilla ? ' aleatorizado, en Soul Link' : ''}. Sala ${invitacion.sala}.`
            : `No se encuentra la sala ${invitacion.sala}: puede que ya no exista. Si tu compañero sigue en ella, elige tu ROM y se intenta entrar.`}
      </Text>

      {yaRehecha ? (
        <>
          <Text style={estilos.seccion}>Ya tienes esta partida</Text>
          <Boton texto={`Seguir · ${yaRehecha.nombre}`} principal onPress={() => onListo(yaRehecha)} />
        </>
      ) : (
        <>
          <Text style={estilos.seccion}>Elige tu ROM original</Text>
          <Text style={estilos.nota}>
            Necesitas tu propia copia del juego: el enlace no la lleva. Se queda en tu teléfono.
          </Text>
          {bases.map(r => (
            <Boton key={r.ruta} texto={r.nombre} onPress={() => void usar(r)} />
          ))}
          <Boton texto="Añadir una ROM" principal={bases.length === 0} onPress={onAnadirRom} />
        </>
      )}

      {problema && <Text style={estilos.error}>{problema}</Text>}
      <Boton texto="Ahora no" onPress={onVolver} />
    </ScrollView>
  );
};

const estilos = StyleSheet.create({
  pantalla: {padding: 20, gap: 10},
  titulo: {color: '#ffcb05', fontSize: 26, fontWeight: '800', marginTop: 24},
  seccion: {color: '#e8eef5', fontSize: 16, fontWeight: '700', marginTop: 12},
  nota: {color: '#8b9aab', fontSize: 14, lineHeight: 20},
  error: {color: '#ee1515', fontSize: 14},
});

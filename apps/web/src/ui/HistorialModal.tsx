// Las partidas que ya se acabaron.
//
// SIN ENCHUFAR, A PROPOSITO. Esta pantalla no se abre desde ningun sitio: el
// historial va a tener su propia pagina el dia que haya cuentas, y hasta
// entonces no se ensena. Lo que SI sigue funcionando es apuntarlo -ver
// `historial.ts`-, que es lo que importa: el dia que exista esa pagina habra
// algo que contar en vez de empezar de cero.
//
// Esto se queda aqui porque la parte dificil ya esta resuelta -resolver los
// nombres con la ROM, plegar el equipo, cuando el porcentaje miente- y tirarlo
// seria volver a pensarlo. Enchufarlo de nuevo es un boton.
//
// Lo que se apunta al terminar una partida lleva un tiempo guardandose sin que
// se viera en ningun sitio -ver `historial.ts`-, y esto es enseñarlo. Se hizo en
// ese orden a proposito: una partida terminada no se vuelve a jugar, asi que un
// historial que empiece a llenarse el dia que se escribe su pantalla nace vacio.
//
// VIVE EN ESTE NAVEGADOR. No hay cuentas ni servidor: son tus partidas en este
// aparato. El dia que haya perfiles, esto es lo que se subira.
//
// Los nombres se resuelven con TU ROM, igual que en el panel del equipo: lo que
// se guarda son numeros -de especie y de movimiento- y el nombre lo pone quien
// mira. Por eso sin ROM cargada se ven los Pokemon pero no como se llaman: es
// el precio de no guardar nada del juego, y es el precio correcto.

import { useState } from 'react';
import { TOTAL_MEDALLAS } from '@emupoke/pokemon';
import { historial, type PartidaTerminada } from '../core/historial';
import { cuando, nombreDePartida, todasLasPartidas } from '../core/partidas';
import type { Especies } from '../core/useEspecies';
import { Modal } from './Modal';

type Props = {
  open: boolean;
  onClose: () => void;
  especies: Especies;
};

/**
 * A partir de cuantas partidas se enseña el porcentaje.
 *
 * Con tres jugadas, un 33% no dice nada y parece que si. Hasta que hay unas
 * cuantas se enseña la cuenta cruda, que es igual de cierta y no engaña.
 */
const MINIMO_PARA_EL_PORCENTAJE = 5;

/** Como se llamaba esa partida, si todavia esta en la lista de partidas. */
const comoSeLlamaba = (fichero: string): string | null => {
  const partida = todasLasPartidas().find((p) => p.fichero === fichero);
  return partida ? nombreDePartida(partida) : null;
};

const Pokemon = ({
  pokemon,
  especies,
}: {
  pokemon: PartidaTerminada['equipo'][number];
  especies: Especies;
}) => {
  const especie = especies.nombre(pokemon.especie);
  // Los huecos vacios del juego son ceros y no se enseñan: un Pokemon con dos
  // movimientos tiene dos, no dos y dos rayas.
  const movimientos = pokemon.movimientos
    .filter((id) => id > 0)
    .map((id) => especies.movimiento(id) || `#${id}`);

  return (
    <li className={`historial__pokemon${pokemon.caido ? ' historial__pokemon--caido' : ''}`}>
      <span className="historial__quien">
        <strong>{pokemon.mote || especie}</strong>
        <span className="historial__especie">
          {especie} · Nv.{pokemon.nivel}
          {pokemon.caido ? ' · cayó' : ''}
        </span>
      </span>
      <span className="historial__movimientos">
        {movimientos.length > 0 ? (
          movimientos.map((nombre, i) => (
            <span className="historial__movimiento" key={`${nombre}-${i}`}>
              {nombre}
            </span>
          ))
        ) : (
          <span className="historial__movimiento historial__movimiento--sin">sin movimientos</span>
        )}
      </span>
    </li>
  );
};

const Fila = ({ partida, especies }: { partida: PartidaTerminada; especies: Especies }) => {
  const [abierta, setAbierta] = useState(false);
  const gano = partida.resultado === 'victoria';
  const nombre = comoSeLlamaba(partida.partida) ?? partida.partida.replace(/\.[^.]+$/, '');

  return (
    <li className={`historial__fila${gano ? ' historial__fila--gano' : ''}`}>
      <button
        type="button"
        className="historial__cabecera"
        aria-expanded={abierta}
        onClick={() => setAbierta((v) => !v)}
      >
        <span className={`historial__resultado${gano ? ' is-victoria' : ''}`}>
          {gano ? 'Victoria' : 'Derrota'}
        </span>
        <span className="historial__nombre">{nombre}</span>
        <span className="historial__datos">
          {/* Hasta donde llego. Null es "no se supo leer", que no es cero. */}
          {partida.medallas !== null && (
            <span>
              {partida.medallas} de {TOTAL_MEDALLAS} medallas
            </span>
          )}
          <span>{cuando(partida.cuando)}</span>
        </span>
        <span className="historial__flecha" aria-hidden="true">
          {abierta ? '▾' : '▸'}
        </span>
      </button>

      {/* En un Soul Link, que se acabe por la pareja del otro es un final
          distinto de perder en tu juego, y contarlo igual seria perderse la
          mitad de la historia. */}
      {partida.porElEnlace && (
        <p className="historial__enlace">Se acabó por el enlace: cayó la pareja de tu compañero.</p>
      )}

      {abierta && (
        <ul className="historial__equipo">
          {partida.equipo.length > 0 ? (
            partida.equipo.map((p, i) => (
              <Pokemon key={`${p.mote}-${i}`} pokemon={p} especies={especies} />
            ))
          ) : (
            <li className="hint">De esta no se llegó a guardar el equipo.</li>
          )}
        </ul>
      )}
    </li>
  );
};

export const HistorialModal = ({ open, onClose, especies }: Props) => {
  // Se lee al pintar y no en un efecto: esto se abre de tanto en tanto y lo que
  // hay guardado no cambia mientras esta abierto.
  const partidas = open ? historial() : [];
  const ganadas = partidas.filter((p) => p.resultado === 'victoria').length;
  const bastantes = partidas.length >= MINIMO_PARA_EL_PORCENTAJE;
  const porcentaje = partidas.length > 0 ? Math.round((ganadas / partidas.length) * 100) : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="≡"
      title="Historial"
      subtitle="Las partidas que ya se acabaron, en este navegador."
    >
      {partidas.length === 0 ? (
        <p className="hint">
          Todavía no hay ninguna terminada. Aquí irán apareciendo según se acaben, con el equipo que
          tenías y los movimientos de cada uno.
        </p>
      ) : (
        <>
          <div className="historial__resumen">
            <span className="historial__cuenta">
              <strong>{ganadas}</strong> ganadas de <strong>{partidas.length}</strong>
            </span>
            {/* El porcentaje solo con unas cuantas: con tres partidas, un 33%
                no dice nada y parece que si. */}
            {bastantes ? (
              <span className="historial__porcentaje">{porcentaje}%</span>
            ) : (
              <span className="hint">
                El porcentaje sale con {MINIMO_PARA_EL_PORCENTAJE} partidas o más
              </span>
            )}
          </div>

          <ul className="historial">
            {partidas.map((p) => (
              <Fila key={p.id} partida={p} especies={especies} />
            ))}
          </ul>
        </>
      )}

      <p className="hint">
        Esto vive en este navegador y no sale de aquí. Los nombres los pone tu copia del juego: lo
        que se guarda son números, nunca nada de la ROM.
      </p>
    </Modal>
  );
};

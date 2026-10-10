// El cartel de fin de partida, en sus dos finales.
//
// VICTORIA cuando el juego ensena el Salon de la Fama, y DERROTA cuando se te
// cae el equipo entero, que en una Nuzlocke o un Soul Link es el final del reto
// aunque el juego siga.
//
// Es el mismo cartel y no dos, porque lo que ensena es lo mismo -hasta donde
// llegaste: medallas, equipo y Liga- y lo unico que cambia es el tono y como se
// sale. Partirlo en dos componentes habria sido copiar la lista de Pokemon dos
// veces para cambiarle el color al titulo.
//
// Las dos salidas no son equivalentes, y por eso se dicen con esas palabras:
// empezar de nuevo arranca de cero, y seguir jugando sigue la partida pero ya
// **fuera de concurso**. Esa diferencia hay que decirla aqui y no esconderla en
// los ajustes, porque es lo que decide si la partida cuenta.

import { parejaCaida, parseGameCode } from '@emupoke/pokemon';
import type { EquipoResumen, PokemonResumen } from '@emupoke/protocol';
import type { Especies } from '../core/useEspecies';
import { Liga, type PasoLiga } from './Liga';
import { Medallas } from './Medallas';
import { Modal } from './Modal';
import { SpriteEspecie } from './Sprite';

export type Resultado = 'victoria' | 'derrota';

type Props = {
  open: boolean;
  resultado: Resultado;
  equipo: EquipoResumen | null;
  especies: Especies;
  /** Como se llama la partida, si es una aleatorizada con nombre. */
  nombrePartida: string | null;
  /** Cuales se consiguieron. Vacio si de este juego no se saben leer. */
  medallas: readonly boolean[];
  /** Como quedo el Alto Mando. Vacio si no se sabe. */
  liga: readonly PasoLiga[];
  /** Motes caidos en el equipo del companero, para marcar las parejas rotas. */
  caidosDelCompanero: ReadonlySet<string>;
  /** Si lo que acabo el reto fue el Soul Link y no tu propia partida. */
  porElEnlace: boolean;
  onContinuar: () => void;
  onReiniciar: () => void;
  onDescartar: () => void;
};

/** Las dos primeras letras, para cuando no hay sprite. */
const inicial = (nombre: string): string => nombre.slice(0, 2).toUpperCase();

/** Color estable derivado de la especie, igual que en el panel. */
const tono = (especie: number): number => (especie * 47) % 360;

const Fila = ({
  pokemon,
  especies,
  generacion,
  caidosDelCompanero,
}: {
  pokemon: PokemonResumen;
  especies: Especies;
  generacion: number;
  caidosDelCompanero: ReadonlySet<string>;
}) => {
  const nombre = especies.nombre(pokemon.especie);
  const debilitado = pokemon.estado === 'debilitado';
  // Vivo en tu partida, pero su pareja cayo en la del companero: para el reto
  // esta tan muerto como el otro, y decir "Vivo" aqui era lo que no cuadraba.
  const sinPareja = !debilitado && parejaCaida(pokemon.mote, caidosDelCompanero);
  const caido = debilitado || sinPareja;

  return (
    <li className={`fin__fila${caido ? ' fin__fila--caido' : ''}`}>
      <SpriteEspecie
        nacional={pokemon.huevo ? 0 : especies.nacional(pokemon.especie)}
        generacion={generacion}
        inicial={pokemon.huevo ? '?' : inicial(nombre)}
        tonoDe={tono(pokemon.especie)}
        className="fin__sprite"
      />
      <span className="fin__datos">
        <strong className="fin__mote">{pokemon.mote || nombre}</strong>
        <span className="fin__nivel">
          {pokemon.huevo ? 'sin eclosionar' : `Nv. ${pokemon.nivel}`}
        </span>
      </span>
      <span className={`chip chip--${caido ? 'caido' : 'vivo'}`}>
        {sinPareja ? 'Su pareja cayó' : caido ? 'Caído' : 'Vivo'}
      </span>
    </li>
  );
};

export const FinModal = ({
  open,
  resultado,
  equipo,
  especies,
  nombrePartida,
  medallas,
  liga,
  caidosDelCompanero,
  porElEnlace,
  onContinuar,
  onReiniciar,
  onDescartar,
}: Props) => {
  const gano = resultado === 'victoria';
  const ranuras = equipo?.ranuras ?? [];
  // La coleccion de sprites se elige por el juego del que viene el equipo, que
  // es lo que ya hace el panel. Asi no hay dos sitios que puedan discrepar.
  const generacion = equipo ? (parseGameCode(equipo.juego).game?.generacion ?? 3) : 3;
  const pelean = ranuras.filter((r) => !r.huevo);
  const caidos = pelean.filter(
    (r) => r.estado === 'debilitado' || parejaCaida(r.mote, caidosDelCompanero),
  ).length;
  const vivos = pelean.length - caidos;

  return (
    <Modal
      open={open}
      onClose={onDescartar}
      icon={gano ? '🏆' : '✖'}
      title={gano ? 'Victoria' : 'Derrota'}
      subtitle={nombrePartida ?? (gano ? 'Reto completado' : 'Se te cayó el equipo entero')}
    >
      <div className={`fin fin--${resultado}`}>
        <p className="fin__resumen">
          {gano ? (
            <>
              Entraste en el <strong>Salón de la Fama</strong>. El reto está completado: lo que
              hagas a partir de aquí ya no puede quitártelo.
            </>
          ) : (
            porElEnlace ? (
              <>
                No te queda ningún Pokémon con el que seguir:{' '}
                <strong>a los que te quedaban se les cayó la pareja</strong> en la partida de tu
                compañero. En tu juego siguen en pie, pero en un Soul Link esa pareja se acabó, y
                con ella el reto.
              </>
            ) : (
              <>
                Tu equipo ha caído al completo. En una Nuzlocke eso es el final:{' '}
                <strong>el juego te deja seguir, pero el reto se acaba aquí.</strong>
              </>
            )
          )}
        </p>

        <div className="fin__columnas">
          <div className="fin__columna">
            {/* Las medallas salen SIEMPRE, incluso muriendo al principio: las
                que faltan son justo lo que cuenta la historia, y un cartel de
                fin de partida sin esa parte se quedaba a medias. Si no se saben
                cuales, se ensenan apagadas y sin cuenta, que es distinto de
                ensenar un cero: un cero para quien consiguio cuatro y no habia
                guardado miente mas que callarse. */}
            <Medallas conseguidas={medallas} />
            <Liga pasos={liga} />
          </div>

          {pelean.length > 0 && (
            <section className="tarjeta fin__columna">
              <div className="tarjeta__titulo">
                <span className="tarjeta__marca" />
                <h2>{gano ? 'Equipo ganador' : 'Tu equipo'}</h2>
                <div className="tarjeta__accion">
                  <span className="cuenta">
                    {caidos === 0
                      ? `${vivos} de ${pelean.length} vivos`
                      : `${vivos} vivos · ${caidos} caídos`}
                  </span>
                </div>
              </div>

              <ul className="fin__equipo">
                {ranuras.map((ranura) => (
                  <Fila
                    key={ranura.personalidad}
                    pokemon={ranura}
                    especies={especies}
                    generacion={generacion}
                    caidosDelCompanero={caidosDelCompanero}
                  />
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="fin__salidas">
          <button type="button" className="button--primary button--wide" onClick={onReiniciar}>
            {gano ? 'Empezar otra partida' : 'Empezar de nuevo'}
          </button>
          <button type="button" className="button--wide" onClick={onContinuar}>
            Seguir jugando
          </button>
        </div>

        <p className="hint">
          {gano ? (
            <>
              La partida sigue donde estaba si quieres seguir explorando. El reto ya cuenta como
              terminado, así que esto no le quita nada.
            </>
          ) : (
            <>
              Si sigues, la partida continúa donde estaba, pero <strong>ya no cuenta</strong>: lo
              que consigas a partir de aquí no entrará en las estadísticas. Si el cartel ha salido
              por error, ciérralo con la ✕ y no se da nada por terminado.
            </>
          )}
        </p>
      </div>
    </Modal>
  );
};

// El ranking: quien va ganando, con todos dentro.
//
// Es lo que convierte "mi historial en este navegador" en algo que se puede
// mirar con alguien al lado. Va sobre los datos de la base: lo que hay en este
// navegador no es ni una parte de lo que se ensena aqui.
//
// Dos cosas que se dicen a la cara y no se esconden:
//
//   - Las DESCARTADAS. No cuentan para el porcentaje, pero se ensenan al lado.
//     Si descartar fuera gratis e invisible, bastaria con borrar lo que va mal
//     antes de la pantalla de derrota para quedarse en el 100%. Ese numero es
//     lo que hace que el de al lado signifique algo.
//   - El PORCENTAJE no sale hasta que hay partidas suficientes. Con tres
//     jugadas un 33% no dice nada y parece que si; hasta entonces, la cuenta
//     cruda.

import { useMemo, useState } from 'react';
import {
  useRanking,
  type JugadorDelRanking,
  type PartidaDelRanking,
  type PokemonDelRanking,
} from '../core/useRanking';
import type { Especies } from '../core/useEspecies';
import { SpriteEspecie, SpriteMedalla } from './Sprite';
import { DIFICULTADES, infoDe } from '../core/dificultad';
import type { Dificultad } from '@emupoke/protocol';

type Props = {
  /** Cierra el ranking y devuelve a la partida. */
  onVolver: () => void;
  /** Quien eres, para destacarte en la tabla. */
  usuario: string | null;
  /** Para poner nombre a los Pokemon: lo guardado son numeros. */
  especies: Especies;
};


const TOTAL_MEDALLAS = 8;

/** Las iniciales para el circulito, como en una lista de contactos. */
const iniciales = (texto: string): string =>
  texto
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((trozo) => trozo[0]?.toUpperCase() ?? '')
    .join('') || '?';

/**
 * De que generacion se piden los sprites.
 *
 * Tercera: es la unica que juega este emulador hoy. Se deja dicho aqui porque
 * el dato de que juego era si viaja, y el dia que haya segunda generacion esto
 * tendra que salir de ahi y no de una constante.
 */
const GENERACION = 3;

const cuando = (iso: string): string => {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return '';
  return fecha.toLocaleDateString('es', { day: '2-digit', month: 'short' });
};

/**
 * Las ocho medallas, las ganadas a color y las que faltaron apagadas.
 *
 * Son las mismas imagenes que en la partida, y por la misma razon: una fila de
 * circulos no dice por donde ibas, y las medallas si se reconocen de un
 * vistazo aunque no se lea nada.
 */
const Medallas = ({ cuantas }: { cuantas: number | null }) => (
  <div className="rank__medallas" aria-label={`${cuantas ?? 0} de ${TOTAL_MEDALLAS} medallas`}>
    {Array.from({ length: TOTAL_MEDALLAS }, (_, i) => (
      <span
        key={i}
        className={`rank__medalla${i < (cuantas ?? 0) ? ' is-ganada' : ''}`}
        title={`Medalla ${i + 1}`}
      >
        <SpriteMedalla numero={i + 1} nombre={`Medalla ${i + 1}`} />
      </span>
    ))}
  </div>
);

/**
 * Un Pokemon del equipo: su sprite, y al pulsarlo lo que llevaba.
 *
 * El nivel y los movimientos estaban guardados desde el principio y no se
 * veian en ningun sitio. Son la diferencia entre "perdio con un Pidgey" y
 * "perdio con un Pidgey de nivel 40 que solo sabia Ataque Rapido".
 */
const PokemonDelEquipo = ({
  pokemon,
  generacion,
  especies,
  abierto,
  onPulsar,
}: {
  pokemon: PokemonDelRanking;
  generacion: number;
  especies: Especies;
  abierto: boolean;
  onPulsar: () => void;
}) => {
  const especie = especies.nombre(pokemon.especie) || `#${pokemon.especie}`;

  return (
    <li className={`rank__poke${pokemon.caido ? ' is-caido' : ''}`}>
      <button
        type="button"
        className={`rank__poke-boton${abierto ? ' is-abierto' : ''}`}
        onClick={onPulsar}
        aria-expanded={abierto}
        title={`${pokemon.mote} · ${especie} · Nv.${pokemon.nivel}${pokemon.caido ? ' · cayo' : ''}`}
      >
        <SpriteEspecie
          nacional={especies.nacional(pokemon.especie)}
          generacion={generacion}
          inicial={iniciales(pokemon.mote)}
          tonoDe={pokemon.especie}
          className="rank__sprite"
        />
      </button>

      {abierto && (
        <div className="rank__ficha">
          <strong className="rank__ficha-mote">{pokemon.mote}</strong>
          <span className="rank__ficha-quien">
            {especie} · Nv.{pokemon.nivel}
            {pokemon.caido ? ' · cayó' : ''}
          </span>
          <ul className="rank__movimientos">
            {(pokemon.movimientos ?? [])
              // El hueco vacio es el 0: un Pokemon de nivel bajo tiene dos
              // movimientos y dos huecos, y enseñar "—" cuatro veces no dice
              // nada que no diga el espacio en blanco.
              .filter((id) => id > 0)
              .map((id, i) => (
                <li key={i} className="rank__movimiento">
                  {especies.movimiento(id) || `#${id}`}
                </li>
              ))}
            {(pokemon.movimientos ?? []).filter((id) => id > 0).length === 0 && (
              <li className="rank__movimiento rank__movimiento--sin">sin movimientos apuntados</li>
            )}
          </ul>
        </div>
      )}
    </li>
  );
};

const Partida = ({
  partida,
  especies,
}: {
  partida: PartidaDelRanking;
  especies: Especies;
}) => {
  const gano = partida.resultado === 'victoria';
  const descartada = partida.resultado === 'descartada';
  // Cual de los seis esta abierto. Uno a la vez: con los seis abiertos la
  // tarjeta se hace mas alta que la pantalla.
  const [abierto, setAbierto] = useState<number | null>(null);

  return (
    <article className={`rank__partida rank__partida--${partida.resultado}`}>
      <header className="rank__partida-cab">
        <span className="rank__resultado">
          {gano ? '🏆' : descartada ? '✕' : '☠'}{' '}
          {descartada ? 'Descartada' : gano ? 'Victoria' : 'Derrota'}
        </span>
        <span className="rank__fecha">{cuando(partida.cuando)}</span>
      </header>

      <h4 className="rank__juego">{partida.juego ?? 'Sin juego apuntado'}</h4>

      <p className="rank__donde">
        {partida.modo === 'soullink' ? 'Soul Link' : 'En solitario'}
        {partida.companero ? ` con ${partida.companero}` : ''}
        {partida.dificultad ? ` · ${infoDe(partida.dificultad).nombre}` : ''}
        {partida.medallas !== null ? ` · ${partida.medallas} medallas` : ''}
      </p>

      {!descartada && <Medallas cuantas={partida.medallas} />}

      {partida.equipo.length > 0 && (
        <ul className="rank__equipo">
          {partida.equipo.map((pokemon, i) => (
            <PokemonDelEquipo
              key={i}
              pokemon={pokemon}
              generacion={GENERACION}
              especies={especies}
              abierto={abierto === i}
              onPulsar={() => setAbierto((previo) => (previo === i ? null : i))}
            />
          ))}
        </ul>
      )}
    </article>
  );
};

const Fila = ({
  jugador,
  puesto,
  soyYo,
  abierta,
  onAbrir,
  especies,
}: {
  jugador: JugadorDelRanking;
  puesto: number;
  soyYo: boolean;
  abierta: boolean;
  onAbrir: () => void;
  especies: Especies;
}) => {
  const total = jugador.victorias + jugador.derrotas;
  const parte = total > 0 ? (jugador.victorias / total) * 100 : 0;

  return (
    <li className={`rank__fila${soyYo ? ' is-tuya' : ''}${abierta ? ' is-abierta' : ''}`}>
      <button type="button" className="rank__cabecera" onClick={onAbrir} aria-expanded={abierta}>
        <span className="rank__puesto">{puesto === 1 ? '👑' : puesto}</span>

        <span className="rank__quien">
          <span className="rank__avatar" aria-hidden="true">
            {iniciales(jugador.apodo)}
          </span>
          <span className="rank__nombres">
            <strong>{jugador.apodo}</strong>
            <small>{jugador.usuario}</small>
          </span>
        </span>

        <span className="rank__partidas">
          {jugador.partidas} {jugador.partidas === 1 ? 'partida' : 'partidas'}
          {/* Las descartadas se dicen aqui, pegadas a la cuenta, y no
              escondidas: son las que explican un porcentaje demasiado bonito. */}
          {jugador.descartadas > 0 && (
            <small className="rank__descartadas">
              {jugador.descartadas} descartada{jugador.descartadas === 1 ? '' : 's'}
            </small>
          )}
        </span>

        <span className="rank__marcador">
          <span className="rank__numeros">
            {jugador.porcentaje !== null ? (
              <strong className="rank__porcentaje">{jugador.porcentaje}%</strong>
            ) : (
              <strong className="rank__porcentaje rank__porcentaje--pocas" title="Con pocas partidas un porcentaje no dice nada">
                —
              </strong>
            )}
            <span className="rank__vd">
              <span className="rank__v">{jugador.victorias}V</span> ·{' '}
              <span className="rank__d">{jugador.derrotas}D</span>
            </span>
          </span>
          <span className="rank__progreso">
            <span className="rank__progreso-v" style={{ width: `${parte}%` }} />
            <span className="rank__progreso-d" style={{ width: `${100 - parte}%` }} />
          </span>
        </span>

        <span className={`rank__flecha${abierta ? ' is-abierta' : ''}`} aria-hidden="true">
          ⌄
        </span>
      </button>

      {abierta && (
        <div className="rank__detalle">
          <h3 className="rank__detalle-titulo">Ultimas partidas terminadas</h3>
          {jugador.ultimas.length === 0 ? (
            <p className="hint">No hay ninguna todavia.</p>
          ) : (
            <div className="rank__partidas-lista">
              {jugador.ultimas.map((partida, i) => (
                <Partida key={i} partida={partida} especies={especies} />
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
};

export const Ranking = ({ onVolver, usuario, especies }: Props) => {
  const [modo, setModo] = useState<'sola' | 'soullink'>('sola');
  const [juego, setJuego] = useState<string | null>(null);
  const [dificultad, setDificultad] = useState<Dificultad | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [abierta, setAbierta] = useState<string | null>(null);

  const filtros = useMemo(() => ({ modo, juego, dificultad }), [modo, juego, dificultad]);
  const { jugadores, juegos, cargando, problema } = useRanking(filtros, true);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return jugadores;
    return jugadores.filter(
      (j) =>
        j.apodo.toLowerCase().includes(texto) || j.usuario.toLowerCase().includes(texto),
    );
  }, [jugadores, busqueda]);

  return (
    <div className="rank">
      <header className="rank__barra">
        <button type="button" className="rank__volver" onClick={onVolver} aria-label="Volver">
          ←
        </button>
        <img className="rank__marca" src="/icono-192.png" alt="" aria-hidden="true" />
        <div className="rank__titulos">
          <strong>Pokemeeting</strong>
          <span>Ranking</span>
        </div>

        {/* Sola y Soul Link son dos competiciones distintas, no dos vistas de
            la misma: en Soul Link tu Pokemon muere tambien cuando muere el de
            la otra persona, asi que mezclarlas haria que ninguno de los dos
            numeros significara nada. */}
        <div className="rank__modos" role="tablist" aria-label="Que partidas se ven">
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'sola'}
            className={modo === 'sola' ? 'is-activo' : undefined}
            onClick={() => setModo('sola')}
          >
            Solo
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'soullink'}
            className={modo === 'soullink' ? 'is-activo' : undefined}
            onClick={() => setModo('soullink')}
          >
            Soul Link
          </button>
        </div>
      </header>

      <div className="rank__cuerpo">
        <div className="rank__dificultades">
          {DIFICULTADES.map((d) => (
            <section key={d.id} className="rank__dificultad">
              <header>
                <h2>{d.nombre}</h2>
                <span>{d.coletilla}</span>
              </header>
              <ul>
                {d.reglas.map((regla) => (
                  <li key={regla}>{regla}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="rank__filtros">
          {/* Lo jugado antes de que existieran las dificultades cuenta como
              Normal, que es como se jugaba. */}
          <div className="rank__juegos" role="group" aria-label="Filtrar por dificultad">
            <span className="rank__etiqueta">Dificultad</span>
            <button
              type="button"
              className={dificultad === null ? 'is-activo' : undefined}
              onClick={() => setDificultad(null)}
            >
              Todas
            </button>
            {DIFICULTADES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={dificultad === d.id ? 'is-activo' : undefined}
                onClick={() => setDificultad(d.id)}
              >
                {d.nombre}
              </button>
            ))}
          </div>

          <div className="rank__juegos" role="group" aria-label="Filtrar por juego">
            <span className="rank__etiqueta">Juego</span>
            <button
              type="button"
              className={juego === null ? 'is-activo' : undefined}
              onClick={() => setJuego(null)}
            >
              Todos
            </button>
            {juegos.map((nombre) => (
              <button
                key={nombre}
                type="button"
                className={juego === nombre ? 'is-activo' : undefined}
                onClick={() => setJuego(nombre)}
              >
                {nombre}
              </button>
            ))}
          </div>

          <input
            className="rank__buscar"
            type="search"
            value={busqueda}
            onChange={(evento) => setBusqueda(evento.target.value)}
            placeholder="Buscar jugador"
            aria-label="Buscar jugador"
          />
        </div>

        <div className="rank__encabezados">
          <span>#</span>
          <span>Jugador</span>
          <span>Partidas</span>
          <span>V / D</span>
        </div>

        {problema ? (
          <p className="alert" role="alert">
            {problema}
          </p>
        ) : cargando && jugadores.length === 0 ? (
          <p className="hint">Trayendo el ranking…</p>
        ) : visibles.length === 0 ? (
          <p className="hint">
            {busqueda
              ? 'Nadie se llama asi.'
              : modo === 'soullink'
                ? 'Todavia no hay partidas de Soul Link terminadas.'
                : 'Todavia no hay partidas terminadas.'}
          </p>
        ) : (
          <ol className="rank__lista">
            {visibles.map((jugador, i) => (
              <Fila
                key={jugador.usuario}
                jugador={jugador}
                puesto={i + 1}
                soyYo={jugador.usuario === usuario}
                abierta={abierta === jugador.usuario}
                onAbrir={() => setAbierta((previo) => (previo === jugador.usuario ? null : jugador.usuario))}
                especies={especies}
              />
            ))}
          </ol>
        )}
      </div>
    </div>
  );
};

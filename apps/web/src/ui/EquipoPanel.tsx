// Los seis Pokemon de un equipo, en una columna al lado de la pantalla.
//
// A la izquierda el tuyo y a la derecha el de tu companero, para ver de un
// vistazo como va la pareja. En un Soul Link eso es media partida: lo que
// importa no es solo tu equipo, es si el suyo aguanta.
//
// Las dos columnas se anclan a esquinas opuestas: la tuya crece desde arriba y
// la suya desde abajo. Con equipos a medio llenar, los huecos quedan hacia el
// centro y cada columna se lee hacia su borde.
//
// El componente no sabe de que juego viene nada de esto. Recibe un resumen y
// una funcion que pone nombres, y con eso pinta igual una partida de Rojo
// Fuego que, el dia que exista su lector, una de Oro.

import { useState } from 'react';
import { parseGameCode } from '@emupoke/pokemon';
import type { Especies } from '../core/useEspecies';
import type { EquipoResumen, EstadoPokemon, PokemonResumen } from '@emupoke/protocol';

type Props = {
  titulo: string;
  equipo: EquipoResumen | null;
  /** 'propio' crece desde arriba; 'companero' desde abajo. */
  lado: 'propio' | 'companero';
  /**
   * Como se llama cada especie y que numero tiene en la Pokedex nacional.
   *
   * Lo resuelve quien pinta, con SU ROM. Por eso vale igual para el equipo del
   * companero: la especie 25 se llama PIKACHU en las dos copias aunque esten
   * aleatorizadas por separado.
   */
  especies: Especies;
  /**
   * Cual esta en combate, para iluminarlo.
   *
   * Todavia no lo manda nadie: saber si hay un combate en marcha necesita
   * localizar ese dato en memoria, y eso esta pendiente. El estilo esta hecho
   * para que el dia que llegue sea pasar este numero.
   */
  activo?: number | null;
  /** Por que no hay nada que enseñar, si es el caso. */
  motivo?: string;
};

/**
 * Color de la ficha a partir de la especie.
 *
 * Mientras no haya sprites, cada Pokemon necesita algo que lo distinga de un
 * vistazo. Se deriva del numero de especie, asi que es estable: el mismo sale
 * siempre del mismo color, y dos distintos casi nunca coinciden.
 */
const tono = (especie: number): number => (especie * 47) % 360;

/** Las dos primeras letras, como en las fichas del boceto. */
const inicial = (nombre: string): string => nombre.slice(0, 2).toUpperCase();

/** Abreviatura de cada estado, al estilo de las del propio juego. */
const SIGLA: Readonly<Record<EstadoPokemon, string>> = {
  debilitado: 'DEB',
  dormido: 'DOR',
  congelado: 'CON',
  paralizado: 'PAR',
  quemado: 'QUE',
  envenenado: 'VEN',
};

/**
 * De donde salen los sprites.
 *
 * Se sirven desde el repositorio de PokeAPI, que es el unico de los que se
 * probaron que manda `Cross-Origin-Resource-Policy: cross-origin`. Sin esa
 * cabecera el navegador los bloquea, porque esta pagina corre con aislamiento
 * cross-origin para poder usar el emulador. Los de Pokemon Showdown, que
 * encajarian mejor con el estilo, no la mandan y quedan descartados.
 *
 * No se descarga nada ni se guarda nada: son etiquetas de imagen normales, y
 * el navegador las cachea el solo.
 */
const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';

/** El juego de sprites que mejor pega con cada generacion. */
const COLECCION: Readonly<Record<number, string>> = {
  2: 'versions/generation-ii/crystal',
  3: 'versions/generation-iii/firered-leafgreen',
};

/**
 * El sprite de una especie, con su plan B.
 *
 * Se intenta primero la coleccion de la generacion que se esta jugando, para
 * que se vea como en el juego; si esa especie no esta ahi, la general; y si
 * tampoco, el circulo con las dos letras de siempre. Asi tambien funciona sin
 * internet, que es como se juega muchas veces.
 */
const Sprite = ({
  nacional,
  generacion,
  inicial,
  tonoDe,
}: {
  nacional: number;
  generacion: number;
  inicial: string;
  tonoDe: number;
}) => {
  const [intento, setIntento] = useState(0);

  const candidatas =
    nacional > 0
      ? [
          COLECCION[generacion] ? `${SPRITES}/${COLECCION[generacion]}/${nacional}.png` : null,
          `${SPRITES}/${nacional}.png`,
        ].filter((url): url is string => url !== null)
      : [];

  if (intento >= candidatas.length) {
    return (
      <span
        className="ficha__sprite"
        style={{ '--tono': tonoDe } as React.CSSProperties}
        aria-hidden="true"
      >
        {inicial}
      </span>
    );
  }

  return (
    <img
      className="ficha__sprite ficha__sprite--imagen"
      src={candidatas[intento]}
      onError={() => setIntento((n) => n + 1)}
      alt=""
      aria-hidden="true"
      loading="lazy"
      draggable={false}
    />
  );
};

const Ficha = ({
  pokemon,
  especies,
  generacion,
  activo,
}: {
  pokemon: PokemonResumen;
  especies: Especies;
  generacion: number;
  activo: boolean;
}) => {
  const nombre = pokemon.huevo ? 'Huevo' : especies.nombre(pokemon.especie);
  const clases = [
    'ficha',
    activo ? 'ficha--activo' : '',
    pokemon.estado ? `ficha--${pokemon.estado}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li className={clases}>
      {/* Un huevo no enseña quien es dentro, asi que ni sprite ni nombre. */}
      {pokemon.huevo ? (
        <span
          className="ficha__sprite"
          style={{ '--tono': tono(pokemon.especie) } as React.CSSProperties}
          aria-hidden="true"
        >
          ?
        </span>
      ) : (
        <Sprite
          key={pokemon.especie}
          nacional={especies.nacional(pokemon.especie)}
          generacion={generacion}
          inicial={inicial(nombre)}
          tonoDe={tono(pokemon.especie)}
        />
      )}

      <span className="ficha__datos">
        <strong className="ficha__nombre">{pokemon.mote || nombre}</strong>
        <span className="ficha__linea">
          <span className="ficha__nivel">
            {pokemon.huevo ? 'sin eclosionar' : `Nv.${pokemon.nivel}`}
          </span>
          {/* En un Soul Link un debilitado no es un detalle: suele ser el final
              de una pareja. Por eso el estado se ve antes que nada. */}
          {pokemon.estado && (
            <span className={`estado estado--${pokemon.estado}`} title={pokemon.estado}>
              {SIGLA[pokemon.estado]}
            </span>
          )}
        </span>
      </span>

      {/* La especie y el estado en palabras, para quien no vea los colores. */}
      <span className="visually-hidden">
        {nombre}
        {pokemon.estado ? `, ${pokemon.estado}` : ''}
      </span>
    </li>
  );
};

export const EquipoPanel = ({
  titulo,
  equipo,
  lado,
  especies,
  activo = null,
  motivo,
}: Props) => {
  const ranuras = equipo?.ranuras ?? [];
  // La coleccion de sprites se elige por el juego del que viene el equipo, que
  // para el del companero es el suyo, no el nuestro.
  const generacion = equipo ? (parseGameCode(equipo.juego).game?.generacion ?? 3) : 3;

  return (
    <aside className={`equipo equipo--${lado}`} aria-label={titulo}>
      <h2 className="equipo__titulo">{titulo}</h2>

      {ranuras.length === 0 ? (
        <p className="equipo__vacio">{motivo ?? 'Todavia sin Pokemon.'}</p>
      ) : (
        <ul className="equipo__lista">
          {ranuras.map((pokemon) => (
            // La personalidad no cambia nunca, asi que cambiar dos Pokemon de
            // sitio mueve la ficha en vez de rehacerla.
            <Ficha
              key={pokemon.personalidad}
              pokemon={pokemon}
              especies={especies}
              generacion={generacion}
              activo={activo === pokemon.ranura}
            />
          ))}
        </ul>
      )}
    </aside>
  );
};

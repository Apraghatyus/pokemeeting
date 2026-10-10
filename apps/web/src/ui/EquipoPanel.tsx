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

import {
  parejaCaida,
  parseGameCode,
  TAMANO_EQUIPO,
  TIPOS_GEN3,
  type TopeDeNivel,
} from '@emupoke/pokemon';
import type { Especies } from '../core/useEspecies';
import { SpriteEspecie } from './Sprite';
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
   * La personalidad del que esta en combate, o null si no hay ninguno.
   *
   * Personalidad y no ranura: el juego NO sube al que pelea a la ranura 0, que
   * es lo que se creia y lo que hacia que la marca se quedara siempre en la
   * primera ficha. Se busca su copia de combate en memoria (`quienPelea`).
   */
  activo?: number | null;
  /**
   * Motes que han caido en el OTRO equipo.
   *
   * En un Soul Link los Pokemon van emparejados por el nombre que les ponen los
   * dos jugadores, asi que si cae uno, al otro se le acabo tambien. Se marca,
   * no se impone: el Pokemon sigue vivo en la partida y su dueño decide.
   */
  caidosDelOtro?: ReadonlySet<string>;
  /**
   * Cambia a ver el equipo del otro.
   *
   * Solo se pasa en pantallas estrechas, donde no caben las dos columnas: ahi
   * se ve un equipo y se cambia, igual que con las dos partidas.
   */
  onCambiar?: () => void;
  /**
   * Hasta que nivel se puede subir antes del proximo gimnasio.
   *
   * Es una regla que se pone la gente, no del juego, asi que esto AVISA y no
   * impide nada: el Pokemon sigue jugando y quien decide es su dueño. Igual que
   * con la pareja caida de un Soul Link.
   *
   * Solo se pasa para el equipo propio. Del companero no se sabe: su ROM y sus
   * medallas estan en su ordenador, y es ahi donde las ve.
   */
  tope?: TopeDeNivel | null;
  /**
   * Por que no hay nada que enseñar.
   *
   * Sin esto la columna vacia no dice nada, que es lo que se quiere mientras
   * no hay partida: una frase de relleno en cada hueco ensucia la pantalla.
   */
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
 * Los tipos de un Pokemon, uno o dos.
 *
 * Los nombres salen del catalogo de tercera generacion y el color de la
 * convencion de siempre, la misma que usan PokeAPI y todo lo demas, para que
 * se reconozcan sin leerlos.
 *
 * El numero del tipo viene en el mensaje, puesto por quien lo manda con SU
 * copia del juego. Resolverlo aqui seria mas comodo y estaria mal: en dos
 * copias aleatorizadas por separado la misma especie tiene tipos distintos.
 */
const Tipos = ({ tipos }: { tipos: readonly [number, number] | null }) => {
  if (!tipos) return null;

  // Un tipo repetido no es doble: es uno solo, y el juego lo guarda asi.
  const unicos = tipos[0] === tipos[1] ? [tipos[0]] : [tipos[0], tipos[1]];

  return (
    <>
      {unicos.map((tipo) => (
        <span key={tipo} className={`tipo tipo--${tipo}`}>
          {TIPOS_GEN3[tipo] ?? '?'}
        </span>
      ))}
    </>
  );
};

const Ficha = ({
  pokemon,
  especies,
  generacion,
  activo,
  parejaRota,
  tope,
}: {
  pokemon: PokemonResumen;
  especies: Especies;
  generacion: number;
  activo: boolean;
  parejaRota: boolean;
  tope: TopeDeNivel | null;
}) => {
  const nombre = pokemon.huevo ? 'Huevo' : especies.nombre(pokemon.especie);
  // Cuantos niveles se ha pasado del tope, si se lo ha pasado. Un huevo no
  // tiene nivel que comparar.
  const sobra = tope && !pokemon.huevo ? pokemon.nivel - tope.nivel : 0;
  const clases = [
    'ficha',
    activo ? 'ficha--activo' : '',
    pokemon.estado ? `ficha--${pokemon.estado}` : '',
    parejaRota ? 'ficha--pareja-caida' : '',
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
        <SpriteEspecie
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
          <span className={`ficha__nivel${sobra > 0 ? ' ficha__nivel--pasado' : ''}`}>
            {pokemon.huevo ? 'sin eclosionar' : `Nv.${pokemon.nivel}`}
          </span>
          {/* Pasado de nivel para el gimnasio que toca. Se marca con cuanto se
              pasa, que es el dato util: por uno se aguanta, por ocho no.

              Va como etiqueta y NO como borde a proposito: los bordes de la
              ficha son box-shadow y ya se pisaron una vez entre si -el de
              "esta peleando" y el de estado-. Una cuarta capa ahi volveria a
              borrar alguna. */}
          {sobra > 0 && tope && (
            <span
              className="estado estado--pasado"
              title={`${sobra} por encima del tope: ${tope.lider} llega a Nv.${tope.nivel}`}
            >
              +{sobra}
            </span>
          )}
          {/* En un Soul Link un debilitado no es un detalle: suele ser el final
              de una pareja. Por eso el estado se ve antes que nada. */}
          {pokemon.estado && (
            <span className={`estado estado--${pokemon.estado}`} title={pokemon.estado}>
              {SIGLA[pokemon.estado]}
            </span>
          )}
          {/* Su pareja cayo al otro lado. No se toca su partida: se avisa. */}
          {parejaRota && !pokemon.estado && (
            <span className="estado estado--enlace" title="Su pareja se debilito">
              ENLACE
            </span>
          )}
        </span>
        <span className="ficha__linea">
          {!pokemon.huevo && <Tipos tipos={pokemon.tipos} />}
        </span>
      </span>

      {/* La especie y el estado en palabras, para quien no vea los colores. */}
      <span className="visually-hidden">
        {nombre}
        {pokemon.estado ? `, ${pokemon.estado}` : ''}
        {sobra > 0 ? `, ${sobra} niveles por encima del tope` : ''}
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
  caidosDelOtro,
  tope = null,
  onCambiar,
  motivo,
}: Props) => {
  const ranuras = equipo?.ranuras ?? [];
  // La coleccion de sprites se elige por el juego del que viene el equipo, que
  // para el del companero es el suyo, no el nuestro.
  const generacion = equipo ? (parseGameCode(equipo.juego).game?.generacion ?? 3) : 3;

  // Siempre seis huecos, tenga o no Pokemon. Asi el sitio de cada uno esta
  // reservado desde el principio: al capturar el tercero aparece en su fila y
  // los otros dos no se mueven, en vez de recolocarse los tres.
  //
  // Se pinta en el orden en que vienen, que ya es el estable. Antes se colocaba
  // cada uno en su ranura de memoria, y eso deshacia el orden justo al pintar:
  // el panel se volvia a barajar en combate y el iluminado acababa siendo
  // siempre la primera ficha, porque el que pelea esta en la ranura 0.
  const huecos = Array.from({ length: TAMANO_EQUIPO }, (_, i) => ranuras[i] ?? null);

  return (
    <aside className={`equipo equipo--${lado}`} aria-label={titulo}>
      <div className="equipo__cabecera">
        <h2 className="equipo__titulo">{titulo}</h2>
        {onCambiar && (
          <button type="button" className="equipo__cambiar" onClick={onCambiar}>
            {lado === 'propio' ? 'Ver el suyo' : 'Ver el tuyo'}
          </button>
        )}
      </div>

      {/* El tope del gimnasio que toca, con el nombre del lider: sin el nombre
          el numero no se sabe de donde sale, y sabiendolo se puede comprobar
          dentro del juego. */}
      {tope && (
        <p className="equipo__tope">
          <span className="equipo__tope-nivel">Nv.{tope.nivel}</span>
          <span className="equipo__tope-quien">
            tope para el gimnasio {tope.gimnasio}, {tope.lider}
          </span>
        </p>
      )}

      {ranuras.length === 0 && motivo ? (
        <p className="equipo__vacio">{motivo}</p>
      ) : (
        <ul className="equipo__lista">
          {huecos.map((pokemon, i) =>
            pokemon ? (
              // La personalidad no cambia nunca, asi que cambiar dos Pokemon de
              // sitio mueve la ficha en vez de rehacerla.
              <Ficha
                key={pokemon.personalidad}
                pokemon={pokemon}
                especies={especies}
                generacion={generacion}
                activo={activo !== null && activo === pokemon.personalidad}
                parejaRota={
                  caidosDelOtro !== undefined && parejaCaida(pokemon.mote, caidosDelOtro)
                }
                tope={tope}
              />
            ) : (
              <li key={`hueco-${i}`} className="ficha ficha--hueco" aria-hidden="true" />
            ),
          )}
        </ul>
      )}
    </aside>
  );
};

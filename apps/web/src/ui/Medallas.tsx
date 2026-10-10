// Las ocho medallas de la region.
//
// Las conseguidas a color y las que faltan apagadas, con el borde punteado. La
// gracia de ensenar tambien las que faltan es que asi se ve de un vistazo hasta
// donde llegaste, que es de lo que va el cartel de fin de partida: un "4 de 8"
// dice mucho mas que un "4".
//
// Y SE ENSENAN SIEMPRE, aunque no se sepa cuales. Antes, cuando no se podian
// leer, aqui no salia nada: quien moria al principio -sin haber guardado nunca
// dentro del juego, que es de donde se leen- se encontraba un cartel de fin de
// partida sin medallas, como si esa parte del juego no existiera. Las ocho
// casillas tienen que estar, porque las que faltan son justo lo que cuenta la
// historia.
//
// Lo que NO se hace es poner un numero que no se sabe. Ensenar "0 de 8" a quien
// consiguio cuatro y no habia guardado seria mentir, asi que en ese caso se
// ensenan las ocho apagadas y se dice por que no hay cuenta.
//
// Las imagenes salen del repositorio de PokeAPI (ver `Sprite.tsx`, que explica
// por que de ahi y no de otro sitio). Las que faltan se apagan con un filtro en
// vez de con otra imagen: asi es literalmente la misma medalla sin color, que
// se lee como "esta, pero no la tienes".

import { TOTAL_MEDALLAS } from '@emupoke/pokemon';
import { SpriteMedalla } from './Sprite';

type Props = {
  /**
   * Cuales estan conseguidas.
   *
   * Vacio significa que no se han podido leer, que no es lo mismo que ninguna:
   * las ocho se ensenan igual, pero sin cuenta y diciendolo.
   */
  conseguidas: readonly boolean[];
};

/**
 * Los nombres de las ocho de Kanto, en orden.
 *
 * Van aqui y no en el paquete de dominio porque son solo una etiqueta para el
 * jugador: lo que se lee de la partida es un bit, no un nombre.
 */
const NOMBRES = [
  'Roca',
  'Cascada',
  'Trueno',
  'Arcoíris',
  'Alma',
  'Pantano',
  'Volcán',
  'Tierra',
] as const;

export const Medallas = ({ conseguidas }: Props) => {
  const sabidas = conseguidas.length > 0;
  const cuantas = conseguidas.filter(Boolean).length;

  return (
    <section className="tarjeta">
      <div className="tarjeta__titulo">
        <span className="tarjeta__marca" />
        <h2>Medallas</h2>
        <div className="tarjeta__accion">
          <span className="cuenta">
            {sabidas ? `${cuantas} de ${TOTAL_MEDALLAS}` : `— de ${TOTAL_MEDALLAS}`}
          </span>
        </div>
      </div>

      <ul className="medallas">
        {Array.from({ length: TOTAL_MEDALLAS }, (_, i) => {
          const tiene = conseguidas[i] === true;
          const nombre = NOMBRES[i] ?? `Medalla ${i + 1}`;
          return (
            <li
              key={i}
              className={`medalla${tiene ? ' medalla--tiene' : ''}`}
              title={sabidas ? `${nombre}${tiene ? '' : ' — te faltó'}` : nombre}
            >
              <SpriteMedalla numero={i + 1} nombre={nombre} />
              <span className="medalla__nombre">{nombre}</span>
              {/* El color por si solo no vale: quien no lo distinga necesita
                  que lo ponga, y quien use lector de pantalla tambien. */}
              <span className="visually-hidden">
                {sabidas ? (tiene ? 'conseguida' : 'te faltó') : 'no se sabe'}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Las medallas se leen del fichero de guardado, no de la memoria (ver
          `medallas.ts`), asi que una partida en la que nunca se guardo dentro
          del juego no tiene ninguna que leer. Decirlo es lo que distingue "no
          conseguiste ninguna" de "no lo se". */}
      {!sabidas && (
        <p className="hint">
          No sé cuáles conseguiste: se leen de tu partida guardada, y en esta no había ninguna
          guardada todavía.
        </p>
      )}
    </section>
  );
};

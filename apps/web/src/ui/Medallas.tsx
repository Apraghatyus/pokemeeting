// Las ocho medallas de la region.
//
// Las conseguidas a color y las que faltan apagadas, con el borde punteado. La
// gracia de ensenar tambien las que faltan es que asi se ve de un vistazo hasta
// donde llegaste, que es de lo que va el cartel de fin de partida: un "4 de 8"
// dice mucho mas que un "4".
//
// Las imagenes salen del repositorio de PokeAPI (ver `Sprite.tsx`, que explica
// por que de ahi y no de otro sitio). Las que faltan se apagan con un filtro en
// vez de con otra imagen: asi es literalmente la misma medalla sin color, que
// se lee como "esta, pero no la tienes".

import { TOTAL_MEDALLAS } from '@emupoke/pokemon';
import { SpriteMedalla } from './Sprite';

type Props = {
  /** Cuales estan conseguidas. Vacio significa que no se ha podido leer. */
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
  if (conseguidas.length === 0) return null;

  const cuantas = conseguidas.filter(Boolean).length;

  return (
    <section className="tarjeta">
      <div className="tarjeta__titulo">
        <span className="tarjeta__marca" />
        <h2>Medallas</h2>
        <div className="tarjeta__accion">
          <span className="cuenta">
            {cuantas} de {TOTAL_MEDALLAS}
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
              title={`${nombre}${tiene ? '' : ' — te faltó'}`}
            >
              <SpriteMedalla numero={i + 1} nombre={nombre} />
              <span className="medalla__nombre">{nombre}</span>
              {/* El color por si solo no vale: quien no lo distinga necesita
                  que lo ponga, y quien use lector de pantalla tambien. */}
              <span className="visually-hidden">{tiene ? 'conseguida' : 'te faltó'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

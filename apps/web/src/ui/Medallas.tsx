// Las ocho medallas de la región.
//
// Las conseguidas a color y las que faltan apagadas, con el borde punteado. La
// gracia de enseñar también las que faltan es que así se ve de un vistazo hasta
// dónde llegaste, que es de lo que va la pantalla de fin de partida: un "4 de 8"
// dice mucho más que un "4".

import { TOTAL_MEDALLAS } from '@emupoke/pokemon';

type Props = {
  /** Cuáles están conseguidas. Vacío significa que no se ha podido leer. */
  conseguidas: readonly boolean[];
};

/**
 * Los nombres de las ocho de Kanto, en orden.
 *
 * Van aquí y no en el paquete de dominio porque son solo una etiqueta para el
 * jugador: lo que se lee de la partida es un bit, no un nombre.
 */
const NOMBRES = [
  'Roca',
  'Cascada',
  'Trueno',
  'Arcoiris',
  'Alma',
  'Pantano',
  'Volcan',
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
          return (
            <li
              key={i}
              className={`medalla${tiene ? ' medalla--tiene' : ''}`}
              title={`${NOMBRES[i]}${tiene ? '' : ' — te faltó'}`}
            >
              <span className="medalla__marca" aria-hidden="true" />
              <span className="medalla__nombre">{NOMBRES[i]}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

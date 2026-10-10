// Las ocho medallas de la region.
//
// Las conseguidas a color y las que faltan apagadas, con el borde punteado. La
// gracia de ensenar tambien las que faltan es que asi se ve de un vistazo hasta
// donde llegaste: un "4 de 8" dice mucho mas que un "4".
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
// SE USA EN DOS SITIOS Y ES EL MISMO COMPONENTE a proposito: la tira que va
// sobre la partida mientras se juega y la tarjeta del cartel de fin. Lo que
// tienen en comun es justo lo que no puede desajustarse -cuales estan
// conseguidas y como se ve eso- y lo unico que cambia es el envoltorio.
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
  /**
   * El nivel mas alto del lider de cada gimnasio, leido de la ROM.
   *
   * Va debajo de su medalla, que es donde significa algo: puesto en fila con
   * las ocho se ve de un golpe por donde va la partida y lo que queda por
   * delante. Null -o sin pasarlo- y no se ensena ningun numero, porque en una
   * copia aleatorizada los de siempre serian mentira.
   */
  topes?: readonly number[] | null;
  /**
   * 'tarjeta' para el cartel de fin; 'tira' para la que va sobre la partida.
   *
   * La tira no lleva ni titulo ni cuenta: mientras se juega, lo que hace falta
   * es un vistazo, no un informe.
   */
  variante?: 'tarjeta' | 'tira';
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

/** La fila de ocho. Es lo unico que comparten las dos variantes, y lo que importa. */
const Fila = ({
  conseguidas,
  topes,
  conNombre,
}: {
  conseguidas: readonly boolean[];
  topes?: readonly number[] | null;
  conNombre: boolean;
}) => {
  const sabidas = conseguidas.length > 0;
  // El primero que falta es el que toca. Se marca para que el ojo vaya ahi:
  // entre ocho medallas apagadas todas iguales, la siguiente no se distingue.
  const siguiente = sabidas ? conseguidas.findIndex((c) => !c) : -1;

  return (
    <ul className="medallas">
      {Array.from({ length: TOTAL_MEDALLAS }, (_, i) => {
        const tiene = conseguidas[i] === true;
        const nombre = NOMBRES[i] ?? `Medalla ${i + 1}`;
        const tope = topes?.[i] ?? null;
        const clases = [
          'medalla',
          tiene ? 'medalla--tiene' : '',
          i === siguiente ? 'medalla--siguiente' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <li
            key={i}
            className={clases}
            title={
              [
                nombre,
                sabidas ? (tiene ? 'conseguida' : 'te falta') : null,
                tope !== null ? `su líder llega a Nv.${tope}` : null,
              ]
                .filter(Boolean)
                .join(' — ')
            }
          >
            <SpriteMedalla numero={i + 1} nombre={nombre} />
            {conNombre && <span className="medalla__nombre">{nombre}</span>}
            {/* El tope del gimnasio, debajo de su medalla. Es la regla de la
                comunidad -no subir por encima del lider que toca- puesta donde
                se puede mirar de reojo sin abrir nada. */}
            {tope !== null && <span className="medalla__tope">Nv.{tope}</span>}
            {/* El color por si solo no vale: quien no lo distinga necesita que
                lo ponga, y quien use lector de pantalla tambien. */}
            <span className="visually-hidden">
              {sabidas ? (tiene ? 'conseguida' : 'te falta') : 'no se sabe'}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export const Medallas = ({ conseguidas, topes = null, variante = 'tarjeta' }: Props) => {
  const sabidas = conseguidas.length > 0;
  const cuantas = conseguidas.filter(Boolean).length;

  if (variante === 'tira') {
    return (
      <div
        className={`medallas-tira${sabidas ? '' : ' medallas-tira--sin-saber'}`}
        aria-label={
          sabidas
            ? `Medallas: ${cuantas} de ${TOTAL_MEDALLAS}`
            : 'Medallas: todavia no se sabe cuales llevas'
        }
        /* Apagadas por no tenerlas y apagadas por no saberlo se ven igual, y no
           es lo mismo. Aqui no cabe una frase como en el cartel de fin, asi que
           la tira entera baja de tono y lo dice al pasar por encima. */
        title={
          sabidas
            ? undefined
            : 'Todavia no se cuales llevas: se leen de tu partida guardada, y en esta no hay ninguna guardada aun.'
        }
      >
        <Fila conseguidas={conseguidas} topes={topes} conNombre={false} />
      </div>
    );
  }

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

      <Fila conseguidas={conseguidas} topes={topes} conNombre />

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

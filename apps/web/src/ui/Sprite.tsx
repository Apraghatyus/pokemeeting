// De donde salen las imagenes, y como se piden sin romper la pagina.
//
// Esto vivia dentro del panel de equipo. Se saca aqui porque ahora lo usan tres
// sitios -el panel, el cartel de fin de partida y las medallas- y porque la
// restriccion que lo condiciona no es de ninguno de ellos, es de la pagina
// entera.
//
// LA RESTRICCION: esta pagina corre con aislamiento cross-origin, que es lo que
// el emulador necesita para poder usar memoria compartida. A cambio, el
// navegador **bloquea cualquier imagen de fuera que no mande**
// `Cross-Origin-Resource-Policy`. No es configurable desde aqui: o lo manda el
// servidor de la imagen, o la imagen no se ve.
//
// Por eso la coleccion no se elige por gusto. Se probaron las dos candidatas:
//
//   - El repositorio de PokeAPI manda la cabecera. Sirve.
//   - Pokemon Showdown, que tiene ademas retratos de entrenador y pegaria mejor
//     con el estilo, NO la manda. Queda descartado entero, retratos incluidos.
//
// No se descarga ni se guarda nada: son etiquetas de imagen normales y el
// navegador las cachea solo. Y si no hay internet, cada una tiene su plan B,
// porque sin internet tambien se juega.

import { useState } from 'react';

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';

/** El juego de sprites que mejor pega con cada generacion. */
const COLECCION: Readonly<Record<number, string>> = {
  2: 'versions/generation-ii/crystal',
  3: 'versions/generation-iii/firered-leafgreen',
};

/**
 * Una imagen que se rinde con elegancia.
 *
 * Prueba una lista de direcciones en orden y, si se acaban, pinta lo que se le
 * pase de respaldo. Asi la pagina se ve igual de bien sin conexion.
 */
const ConRespaldo = ({
  candidatas,
  respaldo,
  className,
  alt = '',
}: {
  candidatas: readonly string[];
  respaldo: React.ReactNode;
  className: string;
  alt?: string;
}) => {
  const [intento, setIntento] = useState(0);

  if (intento >= candidatas.length) return <>{respaldo}</>;

  return (
    <img
      className={className}
      src={candidatas[intento]}
      onError={() => setIntento((n) => n + 1)}
      alt={alt}
      aria-hidden={alt === '' ? true : undefined}
      loading="lazy"
      draggable={false}
    />
  );
};

/**
 * El sprite de una especie, con su plan B.
 *
 * Se intenta primero la coleccion de la generacion que se esta jugando, para
 * que se vea como en el juego; si esa especie no esta ahi, la general; y si
 * tampoco, el circulo con las dos letras de siempre.
 */
export const SpriteEspecie = ({
  nacional,
  generacion,
  inicial,
  tonoDe,
  className = 'ficha__sprite',
}: {
  /** Numero en la Pokedex nacional. 0 significa que no se sabe cual es. */
  nacional: number;
  generacion: number;
  inicial: string;
  tonoDe: number;
  className?: string;
}) => {
  const candidatas =
    nacional > 0
      ? [
          COLECCION[generacion] ? `${BASE}/pokemon/${COLECCION[generacion]}/${nacional}.png` : null,
          `${BASE}/pokemon/${nacional}.png`,
        ].filter((url): url is string => url !== null)
      : [];

  return (
    <ConRespaldo
      candidatas={candidatas}
      className={`${className} ${className}--imagen`}
      respaldo={
        <span
          className={className}
          style={{ '--tono': tonoDe } as React.CSSProperties}
          aria-hidden="true"
        >
          {inicial}
        </span>
      }
    />
  );
};

/**
 * La imagen de una medalla.
 *
 * Las ocho de Kanto son las ocho primeras del repositorio, en el mismo orden en
 * que se ganan. No se dio por supuesto: se descargaron y se miraron una a una.
 * La 1 es la gema gris de Roca, la 2 la gota de Cascada, la 5 el corazon rosa
 * de Alma y la 8 la hoja verde de Tierra; la 9 ya es un ala, que es la primera
 * de Johto. O sea que el tramo 1-8 es exactamente Kanto y en orden de gimnasio,
 * que es tambien el orden en que el juego enciende los bits.
 */
export const SpriteMedalla = ({
  numero,
  nombre,
}: {
  /** 1 a 8, en orden de gimnasio. */
  numero: number;
  nombre: string;
}) => (
  <ConRespaldo
    candidatas={[`${BASE}/badges/${numero}.png`]}
    className="medalla__imagen"
    alt={nombre}
    respaldo={<span className="medalla__marca" aria-hidden="true" />}
  />
);

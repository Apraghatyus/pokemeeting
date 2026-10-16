// El mapa de rutas: que zonas estan gastadas y donde anda cada uno.
//
// Es un esquema y no el mapa del juego -ver `zonas.ts`-: cada zona es un punto
// unido a sus vecinas. Lo que importa se lee de un vistazo: en que zonas ya se
// capturo (y quien), y en cual esta cada jugador ahora mismo. Lo que no cabe en
// el esquema -las Islas Sete, los sitios bajo el agua- va en una lista debajo.

import { useState } from 'react';
import { Modal } from './Modal';
import {
  ESQUEMAS,
  NOMBRE_REGION,
  nombreDeZona,
  regionDe,
  type PuntoDelMapa,
} from '../core/zonas';

type Props = {
  open: boolean;
  onClose: () => void;
  codigoJuego: string | null;
  /** Donde esta este jugador, o null si no se sabe. */
  zonaMia: number | null;
  gastadasMias: readonly number[];
  /** Que Pokemon del equipo salio de cada zona, para decirlo. */
  capturasMias: ReadonlyMap<number, string>;
  /**
   * Y que salvaje fue la OPORTUNIDAD de cada zona, capturado o no.
   *
   * Es lo que explica una zona gastada en la que no tienes nada: ahi salio ese
   * y se quedo sin capturar.
   */
  encuentrosMios: ReadonlyMap<number, string>;
  /** Del companero, si hay. Null si no hay nadie o todavia no lo ha dicho. */
  zonaSuya: number | null;
  gastadasSuyas: readonly number[] | null;
  nombreSuyo: string;
};

/** Cuanto mide una unidad del esquema, en pixeles del dibujo. */
const ESCALA = 28;

type Estado = 'libre' | 'mia' | 'suya' | 'ambas';

const estadoDe = (zona: number, mias: ReadonlySet<number>, suyas: ReadonlySet<number>): Estado =>
  mias.has(zona) && suyas.has(zona)
    ? 'ambas'
    : mias.has(zona)
      ? 'mia'
      : suyas.has(zona)
        ? 'suya'
        : 'libre';

/** El numero corto que va dentro del punto de una ruta. */
const etiquetaCorta = (punto: PuntoDelMapa): string => {
  const nombre = nombreDeZona(punto.zona);
  return punto.tipo === 'ruta' ? nombre.replace('Ruta ', '') : '';
};

export const MapaModal = ({
  open,
  onClose,
  codigoJuego,
  zonaMia,
  gastadasMias,
  capturasMias,
  encuentrosMios,
  zonaSuya,
  gastadasSuyas,
  nombreSuyo,
}: Props) => {
  const [elegida, setElegida] = useState<number | null>(null);
  const region = regionDe(codigoJuego);
  const mias = new Set(gastadasMias);
  const suyas = new Set(gastadasSuyas ?? []);
  const conCompanero = gastadasSuyas !== null;

  if (!region) {
    return (
      <Modal open={open} onClose={onClose} icon="🗺" title="Mapa de rutas">
        <p className="hint">
          El mapa es de los juegos de tercera generación: Rojo Fuego, Verde Hoja, Rubí, Zafiro y
          Esmeralda.
        </p>
      </Modal>
    );
  }

  const esquema = ESQUEMAS[region];
  const posicion = new Map(esquema.puntos.map((p) => [p.zona, p]));
  const enfocada = elegida ?? zonaMia;

  const describir = (zona: number): string => {
    const estado = estadoDe(zona, mias, suyas);
    const quien = capturasMias.get(zona);
    const salio = encuentrosMios.get(zona);
    if (estado === 'libre') return 'Libre: aquí todavía se puede capturar.';
    if (estado === 'mia') {
      // Lo primero, lo que se tiene; si no se tiene nada, el que salio y se
      // perdio, que es justo lo que uno quiere recordar de una ruta gastada.
      if (quien) return `Gastada por ${quien}: ya capturaste aquí.`;
      return salio
        ? `Gastada: tu encuentro aquí fue ${salio} y no lo tienes.`
        : 'Gastada: ya tuviste tu encuentro aquí.';
    }
    if (estado === 'suya') return `Gastada por ${nombreSuyo}.`;
    return `Gastada por los dos${quien ? ` (tu ${quien})` : salio ? ` (el tuyo fue ${salio})` : ''}.`;
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="🗺"
      title={`Mapa de ${NOMBRE_REGION[region]}`}
      subtitle="Rutas gastadas · Dónde está cada uno"
    >
      <div className="mapa">
        {/* Lo primero, donde estas y si ahi se puede capturar: es la pregunta
            que se hace al entrar en la hierba. */}
        <div className="mapa__aqui" role="status">
          {enfocada === null ? (
            <span>
              Todavía no se sabe en qué zona estás. Se lee de la partida cada pocos segundos.
            </span>
          ) : (
            <>
              <strong>
                {elegida === null ? 'Estás en ' : ''}
                {nombreDeZona(enfocada)}
              </strong>
              <span className={`mapa__estado mapa__estado--${estadoDe(enfocada, mias, suyas)}`}>
                {describir(enfocada)}
              </span>
              {elegida !== null && (
                <button type="button" className="mapa__volver" onClick={() => setElegida(null)}>
                  Volver a donde estás
                </button>
              )}
            </>
          )}
        </div>

        <div className="mapa__lienzo">
          <svg
            viewBox={`${-ESCALA} ${-ESCALA} ${(esquema.ancho + 2) * ESCALA} ${(esquema.alto + 2) * ESCALA}`}
            role="img"
            aria-label={`Esquema de ${NOMBRE_REGION[region]}`}
          >
            {esquema.caminos.map(([a, b]) => {
              const desde = posicion.get(a);
              const hasta = posicion.get(b);
              if (!desde || !hasta) return null;
              return (
                <line
                  key={`${a}-${b}`}
                  className="mapa__camino"
                  x1={desde.x * ESCALA}
                  y1={desde.y * ESCALA}
                  x2={hasta.x * ESCALA}
                  y2={hasta.y * ESCALA}
                />
              );
            })}

            {esquema.puntos.map((punto) => {
              const estado = estadoDe(punto.zona, mias, suyas);
              const x = punto.x * ESCALA;
              const y = punto.y * ESCALA;
              const clase = `mapa__punto mapa__punto--${punto.tipo} mapa__punto--${estado}${
                enfocada === punto.zona ? ' is-enfocada' : ''
              }`;
              return (
                <g
                  key={punto.zona}
                  className={clase}
                  onClick={() => setElegida(punto.zona)}
                  role="button"
                  aria-label={`${nombreDeZona(punto.zona)}: ${describir(punto.zona)}`}
                >
                  <title>{`${nombreDeZona(punto.zona)} — ${describir(punto.zona)}`}</title>
                  {punto.tipo === 'ciudad' ? (
                    <rect x={x - 11} y={y - 11} width={22} height={22} rx={5} />
                  ) : punto.tipo === 'lugar' ? (
                    <rect x={x - 8} y={y - 8} width={16} height={16} rx={2} transform={`rotate(45 ${x} ${y})`} />
                  ) : (
                    <circle cx={x} cy={y} r={10} />
                  )}
                  {punto.tipo === 'ruta' && (
                    <text x={x} y={y + 3.5} className="mapa__numero">
                      {etiquetaCorta(punto)}
                    </text>
                  )}
                  {punto.tipo === 'ciudad' && (
                    <text x={x} y={y + 24} className="mapa__nombre">
                      {nombreDeZona(punto.zona).replace(/^(Ciudad|Pueblo|Isla) /, '')}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Donde esta cada uno, encima de todo. */}
            {[
              { zona: zonaSuya, clase: 'suya', texto: nombreSuyo.slice(0, 10) },
              { zona: zonaMia, clase: 'mia', texto: 'Tú' },
            ].map(({ zona, clase, texto }) => {
              const punto = zona === null ? undefined : posicion.get(zona);
              if (!punto) return null;
              const desplazar = clase === 'suya' && zonaSuya === zonaMia ? 16 : 0;
              const x = punto.x * ESCALA + desplazar;
              const y = punto.y * ESCALA;
              return (
                <g key={clase} className={`mapa__jugador mapa__jugador--${clase}`}>
                  <circle cx={x} cy={y} r={16} />
                  <text x={x} y={y - 22}>
                    {texto}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <ul className="mapa__leyenda">
          <li>
            <span className="mapa__muestra mapa__muestra--libre" /> Libre
          </li>
          <li>
            <span className="mapa__muestra mapa__muestra--mia" /> Gastada por ti
          </li>
          {conCompanero && (
            <>
              <li>
                <span className="mapa__muestra mapa__muestra--suya" /> Gastada por {nombreSuyo}
              </li>
              <li>
                <span className="mapa__muestra mapa__muestra--ambas" /> Por los dos
              </li>
            </>
          )}
        </ul>

        {/* Lo que no cabe en el esquema, en lista. */}
        {/* Plegada salvo que uno de los dos este en una de ellas: es una lista
            larga y casi siempre se juega en el esquema. */}
        <details
          className="mapa__aparte"
          open={esquema.aparte.some((zona) => zona === zonaMia || zona === zonaSuya)}
        >
          <summary>
            {region === 'kanto' ? 'Islas Sete' : 'Otros lugares'} ·{' '}
            {esquema.aparte.filter((zona) => mias.has(zona) || suyas.has(zona)).length} gastadas
            de {esquema.aparte.length}
          </summary>
          <div className="mapa__chips">
            {esquema.aparte.map((zona) => {
              const estado = estadoDe(zona, mias, suyas);
              const aqui = zona === zonaMia ? ' is-aqui' : '';
              const alli = zona === zonaSuya ? ' is-alli' : '';
              return (
                <button
                  type="button"
                  key={zona}
                  className={`mapa__chip mapa__chip--${estado}${aqui}${alli}`}
                  onClick={() => setElegida(zona)}
                  title={describir(zona)}
                >
                  {nombreDeZona(zona)}
                </button>
              );
            })}
          </div>
        </details>

        <p className="hint">
          Es un esquema, no el mapa del juego. En Nuzlocke una zona se gasta con el PRIMER
          ENCUENTRO: salga lo que salga, es tu única oportunidad ahí, y la zona sigue gastada
          aunque se escape, lo tumbes o ese Pokémon se libere o caiga después.
        </p>
      </div>
    </Modal>
  );
};

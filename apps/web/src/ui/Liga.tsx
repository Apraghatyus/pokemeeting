// El Alto Mando, para el cartel de fin de partida.
//
// SOBRE LOS RETRATOS, que es lo primero que se pregunta todo el mundo: no los
// hay. Se buscaron y la conclusion es que no se pueden usar, no que no se haya
// mirado:
//
//   - El repositorio de PokeAPI tiene medallas, objetos, tipos y Pokemon. De
//     entrenadores no tiene nada.
//   - Pokemon Showdown si tiene retratos de entrenador, y ademas buenos. Pero
//     no manda `Cross-Origin-Resource-Policy`, y esta pagina corre aislada por
//     el emulador, asi que el navegador los bloquea. Se comprobaron las
//     cabeceras: no es que fallen a veces, es que no se ven nunca.
//
// Se penso en poner el Pokemon estrella de cada uno -el Lapras de Lorelei, el
// Dragonite de Lance- y se descarto, porque este programa es sobre todo para
// partidas aleatorizadas: ahi el Alto Mando lleva otra cosa, y el dibujo
// estaria diciendo algo falso. Asi que van con su numero, que es lo que hacia
// tambien el boceto.
//
// Quien SI se puede ensenar con su cara es el que te gano, y eso se hace en el
// cartel: el equipo rival se lee de la memoria de tu propia partida, asi que
// sale el de verdad, aleatorizado o no.

/** Como va cada miembro del Alto Mando. */
export type PasoLiga = 'derrotado' | 'aqui' | 'bloqueado';

/**
 * Los cinco, en orden, con el participio en su genero.
 *
 * El genero va en los datos y no en la plantilla porque en castellano no hay
 * forma de salir del paso con una sola palabra.
 */
const MIEMBROS = [
  { nombre: 'Lorelei', vencida: 'Derrotada' },
  { nombre: 'Bruno', vencida: 'Derrotado' },
  { nombre: 'Agatha', vencida: 'Derrotada' },
  { nombre: 'Lance', vencida: 'Derrotado' },
  { nombre: 'Campeón', vencida: 'Derrotado' },
] as const;

export const TOTAL_LIGA = MIEMBROS.length;

type Props = {
  /**
   * Como esta cada uno de los cinco.
   *
   * Vacio significa que de esta partida no se sabe, y entonces no se ensena
   * nada: un marcador a cero para quien llego al Campeon miente mas que
   * callarse. Es la misma regla que con las medallas.
   */
  pasos: readonly PasoLiga[];
};

const ETIQUETA: Readonly<Record<PasoLiga, string>> = {
  derrotado: '',
  aqui: 'Caíste aquí',
  bloqueado: 'Bloqueado',
};

export const Liga = ({ pasos }: Props) => {
  if (pasos.length === 0) return null;

  const hechos = pasos.filter((p) => p === 'derrotado').length;

  return (
    <section className="tarjeta">
      <div className="tarjeta__titulo">
        <span className="tarjeta__marca" />
        <h2>Liga Pokémon</h2>
        <div className="tarjeta__accion">
          <span className="cuenta">
            {hechos} de {TOTAL_LIGA}
          </span>
        </div>
      </div>

      <ol className="liga">
        {MIEMBROS.map((miembro, i) => {
          const paso = pasos[i] ?? 'bloqueado';
          return (
            <li key={miembro.nombre} className={`liga__paso liga__paso--${paso}`}>
              <span className="liga__numero" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="liga__nombre">{miembro.nombre}</span>
              <span className="liga__estado">
                {paso === 'derrotado' ? miembro.vencida : ETIQUETA[paso]}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

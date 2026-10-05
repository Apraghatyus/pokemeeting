// El cartel de fin de partida.
//
// Sale cuando se te cae el equipo entero, que en una Nuzlocke o un Soul Link es
// el final del reto aunque el juego siga.
//
// Tiene dos salidas y no son equivalentes, por eso se dicen con esas palabras:
// reiniciar empieza de cero, y seguir jugando sigue la partida pero ya **fuera
// de concurso**. Esa diferencia hay que decirla aquí y no esconderla en los
// ajustes, porque es lo que decide si la partida cuenta.

import type { EquipoResumen } from '@emupoke/protocol';
import type { Especies } from '../core/useEspecies';
import { Modal } from './Modal';

type Props = {
  open: boolean;
  equipo: EquipoResumen | null;
  especies: Especies;
  /** Como se llama la partida, si es una aleatorizada con nombre. */
  nombrePartida: string | null;
  onContinuar: () => void;
  onReiniciar: () => void;
  onDescartar: () => void;
};

export const FinModal = ({
  open,
  equipo,
  especies,
  nombrePartida,
  onContinuar,
  onReiniciar,
  onDescartar,
}: Props) => {
  const caidos = (equipo?.ranuras ?? []).filter((r) => !r.huevo);
  const mayorNivel = caidos.reduce((alto, r) => Math.max(alto, r.nivel), 0);

  return (
    <Modal
      open={open}
      onClose={onDescartar}
      icon="✖"
      title="Se acabó el reto"
      subtitle={nombrePartida ?? 'Se te cayó el equipo entero'}
    >
      <div className="fin">
        <p className="fin__resumen">
          Tu equipo ha caído al completo. En una Nuzlocke eso es el final:{' '}
          <strong>el juego te deja seguir, pero el reto se acaba aquí.</strong>
        </p>

        {caidos.length > 0 && (
          <section className="tarjeta">
            <div className="tarjeta__titulo">
              <span className="tarjeta__marca" />
              <h2>Hasta aquí llegaste</h2>
              <div className="tarjeta__accion">
                <span className="cuenta">
                  {caidos.length} {caidos.length === 1 ? 'Pokemon' : 'Pokemon'} · Nv. máx{' '}
                  {mayorNivel}
                </span>
              </div>
            </div>

            <ul className="fin__equipo">
              {caidos.map((ranura) => (
                <li key={ranura.personalidad}>
                  <span className="fin__mote">{ranura.mote || especies.nombre(ranura.especie)}</span>
                  <span className="fin__nivel">Nv.{ranura.nivel}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Las medallas y el avance en la Liga irian aqui. Todavia no se leen de
            la memoria, y enseñar un marcador vacio o inventado seria peor que no
            enseñar nada: ver docs/ideas-pendientes.md. */}

        <div className="fin__salidas">
          <button type="button" className="button--primary button--wide" onClick={onReiniciar}>
            Empezar de nuevo
          </button>
          <button type="button" className="button--wide" onClick={onContinuar}>
            Seguir jugando
          </button>
        </div>

        <p className="hint">
          Si sigues, la partida continúa donde estaba, pero <strong>ya no cuenta</strong>: lo que
          consigas a partir de aquí no entrará en las estadísticas. Si el cartel ha salido por
          error, ciérralo con la ✕ y no se da nada por terminado.
        </p>
      </div>
    </Modal>
  );
};

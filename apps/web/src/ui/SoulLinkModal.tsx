// La pregunta de si la partida que se empieza juntos es una Soul Link.
//
// Sale al entrar el companero cuando la partida esta empezando: todavia no hay
// medallas y como mucho llevas el inicial. Despues ya no se ofrece, porque una
// Soul Link empieza con las parejas desde la primera captura, y a mitad de
// partida no habria forma de saber quien va con quien.

import { Modal } from './Modal';

type Props = {
  open: boolean;
  nombreDelCompanero: string;
  onElegir: (soullink: boolean) => void;
};

export const SoulLinkModal = ({ open, nombreDelCompanero, onElegir }: Props) => (
  // Cerrarlo sin elegir es elegir que no: no se puede quedar a medias.
  <Modal open={open} onClose={() => onElegir(false)} icon="🔗" title="¿Hacerla Soul Link?">
    <div className="soullink-pregunta">
      <p>
        {nombreDelCompanero} ha entrado en tu partida y estáis empezando. Podéis jugarla como{' '}
        <strong>Soul Link</strong>:
      </p>
      <ul>
        <li>Cada captura va en pareja con la del otro en la misma zona, y se les pone el mismo mote.</li>
        <li>Si cae uno, su pareja también está muerta, aunque en su partida siga en pie.</li>
        <li>Cuenta en el ranking de Soul Link, no en el de jugar solo.</li>
      </ul>
      <p className="hint">
        Se elige ahora y vale para las dos partidas. Después no se cambia.
      </p>
      <div className="soullink-pregunta__acciones">
        <button type="button" onClick={() => onElegir(false)}>
          No, solo jugar juntos
        </button>
        <button type="button" className="button--primary" onClick={() => onElegir(true)}>
          Sí, Soul Link
        </button>
      </div>
    </div>
  </Modal>
);

// Ponerle otro mote a un Pokemon del equipo.
//
// En una Soul Link se le pone el mismo a su pareja en la partida del otro: las
// parejas se reconocen por el mote, y si solo cambiara uno la pareja se romperia
// sin que nadie se enterara.

import { useEffect, useState } from 'react';
import { LARGO_MOTE } from '@emupoke/pokemon';
import { Modal } from './Modal';

type Props = {
  /** El Pokemon al que se le cambia, o null con la ventana cerrada. */
  pokemon: { mote: string; nombreEspecie: string } | null;
  /** Si hay pareja en la partida del companero a la que cambiarselo tambien. */
  conPareja: string | null;
  onCerrar: () => void;
  /** Devuelve el fallo, o null si se cambio. */
  onCambiar: (nuevo: string) => string | null;
};

export const MoteModal = ({ pokemon, conPareja, onCerrar, onCambiar }: Props) => {
  const [texto, setTexto] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    setTexto(pokemon?.mote ?? '');
    setFallo(null);
  }, [pokemon]);

  const guardar = () => {
    const problema = onCambiar(texto);
    if (problema) setFallo(problema);
    else onCerrar();
  };

  return (
    <Modal open={pokemon !== null} onClose={onCerrar} icon="✎" title="Cambiar el mote">
      <form
        className="mote"
        onSubmit={(evento) => {
          evento.preventDefault();
          guardar();
        }}
      >
        <label className="hecha__nombre">
          <span>{pokemon?.nombreEspecie ?? ''}</span>
          <input
            value={texto}
            maxLength={LARGO_MOTE}
            onChange={(evento) => setTexto(evento.target.value)}
            aria-label="Mote nuevo"
            autoFocus
          />
        </label>
        <p className="hint">
          Hasta {LARGO_MOTE} caracteres. Se escribe dentro de tu partida, como si lo hiciera el
          Tasador de Motes.
          {conPareja && ` También se le cambia a su pareja en la partida de ${conPareja}.`}
        </p>
        {fallo && <p className="alert">{fallo}</p>}
        <div className="soullink-pregunta__acciones">
          <button type="button" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="submit" className="button--primary">
            Cambiar
          </button>
        </div>
      </form>
    </Modal>
  );
};

// Decide solo si hace falta el mando en pantalla.
//
// La pregunta no es "¿que aparato es este?" sino "¿con que esta jugando esta
// persona ahora mismo?", y no son lo mismo. Un portatil con pantalla tactil, un
// tablet con teclado puesto o un movil conectado a un mando responden lo que
// quieras a cualquier pregunta sobre el aparato, y aciertan poco.
//
// Asi que se parte de lo que dice el navegador y se corrige con lo que de
// verdad hace el jugador: si toca la pantalla, sale el mando; si usa el
// teclado, se va. Nada de preguntar ni de listas de dispositivos.
//
// Y en cuanto alguien lo enciende o lo apaga a mano desde el menu, se deja de
// decidir: mandar sobre algo que el jugador acaba de elegir es de las cosas que
// mas molestan de una interfaz.

import { useEffect, useRef, useState } from 'react';

/**
 * Un aparato en el que el mando tiene sentido de entrada.
 *
 * Las dos condiciones juntas, no cualquiera: `pointer: coarse` por si solo
 * tambien lo cumple un portatil con pantalla tactil, donde lo normal es seguir
 * jugando con el teclado. Que ademas no haya forma de pasar el raton por encima
 * es lo que distingue un movil o un tablet de verdad.
 */
const TACTIL = '(pointer: coarse) and (hover: none)';

export type MandoTactil = {
  visible: boolean;
  /** Lo enciende o lo apaga a mano, y deja de decidirse solo. */
  fijar: (visible: boolean) => void;
};

export const useMandoTactil = (): MandoTactil => {
  const [visible, setVisible] = useState(
    () => globalThis.matchMedia?.(TACTIL).matches ?? false,
  );
  /** Mientras nadie lo toque a mano, se sigue decidiendo solo. */
  const automatico = useRef(true);

  useEffect(() => {
    const consulta = globalThis.matchMedia?.(TACTIL);

    // Enchufar un raton a un tablet, o quitarlo, cambia la respuesta.
    const alCambiarElAparato = () => {
      if (automatico.current && consulta) setVisible(consulta.matches);
    };

    // Tocar la pantalla es la señal mas clara que hay de que hace falta.
    const alTocar = () => {
      if (automatico.current) setVisible(true);
    };

    /**
     * Y usar el teclado, la mas clara de que no.
     *
     * Solo cuentan las teclas con las que se juega. Escribir el codigo de una
     * sala en el movil con el teclado en pantalla no deberia hacer desaparecer
     * el mando justo despues.
     */
    const DE_JUGAR = new Set([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'z',
      'x',
      'Z',
      'X',
      'Enter',
      'Backspace',
      'a',
      's',
      'A',
      'S',
    ]);
    const alTeclear = (evento: KeyboardEvent) => {
      if (!automatico.current) return;
      // Escribiendo en un campo no se esta jugando.
      const donde = evento.target as HTMLElement | null;
      if (donde?.closest('input, textarea')) return;
      if (DE_JUGAR.has(evento.key)) setVisible(false);
    };

    consulta?.addEventListener('change', alCambiarElAparato);
    globalThis.addEventListener('touchstart', alTocar, { passive: true });
    globalThis.addEventListener('keydown', alTeclear);

    return () => {
      consulta?.removeEventListener('change', alCambiarElAparato);
      globalThis.removeEventListener('touchstart', alTocar);
      globalThis.removeEventListener('keydown', alTeclear);
    };
  }, []);

  return {
    visible,
    fijar: (quiere: boolean) => {
      automatico.current = false;
      setVisible(quiere);
    },
  };
};

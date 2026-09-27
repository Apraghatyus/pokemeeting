import { useEffect, useState, type RefObject } from 'react';
import type { MgbaModule } from './mgbaCore';

export type KeyboardOwner = 'juego' | 'interfaz';

/**
 * Decide quien manda en el teclado.
 *
 * mGBA engancha los eventos de teclado a nivel de documento a traves de SDL, y
 * se los queda antes de que lleguen a un campo de texto. Sin esto, escribir el
 * codigo de sala mueve al personaje y no escribe nada.
 *
 * La regla es simple: si hay un campo de escritura enfocado, el teclado es de
 * la interfaz; en cuanto se sale, vuelve al juego.
 */

/** Tipos de input que no reciben texto y por tanto no necesitan el teclado. */
const NON_TEXT_INPUTS = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'file',
  'range',
  'color',
  'image',
]);

const isTextEntry = (element: Element | null): boolean => {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') return true;
  if (element.tagName !== 'INPUT') return false;
  return !NON_TEXT_INPUTS.has((element as HTMLInputElement).type);
};

export const useKeyboardOwnership = (
  coreRef: RefObject<MgbaModule | null>,
  /** Fuerza el teclado a la interfaz aunque el foco no este en un campo: con un
   *  modal abierto, las flechas no deben mover al personaje por detras. */
  uiHasFocus = false,
): KeyboardOwner => {
  const [focusInField, setFocusInField] = useState(false);
  const owner: KeyboardOwner = focusInField || uiHasFocus ? 'interfaz' : 'juego';

  useEffect(() => {
    const update = () => setFocusInField(isTextEntry(document.activeElement));

    // focusin y focusout burbujean, asi que un solo par de escuchas en el
    // documento cubre cualquier campo, incluidos los que aun no existen.
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    update();

    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);

  useEffect(() => {
    // Puede que el nucleo aun no este listo cuando cambia el foco; al arrancar
    // queda habilitado por defecto, que es el estado correcto.
    coreRef.current?.toggleInput(owner === 'juego');
  }, [coreRef, owner]);

  return owner;
};

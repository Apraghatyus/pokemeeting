import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Simbolo decorativo de la esquina superior izquierda. */
  icon?: ReactNode;
  children: ReactNode;
};

/**
 * Dialogo modal sobre un elemento <dialog> nativo.
 *
 * Se usa el nativo y no un div flotante porque trae hecho lo que suele
 * olvidarse: atrapar el foco dentro, cerrar con Escape y quedar por encima de
 * todo sin pelearse con el z-index del canvas.
 */
export const Modal = ({ open, onClose, title, subtitle, icon, children }: Props) => {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <div className="modal__head">
        {icon && <span className="modal__icon">{icon}</span>}
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>
      <h2 className="modal__title">{title}</h2>
      {subtitle && <p className="modal__subtitle">{subtitle}</p>}
      <div className="modal__body">{children}</div>
    </dialog>
  );
};

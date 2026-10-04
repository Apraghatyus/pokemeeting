import { useEffect, useRef, type ReactNode } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Simbolo decorativo de la esquina superior izquierda. */
  icon?: ReactNode;
  /** Barra de abajo, para lo que acompaña sin ser una accion. */
  pie?: ReactNode;
  children: ReactNode;
};

/**
 * Dialogo modal sobre un elemento <dialog> nativo.
 *
 * Se usa el nativo y no un div flotante porque trae hecho lo que suele
 * olvidarse: atrapar el foco dentro, cerrar con Escape y quedar por encima de
 * todo sin pelearse con el z-index del canvas.
 */
export const Modal = ({ open, onClose, title, subtitle, icon, pie, children }: Props) => {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      {/* El icono y los titulos van juntos en una fila, no apilados: asi la
          cabecera ocupa un alto y no tres, que es sitio que le hacia falta al
          contenido. */}
      <div className="modal__head">
        <div className="modal__marca">
          {icon && <span className="modal__icon">{icon}</span>}
          <div className="modal__textos">
            <h2 className="modal__title">{title}</h2>
            {subtitle && <p className="modal__subtitle">{subtitle}</p>}
          </div>
        </div>
        <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>
      <div className="modal__body">{children}</div>
      {pie && <div className="modal__pie">{pie}</div>}
    </dialog>
  );
};

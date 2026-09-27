import { useRef, useState } from 'react';
import { acceptedExtensions } from '../core/platforms';

type Props = {
  onRom: (file: File) => void;
  disabled: boolean;
  /** Mensaje de estado mientras el nucleo arranca. */
  hint: string;
};

/**
 * Seleccion de ROM por boton o arrastrando el fichero.
 * La ROM no se sube a ningun sitio: se queda en el navegador del jugador.
 */
export const RomDropZone = ({ onRom, disabled, hint }: Props) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onRom(file);
  };

  return (
    <div
      className={`dropzone${dragging ? ' dropzone--active' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled) take(event.dataTransfer.files);
      }}
    >
      <p className="dropzone__title">Arrastra aqui tu ROM de Pokemon</p>
      <p className="dropzone__hint">{hint}</p>
      <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()}>
        Elegir fichero
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={acceptedExtensions()}
        onChange={(event) => take(event.target.files)}
      />
      <p className="dropzone__legal">
        Tu ROM nunca se envia a internet. Este programa no distribuye juegos: cada jugador usa su
        propia copia.
      </p>
    </div>
  );
};

/** Mensaje bajo el titulo de la zona de carga, segun el estado del nucleo. */
export const RoomDropZoneHint = (status: string): string => {
  switch (status) {
    case 'booting':
      return 'Arrancando el nucleo del emulador...';
    case 'error':
      return 'El nucleo no ha podido arrancar.';
    default:
      return 'Formato admitido: .gba';
  }
};

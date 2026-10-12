// Cuanto ocupa todo esto en el navegador, y cuanto queda.
//
// Cada partida guardada es una ROM entera de 16 MB, mas su guardado. Con tres
// son casi cincuenta megas, y el navegador no avisa a nadie cuando se le acaba
// el sitio: lo que falla es la siguiente escritura, y lo ultimo que se escribe
// suele ser un guardado. Por eso se enseña lo que ocupa y se avisa antes.
//
// Los numeros son los que da el navegador para TODO este sitio, no solo para
// las partidas: incluye el nucleo del emulador en cache y lo demas. Es lo que
// importa, porque el tope es para todo.

import { useEffect, useState } from 'react';

export type Espacio = {
  /** Bytes usados por este sitio. */
  usado: number;
  /** Bytes que el navegador dice que puede usar como mucho. */
  cuota: number;
  /** Si el navegador ha prometido no borrarlo por su cuenta. */
  persistente: boolean;
};

/** A partir de aqui se avisa. Con menos margen ya no cabe otra partida. */
export const AVISO_ESPACIO = 0.8;

/** Lo que ocupa una partida guardada: la copia y algo de guardado. */
export const MB_POR_PARTIDA = 16;

export const leerEspacio = async (): Promise<Espacio | null> => {
  const storage = globalThis.navigator?.storage;
  if (!storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await storage.estimate();
    const persistente = storage.persisted ? await storage.persisted() : false;
    return { usado: usage, cuota: quota, persistente };
  } catch {
    return null;
  }
};

/**
 * Pide al navegador que no borre las partidas por su cuenta.
 *
 * Sin esto, un navegador con poco disco puede vaciar el almacenamiento de un
 * sitio que lleva dias sin abrirse, y con el se irian las copias y los
 * guardados. Se pide al guardar la primera partida, que es cuando hay algo que
 * perder; algunos navegadores lo conceden solos y otros preguntan.
 */
export const pedirQueNoSeBorre = async (): Promise<boolean> => {
  try {
    return (await globalThis.navigator?.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
};

/** "48 MB", "1,2 GB". */
export const enPalabras = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${Math.max(1, Math.round(mb))} MB`;
  return `${(mb / 1024).toLocaleString('es', { maximumFractionDigits: 1 })} GB`;
};

/** Si queda sitio para una partida mas. */
export const cabeOtra = (espacio: Espacio): boolean =>
  espacio.cuota - espacio.usado > MB_POR_PARTIDA * 1024 * 1024 * 1.5;

/** Lo que se ve, releido cada vez que `clave` cambia (al abrir el menu, al borrar...). */
export const useEspacio = (clave: unknown): Espacio | null => {
  const [espacio, setEspacio] = useState<Espacio | null>(null);
  useEffect(() => {
    let vigente = true;
    void leerEspacio().then((e) => {
      if (vigente) setEspacio(e);
    });
    return () => {
      vigente = false;
    };
  }, [clave]);
  return espacio;
};

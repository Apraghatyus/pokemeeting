// Si la pantalla es de las estrechas, las de movil y tablet en vertical.
//
// Se mira el mismo ancho con el que el estilo reordena la pagina, para que las
// dos cosas no puedan discrepar: si el CSS apila y el componente cree que no,
// salen botones que no llevan a ningun sitio.

import { useEffect, useState } from 'react';

export const ESTRECHA = '(max-width: 1100px)';

export const useEsEstrecha = (): boolean => {
  const [estrecha, setEstrecha] = useState(
    () => globalThis.matchMedia?.(ESTRECHA).matches ?? false,
  );

  useEffect(() => {
    const consulta = globalThis.matchMedia?.(ESTRECHA);
    if (!consulta) return;
    const alCambiar = () => setEstrecha(consulta.matches);
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);

  return estrecha;
};

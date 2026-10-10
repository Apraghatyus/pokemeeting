// Si la pagina esta a pantalla completa.
//
// Hace falta en la logica y no solo en el estilo porque a pantalla completa la
// pagina reparte el sitio de otra manera: cabe UNA columna de equipo, no dos, y
// entonces hay que poder cambiar entre el tuyo y el de tu companero. Eso es una
// decision del componente -que equipo pasarle al panel- y el CSS no puede
// tomarla.
//
// Es el mismo caso que `useEsEstrecha`, y por el mismo motivo: si el estilo
// apila y el componente cree que no, salen botones que no llevan a ningun sitio.

import { useEffect, useState } from 'react';

export const usePantallaCompleta = (): boolean => {
  const [completa, setCompleta] = useState(
    () => (globalThis.document?.fullscreenElement ?? null) !== null,
  );

  useEffect(() => {
    const alCambiar = () => setCompleta(document.fullscreenElement !== null);
    document.addEventListener('fullscreenchange', alCambiar);
    // Y una vez al montar, por si ya se entro antes de que esto existiera.
    alCambiar();
    return () => document.removeEventListener('fullscreenchange', alCambiar);
  }, []);

  return completa;
};

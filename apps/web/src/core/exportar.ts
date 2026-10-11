// Llevarse una partida a otro aparato.
//
// Lo que se descarga NO es la ROM: es la semilla -cuatro campos de texto- mas
// el guardado. Quien lo reciba tiene que poner su propia copia del juego, y
// con la semilla se vuelve a generar el mismo mundo byte a byte. Esa es la
// linea del proyecto entero, y es la razon de que esto sea un fichero pequeno
// en vez de una ROM de 16 MB.
//
// Vive aqui y no dentro de un modal porque se usa desde dos: el menu de
// aleatorizar y el de ajustes. Devuelve el problema en texto en vez de
// enseñarlo, porque cada uno lo enseña a su manera.

import { empaquetar, nombreDeFichero } from './paquete';
import type { PartidaGuardada } from './partidas';

/** Descarga la partida. Devuelve que fallo, o null si se descargo. */
export const exportarPartida = (
  partida: PartidaGuardada,
  leerGuardado: (fichero: string) => Uint8Array | null,
): string | null => {
  const sav = leerGuardado(partida.fichero);
  if (!sav) {
    return (
      'Esa partida todavia no tiene guardado. Guarda dentro del juego, desde su propio menu, ' +
      'y vuelve a intentarlo.'
    );
  }
  if (!partida.semilla || !partida.ajustes || !partida.crc32) {
    return 'De esa partida no se guardo la semilla, asi que no se puede rehacer en otro sitio.';
  }

  const bytes = empaquetar({
    semilla: {
      baseCrc32: partida.baseCrc32,
      crc32: partida.crc32,
      semilla: partida.semilla,
      ajustes: partida.ajustes,
    },
    sav,
    nombre: partida.baseNombre,
  });

  const url = URL.createObjectURL(
    new Blob([bytes as BlobPart], { type: 'application/octet-stream' }),
  );
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreDeFichero(partida.baseNombre);
  enlace.click();
  URL.revokeObjectURL(url);
  return null;
};

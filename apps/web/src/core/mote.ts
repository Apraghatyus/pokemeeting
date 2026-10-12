// Cambiarle el mote a un Pokemon desde la pagina, dentro de la partida.
//
// Igual que un intercambio: se saca un estado, se cambia el bloque del Pokemon
// y se vuelve a cargar. Con dos guardas:
//
//   - No en mitad de un combate. Ahi el juego tiene su propia copia del que
//     pelea, y cargar un estado editado en combate es como se rompe una
//     partida.
//   - Solo lo que el juego sabe escribir: diez caracteres de su tabla.
//
// Es una intervencion del emulador, no una mecanica del juego: el Tasador de
// Motes solo cambia los de tus capturas. Por eso aqui tambien solo los tuyos.

import { cambiarMoteEnEstado, codificarTexto, enCombate, leerCabecera, LARGO_MOTE } from '@emupoke/pokemon';
import type { MgbaModule } from './mgbaCore';

/** Ranura de estado para esto. La 1 es del jugador, la 6 del trato, la 8 de mirar y la 9 de exportar. */
const RANURA_MOTE = 7;

/**
 * Le cambia el mote al Pokemon con esa personalidad.
 *
 * Devuelve null si fue bien, o el motivo si no.
 */
export const renombrarEnPartida = (
  core: MgbaModule | null,
  personalidad: number,
  texto: string,
): string | null => {
  const limpio = texto.trim();
  const bytes = codificarTexto(limpio);
  if (!bytes) {
    return `El mote tiene que tener de 1 a ${LARGO_MOTE} caracteres, y solo letras, números, espacios y signos que el juego conozca.`;
  }
  if (!core) return 'No hay ninguna partida en marcha.';
  try {
    const base = core.gameName?.split('/').pop()?.replace(/\.[^.]+$/, '');
    if (!base || !core.saveStateSlot(RANURA_MOTE, 0)) return 'No se ha podido leer la partida.';
    const ruta = `${core.filePaths().saveStatePath}/${base}.ss${RANURA_MOTE}`;
    const estado = core.FS.readFile(ruta) as Uint8Array;
    if (enCombate(estado, leerCabecera(estado).codigoJuego) === true) {
      return 'En mitad de un combate no se puede: espera a que acabe.';
    }
    const cambiado = cambiarMoteEnEstado(estado, personalidad, bytes);
    if (!cambiado) return 'Ese Pokémon ya no está en el equipo.';
    core.FS.writeFile(ruta, cambiado);
    return core.loadStateSlot(RANURA_MOTE, 0) ? null : 'No se ha podido cargar la partida con el mote nuevo.';
  } catch {
    return 'No se ha podido cambiar el mote.';
  }
};

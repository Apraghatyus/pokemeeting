// Rehacer el mundo de otro a partir de su semilla.
//
// Esto vivia dentro del modal del aleatorizador, donde solo servia para la
// casilla de "tengo una semilla". Ahora hace falta en dos sitios -ahi y al
// entrar por un enlace de invitacion- y es justo el trozo donde una segunda
// copia habria acabado separandose de la primera: lo que importa no es generar,
// es la COMPROBACION de que lo generado es de verdad el mismo mundo.
//
// Hay dos formas de equivocarse y las dos tienen su error propio:
//
//   - Otra copia de la ROM original. Dos volcados del mismo juego pueden
//     diferir, y el randomizer parte de los bytes que tiene: la misma semilla
//     sobre otra base da otro mundo. Se mira antes de gastar un minuto en
//     generar.
//   - Otra version del randomizer. Esta se detecta despues, comparando el CRC
//     de lo generado con el que dice la semilla. Da un mundo PARECIDO, que es
//     lo peligroso: sin esta comprobacion los dos jugadores creerian estar en
//     el mismo sitio y los Pokemon de cada ruta no serian los mismos.

import { randomizeRom, type PuestoEnCola } from '../net/randomizer';
import { nombreParaNueva, registrar, sinRevivirDe } from './partidas';
import { crc32 } from './romHeader';
import type { Semilla } from './semilla';

/** La semilla es de otra copia de la ROM original. */
export class SemillaDeOtraRomError extends Error {
  constructor() {
    super(
      'Esa semilla es de otra copia de la ROM original. Hace falta exactamente la misma con la que se creo.',
    );
    this.name = 'SemillaDeOtraRomError';
  }
}

/** Lo generado no es el mundo que dice la semilla. */
export class MundoDistintoError extends Error {
  constructor() {
    super(
      'Lo generado no coincide con lo que dice la semilla, seguramente por una version distinta del randomizer. No lo cargo: seria otro mundo.',
    );
    this.name = 'MundoDistintoError';
  }
}

export type BaseRom = { bytes: Uint8Array; fileName: string; crc32: string };

export type RehacerOpciones = {
  /** La ROM original del jugador. Nunca la que ya esta corriendo. */
  base: BaseRom;
  semilla: Semilla;
  /** De que juego es, solo para que la partida salga bien en la lista. */
  juego: { label: string | null; generacion: number | null };
  /** Carga la copia generada. Se le pasa para poder apuntarla DESPUES. */
  cargar: (rom: Uint8Array, fileName: string) => Promise<void>;
  /** Para poder decir cuanta cola hay mientras se espera turno. */
  alEsperar?: (puesto: PuestoEnCola | null) => void;
  /**
   * Si la partida se apunta en la lista.
   *
   * False sin sesion iniciada: la copia se genera y se juega, pero no se
   * guarda. Sin cuenta no hay ranuras, y prometer una partida que desaparece
   * al recargar es peor que decirlo de frente.
   */
  guardar?: boolean;
};

/**
 * Genera una copia NUEVA con los mismos ajustes que otra, y la apunta.
 *
 * Es lo que se le da a quien entra por un enlace. La diferencia con
 * `rehacerDesdeSemilla` es una sola y es la que importa: de la semilla del
 * anfitrion se cogen los AJUSTES -que Pokemon se cambian, que objetos, que
 * entrenadores- pero no el numero, asi que sale otro mundo.
 *
 * POR QUE ASI. Jugar los dos el mismo mundo aleatorizado quita la mitad de la
 * gracia: sabes lo que le va a salir al otro porque ya te salio a ti. Con los
 * mismos ajustes y distinta semilla, las reglas del reto son identicas -que es
 * lo que hace que una Soul Link sea justa- y lo que os encontrais, no.
 *
 * Quien SI quiera el mismo mundo lo tiene: pegar la semilla del otro en
 * "Tengo una semilla", que es exactamente lo que hace esa pantalla.
 */
export const nuevaConLosMismosAjustes = async ({
  base,
  semilla,
  juego,
  cargar,
  alEsperar,
  guardar = true,
}: RehacerOpciones): Promise<void> => {
  if (semilla.baseCrc32 !== base.crc32) throw new SemillaDeOtraRomError();

  // Sin `seed`: el servicio escoge uno y lo devuelve. Eso es lo unico que
  // separa esta copia de la del anfitrion.
  // Con la dificultad de quien invita: son las mismas reglas aunque el mundo
  // sea otro.
  const result = await randomizeRom(
    { settingsString: semilla.ajustes, sinRevivir: sinRevivirDe(semilla.dificultad) },
    base.bytes,
    alEsperar,
  );

  const generada = crc32(result.rom);
  const fileName = nombreParaNueva(base.fileName);
  await cargar(result.rom, fileName);
  if (!guardar) return;
  registrar({
    fichero: fileName,
    baseNombre: base.fileName,
    baseCrc32: base.crc32,
    semilla: result.seed,
    ajustes: result.ajustes,
    crc32: generada,
    cambiado: result.summary.changed,
    nombre: null,
    juego: juego.label,
    generacion: juego.generacion,
    // Esta partida nace de una invitacion: es de Soul Link por definicion.
    soullink: true,
    dificultad: semilla.dificultad ?? null,
  });
};

/**
 * Genera la copia que describe la semilla, la carga y la apunta.
 *
 * Apuntarla no es un detalle: una partida que no esta en la lista no se puede
 * continuar manana ni rehacer si el navegador tira sus datos, y quien entro por
 * un enlace no tiene la semilla escrita en ninguna parte.
 */
export const rehacerDesdeSemilla = async ({
  base,
  semilla,
  juego,
  cargar,
  alEsperar,
}: RehacerOpciones): Promise<void> => {
  if (semilla.baseCrc32 !== base.crc32) throw new SemillaDeOtraRomError();

  const result = await randomizeRom(
    {
      settingsString: semilla.ajustes,
      seed: semilla.semilla,
      // Cambia la copia, asi que sin ella no saldria el mismo mundo.
      sinRevivir: sinRevivirDe(semilla.dificultad),
    },
    base.bytes,
    alEsperar,
  );

  const generada = crc32(result.rom);
  if (generada !== semilla.crc32) throw new MundoDistintoError();

  const fileName = nombreParaNueva(base.fileName);
  await cargar(result.rom, fileName);
  registrar({
    fichero: fileName,
    baseNombre: base.fileName,
    baseCrc32: base.crc32,
    semilla: semilla.semilla,
    ajustes: semilla.ajustes,
    crc32: generada,
    cambiado: result.summary.changed,
    nombre: null,
    juego: juego.label,
    generacion: juego.generacion,
    // Una semilla pegada a mano puede ser para jugar con alguien o para repetir
    // un mundo que te gusto. No se sabe, y null dice eso.
    soullink: null,
    dificultad: semilla.dificultad ?? null,
  });
};

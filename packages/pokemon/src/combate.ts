// Quien esta peleando ahora mismo.
//
// ESTO ESTUVO MAL, Y CONVIENE SABER COMO. Se dio por hecho que tercera
// generacion intercambia las ranuras del equipo al sacar otro Pokemon, asi que
// el de la ranura 0 era el que peleaba. Con eso el resaltado no necesitaba
// detectar el combate, que era lo que lo bloqueaba.
//
// Lo desmintio una partida de verdad: el equipo era [PEZGATO, A BUENO], peleaba
// A BUENO, y la ranura 0 seguia siendo PEZGATO. El juego NO mueve las ranuras:
// se apunta aparte cual de ellas esta en el campo.
//
// COMO SE SABE ENTONCES. Durante un combate, el juego copia al Pokemon que esta
// peleando a una estructura suya de 88 bytes con las estadisticas ya calculadas.
// Dentro de esa copia esta la **personalidad**, los cuatro bytes que no cambian
// nunca y que ya usamos para identificar a cada uno. O sea que no hace falta
// buscar ninguna direccion: se buscan las personalidades que ya conocemos.
//
// Y eso es lo que hace esto seguro de publicar sin haberlo medido contra una
// partida: no se cree lo primero que encuentra. Para dar una copia por buena
// tienen que cuadrar **tres** campos independientes -personalidad, especie y
// nivel- en sus sitios exactos. Si la estructura no fuera como creemos, no
// cuadraria ninguno y esto diria "no lo se" en vez de senalar al que no es. Un
// hueco honesto, que es como se hizo tambien con las medallas.

import { region } from './savestate';
import type { EquipoResumen } from '@emupoke/protocol';

/** Lo que ocupa la copia de combate de un Pokemon. */
export const TAMANO_COMBATIENTE = 0x58;

/**
 * Donde cae cada campo dentro de esa copia.
 *
 * Son tres y no uno a proposito: con la personalidad sola, cuatro bytes
 * cualesquiera podrian coincidir en algun sitio de los 256 KB. Con los tres,
 * una coincidencia por casualidad pide acertar tambien la especie y el nivel en
 * los desplazamientos exactos.
 */
const ESPECIE = 0x00;
const NIVEL = 0x2a;
const PERSONALIDAD = 0x48;

/**
 * La personalidad del que esta peleando, o null si no se sabe.
 *
 * Devuelve null tambien cuando no hay combate: la copia no existe o no cuadra
 * con nadie del equipo.
 *
 * UN AVISO sobre lo que esto NO distingue: al acabar el combate, la copia se
 * queda ahi con lo ultimo que hubo. O sea que entre combate y combate esto sigue
 * senalando al ultimo que peleo. Se acepta porque la alternativa es peor -no
 * senalar a nadie- y porque en cuanto empieza el siguiente combate el juego
 * reescribe la copia con el que sale, que es cuando importa. Distinguir "hay
 * combate" de "lo hubo" sigue pendiente.
 */
export const quienPelea = (estado: Uint8Array, equipo: EquipoResumen | null): number | null => {
  if (!equipo || equipo.ranuras.length === 0) return null;

  try {
    const memoria = region(estado, 'ewram');
    const vista = new DataView(memoria.buffer, memoria.byteOffset, memoria.byteLength);

    // Un huevo no pelea, asi que ni se busca.
    const porPersonalidad = new Map(
      equipo.ranuras.filter((r) => !r.huevo).map((r) => [r.personalidad, r]),
    );
    if (porPersonalidad.size === 0) return null;

    // De cuatro en cuatro: la copia esta alineada, y asi se recorre la memoria
    // una cuarta parte de veces.
    for (let donde = PERSONALIDAD; donde + 4 <= memoria.length; donde += 4) {
      const personalidad = vista.getUint32(donde, true);
      const quien = porPersonalidad.get(personalidad);
      if (!quien) continue;

      // Aqui empezaria la copia si esto fuera una de verdad.
      const inicio = donde - PERSONALIDAD;
      if (vista.getUint16(inicio + ESPECIE, true) !== quien.especie) continue;
      if (memoria[inicio + NIVEL] !== quien.nivel) continue;

      return personalidad;
    }

    return null;
  } catch {
    // Un estado que no sabemos interpretar no es un fallo: es que de ese juego
    // todavia no se sabe leer esto.
    return null;
  }
};

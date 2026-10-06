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

import { desplazamientoDe, region } from './savestate';
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
 * Donde vive la bandera de "hay un combate en marcha", por juego.
 *
 * Vacio a proposito: todavia no se ha medido ninguna. Anadir una entrada aqui es
 * lo unico que hace falta, y el valor sale de `npm run buscar:combate`.
 *
 * Tiene que ser una direccion que valga **cero fuera del combate**, que es lo
 * que comprueba `enCombate`. La herramienta las busca justo asi.
 */
export const DIRECCION_EN_COMBATE: Readonly<Record<string, number>> = {};

/**
 * Si hay un combate ahora mismo. Null si de este juego aun no se sabe.
 *
 * Null y false no son lo mismo y por eso no se devuelve un booleano: "no lo se"
 * tiene que poder distinguirse de "no hay combate", porque solo el segundo
 * justifica apagar la marca.
 */
export const enCombate = (estado: Uint8Array, codigoJuego: string): boolean | null => {
  const direccion = DIRECCION_EN_COMBATE[codigoJuego.slice(0, 3).toUpperCase()];
  if (direccion === undefined) return null;

  const donde = desplazamientoDe(direccion);
  if (!donde) return null;

  const byte = estado[donde.offset];
  if (byte === undefined) return null;

  return byte !== 0;
};

/**
 * La personalidad del que esta peleando, o null si no se sabe.
 *
 * Devuelve null tambien cuando no hay combate: la copia no existe o no cuadra
 * con nadie del equipo.
 *
 * UN AVISO sobre lo que esto NO distingue por si solo: al acabar el combate, la
 * copia se queda ahi con lo ultimo que hubo, asi que entre combate y combate
 * seguiria senalando al ultimo que peleo. Para eso esta `enCombate`, que se
 * mira antes; mientras de este juego no se sepa donde esta esa bandera, el aviso
 * sigue en pie.
 */
export const quienPelea = (
  estado: Uint8Array,
  equipo: EquipoResumen | null,
  /** Para mirar la bandera de combate, si de este juego ya se sabe donde esta. */
  codigoJuego = '',
): number | null => {
  if (!equipo || equipo.ranuras.length === 0) return null;

  // Si consta que no hay combate, no hay nadie peleando y punto. Solo apaga con
  // un "no" explicito: mientras no se sepa, se sigue senalando al ultimo, que
  // es menos util pero no es mentira nueva.
  if (codigoJuego && enCombate(estado, codigoJuego) === false) return null;

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

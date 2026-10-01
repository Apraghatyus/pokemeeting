// La regla del Soul Link: los Pokemon van emparejados, y si cae uno cae su
// pareja.
//
// El programa no impone la regla ni toca la partida de nadie: eso se dijo desde
// el principio y sigue igual. Lo que hace es **verla**. Cuando a tu companero
// se le debilita uno, el tuyo emparejado aparece marcado en tu columna, para
// que los dos sepais que esa pareja se acabo sin tener que decirlo por voz y
// sin llevar la cuenta en un papel.
//
// El emparejamiento es por mote, porque es como se juega de verdad: los dos le
// ponen el mismo nombre a los dos Pokemon de cada pareja. No hay otra forma de
// saberlo desde fuera: las especies son distintas, los niveles tambien y las
// copias pueden estar aleatorizadas por separado.
//
// Esto no sabe de que juego viene cada equipo. Vale igual para tercera
// generacion que para la segunda cuando tenga su lector.

import type { EquipoResumen } from '@emupoke/protocol';

/**
 * Un mote preparado para comparar.
 *
 * Sin espacios de sobra y en mayusculas, porque un juego en el que uno escribio
 * "Rayo" y el otro "RAYO" sigue siendo la misma pareja, y en un Soul Link
 * equivocarse ahi significa dar por muerto al que no era.
 */
const normalizar = (mote: string): string => mote.trim().toUpperCase();

/**
 * Los motes de los que han caido en un equipo.
 *
 * Los que no tienen mote se quedan fuera: sin nombre no hay pareja que buscar,
 * y emparejar dos vacios juntaria cosas que no van juntas.
 */
export const motesDebilitados = (equipo: EquipoResumen | null): Set<string> => {
  const caidos = new Set<string>();
  for (const ranura of equipo?.ranuras ?? []) {
    if (ranura.estado !== 'debilitado') continue;
    const mote = normalizar(ranura.mote);
    if (mote !== '') caidos.add(mote);
  }
  return caidos;
};

/**
 * Si a este Pokemon se le ha caido la pareja al otro lado.
 *
 * Es informacion, no una sentencia: el Pokemon sigue vivo en la partida y el
 * jugador decide que hace con el. Aqui solo se enseña.
 */
export const parejaCaida = (mote: string, caidosDelOtro: ReadonlySet<string>): boolean => {
  const buscado = normalizar(mote);
  return buscado !== '' && caidosDelOtro.has(buscado);
};

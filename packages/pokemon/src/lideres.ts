// Hasta que nivel se puede subir antes de cada gimnasio.
//
// No es una regla del juego: es una de las que se pone la gente para que una
// Nuzlocke tenga gracia. Nadie puede llevar un Pokemon de nivel mas alto que el
// mas alto del proximo lider de gimnasio. Sin eso basta con machacar hierba
// alta hasta que el reto desaparece.
//
// POR QUE SE LEE DE LA ROM Y NO DE UNA LISTA. En una copia aleatorizada los
// lideres llevan otros Pokemon y otros niveles, asi que una tabla con los
// numeros de siempre -Brock 14, Misty 21...- seria exacta en el juego original y
// mentira en el que de verdad se esta jugando. Y este programa es sobre todo
// para copias aleatorizadas.
//
// COMO SE ENCUENTRA. Los entrenadores viven en una tabla de registros de 40
// bytes con esta forma: en 0x01 su clase, en 0x04 su nombre, en 0x20 cuantos
// Pokemon lleva y en 0x24 un puntero a su equipo. Lo que la hace localizable es
// el NOMBRE: los lideres se llaman igual en todos los idiomas -son nombres
// propios- y el aleatorizador no los toca, solo cambia sus Pokemon. Asi que se
// busca el nombre y se comprueba que lo que hay cuatro bytes antes se comporta
// como un registro de entrenador.
//
// El tamano de cada Pokemon del equipo NO se dio por supuesto: se derivo
// probando la tabla entera. Con el bit 0 de las banderas puesto son 16 bytes y
// sin el son 8, y los numeros no dejan lugar a dudas (55 de 55 y 15 de 15
// cuadran con 16, frente a 25 de 55 y 2 de 15 con 8).
//
// COMPROBADO contra la ROM espanola de Rojo Fuego: salen 14, 21, 24, 29, 43,
// 43, 47 y 50, que son los niveles de verdad de sus ocho lideres.

import { codificar } from './frases';
import { FIN } from './texto';

/**
 * Los ocho lideres de Kanto, en el orden en que se ganan sus medallas.
 *
 * El orden importa: la tabla del juego NO los guarda asi -Blaine aparece antes
 * que Sabrina- y la medalla numero seis es la de Sabrina, no la de Blaine.
 */
export const LIDERES_KANTO = [
  'BROCK',
  'MISTY',
  'LT. SURGE',
  'ERIKA',
  'KOGA',
  'SABRINA',
  'BLAINE',
  'GIOVANNI',
] as const;

/** Lo que ocupa un entrenador en la tabla. */
const TAMANO_ENTRENADOR = 0x28;
/** Donde empieza su nombre dentro del registro. */
const NOMBRE = 0x04;
/** Cuantos Pokemon lleva. */
const CUANTOS = 0x20;
/** Puntero a su equipo. */
const PUNTERO = 0x24;

const ESPECIE_MAXIMA = 411;
const NIVEL_MAXIMO = 100;

const leerU16 = (rom: Uint8Array, donde: number): number =>
  (rom[donde] ?? 0) | ((rom[donde + 1] ?? 0) << 8);

const leerU32 = (rom: Uint8Array, donde: number): number =>
  ((leerU16(rom, donde) | (leerU16(rom, donde + 2) << 16)) >>> 0);

/**
 * Busca varias secuencias de bytes en UNA sola pasada.
 *
 * Una pasada por nombre son ocho recorridos de dieciseis megabytes, y eso medido
 * aqui costaba medio segundo con el hilo de la interfaz parado. En el movil que
 * ya iba justo -un J7- eso se nota. Asi que se recorre una vez y en cada byte se
 * mira si puede empezar algun nombre, con un filtro de 256 casillas para no
 * pagar una busqueda por byte: casi siempre la casilla esta vacia y se sigue.
 *
 * Devuelve una lista de posiciones por patron, en el mismo orden en que se
 * pidieron.
 */
const buscarVarios = (rom: Uint8Array, patrones: readonly Uint8Array[]): number[][] => {
  const sitios: number[][] = patrones.map(() => []);

  // Que patrones pueden empezar por cada byte. Lo normal es ninguno.
  const puedeEmpezar = new Uint8Array(256);
  const porByte = new Map<number, number[]>();
  for (const [i, patron] of patrones.entries()) {
    const primero = patron[0];
    if (primero === undefined) continue;
    puedeEmpezar[primero] = 1;
    const ya = porByte.get(primero);
    if (ya) ya.push(i);
    else porByte.set(primero, [i]);
  }

  let masLargo = 0;
  for (const patron of patrones) if (patron.length > masLargo) masLargo = patron.length;

  const tope = rom.length - masLargo;
  for (let i = 0; i <= tope; i += 1) {
    if (puedeEmpezar[rom[i] as number] === 0) continue;
    for (const cual of porByte.get(rom[i] as number) ?? []) {
      const patron = patrones[cual];
      if (!patron) continue;
      let cuadra = true;
      for (let j = 1; j < patron.length; j += 1) {
        if (rom[i + j] !== patron[j]) {
          cuadra = false;
          break;
        }
      }
      if (cuadra) sitios[cual]?.push(i);
    }
  }
  return sitios;
};

/**
 * El nivel mas alto del equipo de ese entrenador, o null si no lo parece.
 *
 * Devolver null ante cualquier duda es lo que convierte un nombre que aparece
 * en un dialogo -y no en la tabla- en un candidato descartado, en vez de en un
 * numero sacado de bytes cualesquiera.
 */
const topeDelEquipo = (rom: Uint8Array, registro: number): number | null => {
  if (registro < 0 || registro + TAMANO_ENTRENADOR > rom.length) return null;

  const cuantos = rom[registro + CUANTOS] ?? 0;
  if (cuantos < 1 || cuantos > 6) return null;

  const puntero = leerU32(rom, registro + PUNTERO);
  if (puntero < 0x08000000 || puntero >= 0x09000000) return null;

  const base = puntero - 0x08000000;
  // Con movimientos propios cada Pokemon ocupa el doble. Ver la cabecera.
  const paso = ((rom[registro] ?? 0) & 1) === 1 ? 16 : 8;

  let tope = 0;
  for (let i = 0; i < cuantos; i += 1) {
    const donde = base + i * paso;
    if (donde + 6 > rom.length) return null;
    const nivel = leerU16(rom, donde + 2);
    const especie = leerU16(rom, donde + 4);
    if (nivel < 1 || nivel > NIVEL_MAXIMO) return null;
    if (especie < 1 || especie > ESPECIE_MAXIMA) return null;
    if (nivel > tope) tope = nivel;
  }
  return tope > 0 ? tope : null;
};

/**
 * El nivel mas alto de cada lider, en orden de medalla.
 *
 * Devuelve null si falta alguno: ocho menos uno no es una lista util, porque el
 * jugador no sabria cual falta y se fiaria igual.
 *
 * De los lideres que salen varias veces en la tabla -Giovanni esta tres, porque
 * se le pelea tambien fuera del gimnasio- se coge el equipo mas fuerte, que es
 * el del gimnasio.
 */
export const topesDeLosLideres = (rom: Uint8Array): number[] | null => {
  const patrones = LIDERES_KANTO.map((nombre) =>
    Uint8Array.from([...codificar(nombre), FIN]),
  );
  const encontrados = buscarVarios(rom, patrones);

  const topes: number[] = [];
  for (const sitios of encontrados) {
    let mejor: number | null = null;
    for (const donde of sitios) {
      const tope = topeDelEquipo(rom, donde - NOMBRE);
      if (tope !== null && (mejor === null || tope > mejor)) mejor = tope;
    }
    if (mejor === null) return null;
    topes.push(mejor);
  }

  return topes;
};

export type TopeDeNivel = {
  /** Contra quien toca, para poder decirlo. */
  lider: string;
  /** El nivel mas alto de su equipo. */
  nivel: number;
  /** Que numero de gimnasio es, de 1 a 8. */
  gimnasio: number;
};

/**
 * Contra quien toca ahora y hasta que nivel se puede subir.
 *
 * El proximo gimnasio es el siguiente al numero de medallas que se llevan.
 * Null con las ocho: ya no queda gimnasio al que ponerle tope.
 */
export const topeSiguiente = (
  topes: readonly number[] | null,
  medallas: number,
): TopeDeNivel | null => {
  if (!topes || medallas < 0 || medallas >= topes.length) return null;
  const nivel = topes[medallas];
  const lider = LIDERES_KANTO[medallas];
  if (nivel === undefined || lider === undefined) return null;
  return { lider, nivel, gimnasio: medallas + 1 };
};

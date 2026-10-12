// Mandos fisicos: Bluetooth o USB, de Xbox, de PlayStation, de Switch o
// genericos.
//
// La tabla vive aqui, sin nada del navegador, porque la usan los dos clientes:
// la web la aplica a la Gamepad API y la app de Android la sigue en Kotlin con
// los mismos criterios (ver MainActivity.kt). Si cambia una, cambian las dos.
//
// POR POSICION, NO POR LETRA. Cada fabricante pone otras letras -en un mando de
// Xbox la A esta abajo, en uno de Switch a la derecha- pero las manos van al
// mismo sitio. Se sigue la consola original: el boton de la DERECHA es A y el
// de ABAJO es B, que es donde estan en una Game Boy Advance.
//
// La Gamepad API las da asi en su "mapeo estandar": 0 abajo, 1 derecha, 2
// izquierda, 3 arriba, 4 y 5 los bumpers, 6 y 7 los gatillos, 8 select, 9
// start, 12-15 la cruceta. Los mandos que el navegador no reconoce no traen ese
// mapeo, y entonces cada boton va donde quiera el fabricante: se intenta igual.

/** Las entradas del GBA, con los nombres que entiende el nucleo de la web. */
export type EntradaGba = 'A' | 'B' | 'L' | 'R' | 'Start' | 'Select' | 'Up' | 'Down' | 'Left' | 'Right';

/** Lo minimo de un mando que hace falta mirar. Encaja con el Gamepad del navegador. */
export type MandoLeido = {
  buttons: readonly { pressed: boolean; value?: number }[];
  axes: readonly number[];
};

/** Que boton del mapeo estandar va a que entrada del GBA. */
const BOTONES: readonly (readonly [number, EntradaGba])[] = [
  [1, 'A'], // derecha
  [0, 'B'], // abajo
  [3, 'A'], // arriba: sobra un boton y A es el que mas se pulsa
  [2, 'B'], // izquierda
  [4, 'L'],
  [6, 'L'],
  [5, 'R'],
  [7, 'R'],
  [8, 'Select'],
  [9, 'Start'],
  [12, 'Up'],
  [13, 'Down'],
  [14, 'Left'],
  [15, 'Right'],
];

/**
 * Cuanto hay que inclinar el stick para que cuente.
 *
 * La mitad del recorrido. Menos y un stick gastado, que nunca vuelve del todo
 * al centro, camina solo; mas y hay que apretar para girar una esquina.
 */
export const ZONA_MUERTA = 0.5;

/** Un gatillo analogico cuenta como pulsado a partir de aqui. */
const GATILLO = 0.5;

/** Lo que tiene pulsado un mando ahora mismo, en entradas del GBA. */
export const entradasDelMando = (mando: MandoLeido): Set<EntradaGba> => {
  const pulsadas = new Set<EntradaGba>();
  for (const [indice, entrada] of BOTONES) {
    const boton = mando.buttons[indice];
    if (!boton) continue;
    if (boton.pressed || (boton.value ?? 0) > GATILLO) pulsadas.add(entrada);
  }
  // El stick izquierdo hace de cruceta, diagonales incluidas.
  const [x = 0, y = 0] = mando.axes;
  if (x <= -ZONA_MUERTA) pulsadas.add('Left');
  if (x >= ZONA_MUERTA) pulsadas.add('Right');
  if (y <= -ZONA_MUERTA) pulsadas.add('Up');
  if (y >= ZONA_MUERTA) pulsadas.add('Down');
  return pulsadas;
};

/** Si un mando esta tocando algo: para saber que se esta jugando con el. */
export const algoPulsado = (mando: MandoLeido): boolean => entradasDelMando(mando).size > 0;

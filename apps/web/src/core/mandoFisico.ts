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

/**
 * Lo que un mando puede hacer que NO es un boton de la consola.
 *
 * Un GBA tiene diez botones y un mando de hoy tiene mas, asi que los que
 * sobran pueden hacer cosas del programa. Las dos que se piden jugando con las
 * manos ocupadas: adelantar los dialogos y mirar el mapa de rutas.
 *
 * No viajan al nucleo -no existen para el juego-: se avisa al programa, una vez
 * por pulsacion. Una vez por pulsacion y no mientras se mantenga, porque las
 * dos son conmutadores: encienden y apagan.
 */
export type Accion = 'Turbo' | 'Mapa';

/** Las acciones, con su nombre para la pantalla de ajustes. */
export const ACCIONES: readonly { accion: Accion; etiqueta: string }[] = [
  { accion: 'Turbo', etiqueta: 'Avance rápido' },
  { accion: 'Mapa', etiqueta: 'Abrir el mapa' },
];

/** Todo lo que un boton del mando puede llevar: la consola y lo nuestro. */
export type EntradaMando = EntradaGba | Accion;

export const esAccion = (entrada: EntradaMando): entrada is Accion =>
  entrada === 'Turbo' || entrada === 'Mapa';

/** Lo minimo de un mando que hace falta mirar. Encaja con el Gamepad del navegador. */
export type MandoLeido = {
  buttons: readonly { pressed: boolean; value?: number }[];
  axes: readonly number[];
};

/**
 * Que botones van a cada entrada del GBA, por su numero en el mapeo estandar.
 *
 * Se puede cambiar desde Ajustes: hay mandos que el navegador no reconoce y
 * reparten los numeros a su manera, y hay quien prefiere el B arriba.
 */
export type MapaMando = Record<EntradaMando, readonly number[]>;

export const MAPA_POR_DEFECTO: MapaMando = {
  A: [1, 3], // derecha, y arriba: sobra un boton y A es el que mas se pulsa
  B: [0, 2], // abajo, e izquierda
  // Los bumpers se quedan con la L y la R de la consola, que es donde las
  // buscan las manos. Los gatillos no existen en un GBA, asi que son el sitio
  // natural para lo nuestro.
  L: [4],
  R: [5],
  Turbo: [6], // LT / L2
  Mapa: [7], // RT / R2
  Select: [8],
  Start: [9],
  Up: [12],
  Down: [13],
  Left: [14],
  Right: [15],
};

/** Como se llama cada boton del mapeo estandar, para enseñarlo. */
const NOMBRES: Readonly<Record<number, string>> = {
  0: 'Abajo',
  1: 'Derecha',
  2: 'Izquierda',
  3: 'Arriba',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'Select',
  9: 'Start',
  10: 'Stick izq.',
  11: 'Stick der.',
  12: 'Cruceta ↑',
  13: 'Cruceta ↓',
  14: 'Cruceta ←',
  15: 'Cruceta →',
  16: 'Inicio',
};

export const nombreDeBoton = (indice: number): string => NOMBRES[indice] ?? `Botón ${indice}`;

/**
 * Asigna un boton a una entrada.
 *
 * Ese boton deja de hacer lo que hiciera antes: un boton que pulsa dos cosas a
 * la vez es justo lo que no se quiere al reasignar.
 */
export const asignarBoton = (mapa: MapaMando, entrada: EntradaMando, indice: number): MapaMando => {
  const nuevo = {} as Record<EntradaMando, readonly number[]>;
  for (const [otra, botones] of Object.entries(mapa) as [EntradaMando, readonly number[]][]) {
    nuevo[otra] = botones.filter((b) => b !== indice);
  }
  nuevo[entrada] = [indice];
  return nuevo;
};

/** El primer boton pulsado de un mando, para aprender uno nuevo. */
export const primerBotonPulsado = (mando: MandoLeido): number | null => {
  const indice = mando.buttons.findIndex((b) => b.pressed || (b.value ?? 0) > 0.5);
  return indice >= 0 ? indice : null;
};

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
export const entradasDelMando = (
  mando: MandoLeido,
  mapa: MapaMando = MAPA_POR_DEFECTO,
): Set<EntradaMando> => {
  const pulsadas = new Set<EntradaMando>();
  for (const [entrada, botones] of Object.entries(mapa) as [EntradaMando, readonly number[]][]) {
    for (const indice of botones) {
      const boton = mando.buttons[indice];
      if (boton && (boton.pressed || (boton.value ?? 0) > GATILLO)) pulsadas.add(entrada);
    }
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

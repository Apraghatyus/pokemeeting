// Que tecla hace que cosa, y como cambiarlo.
//
// El nucleo recibe nombres de tecla de SDL ('Z', 'Up', 'Return'), no eventos del
// navegador. Asi que lo unico de verdad delicado aqui es la traduccion: el
// navegador dice `event.code === 'KeyZ'` y hay que decirle a SDL `'Z'`.
//
// Esa traduccion se hace desde `code` y no desde `key` a proposito. `key` es la
// letra que SALE al pulsar, y depende de la distribucion del teclado: en un
// teclado frances la tecla donde un espanol tiene la Z da una W. Si se guardara
// esa letra, el mando quedaria mal puesto para media Europa. `code` es la
// posicion fisica de la tecla, que es lo que el jugador recuerda con los dedos.
//
// Lo que no se traduce no se asigna. Es preferible decir "esa tecla no la se
// nombrar, prueba con otra" que aceptarla y dejar un boton muerto que el
// jugador descubriria en mitad de un combate.

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_KEY_BINDINGS, type MgbaModule } from './mgbaCore';

/** Las entradas del GBA, en el orden en que se enseñan. */
export const BOTONES = [
  { entrada: 'Up', etiqueta: 'Arriba' },
  { entrada: 'Down', etiqueta: 'Abajo' },
  { entrada: 'Left', etiqueta: 'Izquierda' },
  { entrada: 'Right', etiqueta: 'Derecha' },
  { entrada: 'A', etiqueta: 'A' },
  { entrada: 'B', etiqueta: 'B' },
  { entrada: 'L', etiqueta: 'L' },
  { entrada: 'R', etiqueta: 'R' },
  { entrada: 'Start', etiqueta: 'Start' },
  { entrada: 'Select', etiqueta: 'Select' },
] as const;

export type Entrada = (typeof BOTONES)[number]['entrada'];

/** Lo que se guarda: que tecla de SDL lleva a cada entrada del GBA. */
export type MapaDeTeclas = Record<string, string>;

const POR_DEFECTO: MapaDeTeclas = Object.fromEntries(
  DEFAULT_KEY_BINDINGS.map(([sdl, entrada]) => [entrada, sdl]),
);

const CLAVE = 'emupoke.teclas';

/**
 * Del `code` del navegador al nombre que usa SDL.
 *
 * Solo lo que se sabe nombrar con certeza. Las teclas raras se quedan fuera a
 * proposito: una tecla que el nucleo no reconoce se acepta sin protestar y
 * luego no hace nada.
 */
export const sdlDesdeCodigo = (code: string): string | null => {
  // Letras: KeyZ -> Z
  const letra = /^Key([A-Z])$/.exec(code);
  if (letra) return letra[1]!;

  // Numeros de la fila de arriba: Digit4 -> 4
  const digito = /^Digit([0-9])$/.exec(code);
  if (digito) return digito[1]!;

  const sueltas: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Return',
    NumpadEnter: 'Return',
    Backspace: 'Backspace',
    Space: 'Space',
    Tab: 'Tab',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    AltLeft: 'Left Alt',
    AltRight: 'Right Alt',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Minus: '-',
    Equal: '=',
  };
  return sueltas[code] ?? null;
};

/** Como se le enseña una tecla al jugador. */
export const nombreVisible = (sdl: string): string =>
  ({ Return: 'Intro', Up: '↑', Down: '↓', Left: '←', Right: '→', Space: 'Espacio' })[sdl] ?? sdl;

const leerGuardado = (): MapaDeTeclas => {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return { ...POR_DEFECTO };
    const guardado = JSON.parse(crudo) as MapaDeTeclas;
    // Se parte de las de fabrica: si manana se añade un boton nuevo, quien
    // tenga un mapa viejo guardado lo recibe en vez de quedarse sin el.
    return { ...POR_DEFECTO, ...guardado };
  } catch {
    return { ...POR_DEFECTO };
  }
};

export type Teclas = {
  mapa: MapaDeTeclas;
  /** La entrada que esta esperando que pulses una tecla, si hay alguna. */
  esperando: Entrada | null;
  /** Empieza a escuchar para reasignar esta entrada. */
  pedir: (entrada: Entrada) => void;
  /** Deja de esperar sin cambiar nada. */
  cancelar: () => void;
  /** Vuelve a las de fabrica. */
  restaurar: () => void;
  /** Por que no se pudo asignar la ultima tecla, si paso. */
  problema: string | null;
};

/**
 * @param coreRef el nucleo, para aplicarle el mapa en cuanto exista
 * @param listo   si ya hay nucleo al que aplicarselo
 */
export const useTeclas = (coreRef: { current: MgbaModule | null }, listo: boolean): Teclas => {
  const [mapa, setMapa] = useState<MapaDeTeclas>(leerGuardado);
  const [esperando, setEsperando] = useState<Entrada | null>(null);
  const [problema, setProblema] = useState<string | null>(null);

  // El mapa se lee dentro del escuchador, que se monta una vez.
  const mapaRef = useRef(mapa);
  mapaRef.current = mapa;

  /** Se lo pasa al nucleo. Hay que repetirlo al cargar cada ROM. */
  const aplicar = useCallback(
    (cual: MapaDeTeclas) => {
      const core = coreRef.current;
      if (!core) return;
      for (const [entrada, sdl] of Object.entries(cual)) core.bindKey(sdl, entrada);
    },
    [coreRef],
  );

  useEffect(() => {
    if (listo) aplicar(mapa);
  }, [listo, mapa, aplicar]);

  const guardar = useCallback((siguiente: MapaDeTeclas) => {
    setMapa(siguiente);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(siguiente));
    } catch {
      // Sin almacenamiento el mando funciona igual; solo no se recuerda.
    }
  }, []);

  // Mientras se espera una tecla, el teclado es de esta pantalla y no del juego.
  useEffect(() => {
    if (esperando === null) return;

    const alPulsar = (evento: KeyboardEvent) => {
      evento.preventDefault();
      evento.stopPropagation();

      if (evento.key === 'Escape') {
        setEsperando(null);
        return;
      }

      const sdl = sdlDesdeCodigo(evento.code);
      if (!sdl) {
        setProblema('Esa tecla no la sé nombrar para el emulador. Prueba con otra.');
        return;
      }

      // Si la tecla ya llevaba a otro boton, se le quita: dos botones con la
      // misma tecla dejan uno muerto sin avisar.
      const siguiente: MapaDeTeclas = { ...mapaRef.current };
      for (const [entrada, asignada] of Object.entries(siguiente)) {
        if (asignada === sdl && entrada !== esperando) delete siguiente[entrada];
      }
      siguiente[esperando] = sdl;

      guardar(siguiente);
      setProblema(null);
      setEsperando(null);
    };

    // En captura, para llegar antes que cualquier otro escuchador del juego.
    globalThis.addEventListener('keydown', alPulsar, { capture: true });
    return () => globalThis.removeEventListener('keydown', alPulsar, { capture: true });
  }, [esperando, guardar]);

  return {
    mapa,
    esperando,
    problema,
    pedir: useCallback((entrada: Entrada) => {
      setProblema(null);
      setEsperando(entrada);
    }, []),
    cancelar: useCallback(() => setEsperando(null), []),
    restaurar: useCallback(() => {
      guardar({ ...POR_DEFECTO });
      setProblema(null);
    }, [guardar]),
  };
};

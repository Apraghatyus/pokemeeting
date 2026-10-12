// El emulador nativo visto desde JavaScript. Ver android/.../mgba.

import {NativeEventEmitter, NativeModules, requireNativeComponent, type ViewProps} from 'react-native';

export type Rom = {ruta: string; nombre: string};

type MgbaNativo = {
  /** Abre el selector del sistema y copia la ROM a la carpeta de la app. Null si se cancela. */
  elegirRom(): Promise<Rom | null>;
  /** Las ROMs que ya se trajeron antes. */
  romsGuardadas(): Promise<Rom[]>;
  leerBase64(ruta: string): Promise<string>;
  cargar(ruta: string): Promise<boolean>;
  cerrar(): void;
  pausar(si: boolean): void;
  teclas(bits: number): void;
  reiniciar(): void;
  /** El estado de la maquina en base64: los 0x61000 bytes de siempre. */
  estado(): Promise<string | null>;
  cargarEstado(base64: string): Promise<boolean>;
  /** Que boton del mando fisico va a cada entrada, con nombres legibles. */
  mandoFisico(): Promise<Record<string, string>>;
  /** El siguiente boton que se pulse en el mando ira a esta entrada. Null para dejarlo. */
  aprenderBoton(entrada: string | null): void;
  restaurarMando(): void;
  /** Se ha vuelto a enseñar el mando tactil: la proxima vez que se use el fisico, avisa. */
  mandoTactilVisible(): void;
  /** La pantalla del emulador como pista de WebRTC: lo que devuelve getDisplayMedia. */
  pistaDePantalla(): Promise<{streamId: string; track: unknown}>;
  /** El fichero de guardado de la partida que corre, en base64. */
  guardado(): Promise<string | null>;
};

export const Mgba = NativeModules.Mgba as MgbaNativo;

/**
 * Lo que cuenta el emulador por su cuenta:
 * - mandoFisicoUsado: se esta jugando con un mando fisico.
 * - mandoAprendido: {entrada, boton}, al reasignar un boton.
 */
export const eventosDelEmulador = new NativeEventEmitter(NativeModules.Mgba);

/** Las entradas del GBA en el orden en que se enseñan, con los nombres de la web. */
export const ENTRADAS = [
  {entrada: 'Up', etiqueta: 'Arriba'},
  {entrada: 'Down', etiqueta: 'Abajo'},
  {entrada: 'Left', etiqueta: 'Izquierda'},
  {entrada: 'Right', etiqueta: 'Derecha'},
  {entrada: 'A', etiqueta: 'A'},
  {entrada: 'B', etiqueta: 'B'},
  {entrada: 'L', etiqueta: 'L'},
  {entrada: 'R', etiqueta: 'R'},
  {entrada: 'Start', etiqueta: 'Start'},
  {entrada: 'Select', etiqueta: 'Select'},
] as const;

/** La pantalla de la consola. El emulador pinta en ella desde su propio hilo. */
export const Pantalla = requireNativeComponent<ViewProps>('MgbaPantalla');

/** Los botones como bits, en el orden en que los cuenta la consola. */
export const BOTON = {
  A: 1 << 0,
  B: 1 << 1,
  SELECT: 1 << 2,
  START: 1 << 3,
  DERECHA: 1 << 4,
  IZQUIERDA: 1 << 5,
  ARRIBA: 1 << 6,
  ABAJO: 1 << 7,
  R: 1 << 8,
  L: 1 << 9,
} as const;

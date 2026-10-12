// El emulador nativo visto desde JavaScript. Ver android/.../mgba.

import {NativeModules, requireNativeComponent, type ViewProps} from 'react-native';

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
};

export const Mgba = NativeModules.Mgba as MgbaNativo;

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

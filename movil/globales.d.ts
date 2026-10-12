// Lo que el codigo compartido con la web espera encontrar en el entorno.
//
// `localStorage` lo pone src/almacen.ts sobre las preferencias de Android; aqui
// solo se declara, para que TypeScript lo conozca como en el navegador.

declare var localStorage: {
  readonly length: number;
  key(indice: number): string | null;
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
  clear(): void;
};

/** Donde viven los servicios cuando no se esta en la pagina: la app. */
declare var EMUPOKE_ORIGEN: string | undefined;

/** Hermes los trae desde React Native 0.74; los tipos de React Native, no. */
declare function atob(datos: string): string;
declare function btoa(datos: string): string;

/**
 * Del navegador. En la app NO existen: el codigo compartido que los usa
 * (core/invitacion.ts) solo lo hace en funciones que la app no llama.
 */
declare var location: {origin: string; pathname: string; hash: string; hostname: string; search: string};
declare var history: {replaceState(datos: unknown, titulo: string, url?: string): void};

/** Los pone src/texto.ts si Hermes no los trae. Solo UTF-8. */
declare class TextDecoder {
  constructor(etiqueta?: string);
  decode(datos?: ArrayBufferView | ArrayBuffer): string;
}
declare class TextEncoder {
  encode(texto?: string): Uint8Array;
}

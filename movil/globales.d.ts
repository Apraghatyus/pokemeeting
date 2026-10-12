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

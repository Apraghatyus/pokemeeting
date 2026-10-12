// `localStorage` en la app, sobre las preferencias de Android.
//
// Se instala antes de cargar nada mas (ver index.js): el codigo que se comparte
// con la web lo usa como en el navegador y no tiene que saber donde corre.

import {NativeModules} from 'react-native';

type AlmacenNativo = {
  leer(clave: string): string | null;
  escribir(clave: string, valor: string): boolean;
  borrar(clave: string): boolean;
  claves(): string;
};

const nativo = NativeModules.Almacen as AlmacenNativo | undefined;

/** Lo mismo que el `Storage` del navegador, que aqui no tiene tipos. */
type Storage = {
  readonly length: number;
  key(indice: number): string | null;
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
  removeItem(clave: string): void;
  clear(): void;
};

const claves = (): string[] => (nativo ? nativo.claves().split('\n').filter(Boolean) : []);

const almacen: Storage = {
  get length() {
    return claves().length;
  },
  key: (indice: number) => claves()[indice] ?? null,
  getItem: (clave: string) => nativo?.leer(clave) ?? null,
  setItem: (clave: string, valor: string) => {
    nativo?.escribir(clave, String(valor));
  },
  removeItem: (clave: string) => {
    nativo?.borrar(clave);
  },
  clear: () => {
    for (const clave of claves()) nativo?.borrar(clave);
  },
};

if (!(globalThis as {localStorage?: Storage}).localStorage) {
  (globalThis as {localStorage?: Storage}).localStorage = almacen;
}

// Y donde estan los servicios: la app no tiene pagina de la que sacarlo.
(globalThis as {EMUPOKE_ORIGEN?: string}).EMUPOKE_ORIGEN = 'https://emupoke.aguaquim.com';

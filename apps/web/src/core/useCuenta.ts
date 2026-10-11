// Quien eres, mientras dura la pagina.
//
// Pregunta una vez al cargar y se queda con la respuesta. Lo mas importante
// que hace es lo que pasa justo DESPUES de entrar: subir lo que ya hay en este
// navegador. Ese paso es la razon de que el historial se recogiera desde antes
// de que hubiera cuentas, y si no se hiciera aqui no se haria en ningun sitio.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  crearCuenta,
  entrar as entrarFuera,
  quienSoy,
  salir as salirFuera,
  subirLoDeAqui,
  type Cuenta,
} from './cuenta';
import { guardarApodo } from './apodo';

export type EstadoDeCuenta = {
  /** Quien eres, o null si no hay sesion. */
  cuenta: Cuenta | null;
  /** Mientras se pregunta por primera vez, para no parpadear. */
  comprobando: boolean;
  /** Que se subio al entrar, para poder decirlo. */
  subido: { partidas: number; finales: number } | null;
  entrar: (usuario: string, clave: string) => Promise<void>;
  registrar: (usuario: string, clave: string, apodo: string | null) => Promise<void>;
  salir: () => Promise<void>;
};

export const useCuenta = (): EstadoDeCuenta => {
  const [cuenta, setCuenta] = useState<Cuenta | null>(null);
  const [comprobando, setComprobando] = useState(true);
  const [subido, setSubido] = useState<{ partidas: number; finales: number } | null>(null);

  // Para no tocar el estado de un componente que ya no esta: la pagina puede
  // cerrarse mientras el servidor contesta.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const quien = await quienSoy();
      if (!vivo.current) return;
      setCuenta(quien);
      setComprobando(false);
      // Si ya habia sesion de antes, tambien se sube: puede haberse jugado sin
      // conexion, o en este navegador por primera vez.
      if (quien) void subirEnSilencio();
    })();
  }, []);

  /**
   * Sube sin molestar.
   *
   * Que falle no puede estropearle la sesion a nadie: lo de aqui no se borra
   * al subir, asi que un fallo solo significa que se volvera a intentar la
   * proxima vez que se entre.
   */
  const subirEnSilencio = useCallback(async () => {
    try {
      const hecho = await subirLoDeAqui();
      if (!vivo.current) return;
      setSubido({ partidas: hecho.partidas.nuevas, finales: hecho.finales.nuevos });
    } catch {
      // Ya se intentara.
    }
  }, []);

  const despuesDeEntrar = useCallback(
    (quien: Cuenta) => {
      setCuenta(quien);
      // El apodo de la cuenta manda sobre el que hubiera suelto en este
      // navegador: a partir de ahora es el mismo en todas partes.
      guardarApodo(quien.apodo);
      void subirEnSilencio();
    },
    [subirEnSilencio],
  );

  const entrar = useCallback(
    async (usuario: string, clave: string) => {
      despuesDeEntrar(await entrarFuera(usuario, clave));
    },
    [despuesDeEntrar],
  );

  const registrar = useCallback(
    async (usuario: string, clave: string, apodo: string | null) => {
      despuesDeEntrar(await crearCuenta(usuario, clave, apodo));
    },
    [despuesDeEntrar],
  );

  const salir = useCallback(async () => {
    await salirFuera();
    if (!vivo.current) return;
    setCuenta(null);
    setSubido(null);
  }, []);

  return { cuenta, comprobando, subido, entrar, registrar, salir };
};

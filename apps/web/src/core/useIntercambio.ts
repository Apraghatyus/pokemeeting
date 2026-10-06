// Intercambiar un Pokemon con el companero.
//
// Aqui no se emula ningun cable. Se copian los cien bytes del Pokemon de una
// partida a la otra, y el motor que lo hace ya estaba escrito y probado: valida
// contra la ROM QUE RECIBE y recalcula las estadisticas con sus tablas. Eso es
// lo que hace que funcione entre dos copias aleatorizadas distintas, y es justo
// lo que un cable de verdad NO sabria hacer.
//
// EL PROBLEMA DE DISENO, que es lo unico dificil de todo esto:
//
// No hay servidor que arbitre. Cada uno edita su propia partida, asi que un
// intercambio son dos cambios en dos ordenadores y no existe un instante en que
// los dos ocurran a la vez. Si yo aplico lo suyo y la conexion se corta antes de
// que ella aplique lo mio, ella se queda el suyo y yo tengo los dos: un
// duplicado. En una Nuzlocke eso es peor que perder el Pokemon.
//
// COMO SE RESUELVE. En vez de buscar un instante atomico que no existe, se mueve
// el riesgo a donde no duele:
//
//   1. Primero se intercambian las OFERTAS. Nadie toca su partida todavia, asi
//      que hasta aqui cortarse no cuesta nada.
//   2. Cuando los dos tienen las dos ofertas y los dos han confirmado, cada lado
//      tiene ya TODO lo que necesita para terminar por su cuenta. A partir de
//      ese momento el companero sobra: da igual que la conexion aguante.
//   3. Antes de tocar la partida se apunta el trato en un diario que sobrevive a
//      cerrar el navegador, con los bytes dentro. Si algo se corta a la mitad,
//      se remata despues sin necesitar a nadie.
//
// Y aplicar es idempotente: escribir el mismo bloque en la misma ranura dos
// veces deja exactamente lo mismo. Por eso reintentar nunca estropea nada, que
// es lo que permite que el diario sea asi de simple.
//
// Queda una ventana, y conviene decirla en vez de taparla: entre que mando mi
// "listo" y recibo el suyo. Si se corta justo ahi, uno de los dos puede quedarse
// sin aplicar. Para eso esta el diario y el aviso de trato a medias.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OfertaIntercambio, PeerMessage } from '@emupoke/protocol';
import {
  aplicarRecepcion,
  contextoDeRom,
  enCombate,
  leerCabecera,
  localizarEquipo,
  prepararOferta,
  TAMANO_ESTADO,
} from '@emupoke/pokemon';
import type { MgbaModule } from './mgbaCore';

/** Ranura de estado propia del intercambio, lejos de las del jugador. */
const RANURA_TRATO = 6;

export type FaseTrato =
  | 'sin-trato'
  /** Hay ofertas sobre la mesa, pero faltan cosas por decidir. */
  | 'hablando'
  /** Los dos han dicho que si: ya solo queda escribirlo. */
  | 'aplicando'
  | 'hecho'
  | 'roto';

export type EstadoTrato = {
  fase: FaseTrato;
  /** Lo que entrego, o null si todavia no he elegido. */
  mia: OfertaIntercambio | null;
  /** Lo que me ofrecen. */
  suya: OfertaIntercambio | null;
  miListo: boolean;
  suListo: boolean;
  /** Que ha pasado, para contarlo. */
  aviso: string | null;
  /** Quedo un trato apuntado que no llego a terminarse. */
  aMedias: boolean;
};

const INICIAL: EstadoTrato = {
  fase: 'sin-trato',
  mia: null,
  suya: null,
  miListo: false,
  suListo: false,
  aviso: null,
  aMedias: false,
};

const aBase64 = (bytes: Uint8Array): string => {
  let texto = '';
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto);
};

const deBase64 = (texto: string): Uint8Array => {
  const crudo = atob(texto);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i += 1) bytes[i] = crudo.charCodeAt(i);
  return bytes;
};

/** Lo que se apunta antes de tocar la partida. */
type Diario = {
  trato: string;
  ranura: number;
  /** Lo que recibo, en base64. Con esto solo ya se puede terminar. */
  recibo: string;
  /** Lo que entrego. No hace falta para aplicar: esta para poder explicarlo. */
  doy: string;
};

const claveDiario = (partida: string) => `emupoke.trato.${partida}`;

const leerDiario = (partida: string): Diario | null => {
  try {
    const crudo = localStorage.getItem(claveDiario(partida));
    if (!crudo) return null;
    const d = JSON.parse(crudo) as Partial<Diario>;
    if (typeof d.trato !== 'string' || typeof d.recibo !== 'string') return null;
    if (typeof d.ranura !== 'number') return null;
    return { trato: d.trato, ranura: d.ranura, recibo: d.recibo, doy: d.doy ?? '' };
  } catch {
    return null;
  }
};

const escribirDiario = (partida: string, diario: Diario | null): void => {
  try {
    if (diario === null) localStorage.removeItem(claveDiario(partida));
    else localStorage.setItem(claveDiario(partida), JSON.stringify(diario));
  } catch {
    // Sin almacenamiento el intercambio sigue funcionando; lo que se pierde es
    // poder rematarlo si se corta. No es motivo para no dejar intercambiar.
  }
};

/** Un nombre para el trato que no choque con el que elija el otro lado. */
const nuevoTrato = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export type Intercambio = {
  estado: EstadoTrato;
  /** Pone sobre la mesa el Pokemon de esa ranura. */
  ofrecer: (ranura: number) => void;
  /** Dice que si. Cuando los dos lo dicen, se escribe. */
  confirmar: () => void;
  /** Se echa atras y avisa al companero. */
  cancelar: () => void;
  /** Remata un trato que se quedo a medias, sin necesitar al companero. */
  rematar: () => void;
  /** Cierra el cartel cuando ya no hay nada que hacer. */
  olvidar: () => void;
};

/**
 * @param coreRef   el nucleo, para leer y escribir la partida
 * @param romBytes  la ROM propia, para validar y recalcular lo que llega
 * @param partida   con que partida se asocia el diario
 * @param enviar    manda un mensaje al companero; devuelve si pudo
 * @param escuchar  se apunta a los mensajes del companero
 */
export const useIntercambio = (
  coreRef: { current: MgbaModule | null },
  romBytes: Uint8Array | null,
  partida: string | null,
  enviar: (mensaje: PeerMessage) => boolean,
  escuchar: (oyente: (mensaje: PeerMessage) => void) => () => void,
): Intercambio => {
  const [estado, setEstado] = useState<EstadoTrato>(INICIAL);

  // Armar el contexto recorre los dieciseis megas de la ROM, asi que se hace
  // una vez por ROM y no en cada intercambio.
  const contextoRef = useRef<{
    rom: Uint8Array;
    contexto: ReturnType<typeof contextoDeRom>;
  } | null>(null);

  const contexto = useCallback(() => {
    if (!romBytes) return null;
    if (contextoRef.current?.rom !== romBytes) {
      contextoRef.current = { rom: romBytes, contexto: contextoDeRom(romBytes) };
    }
    return contextoRef.current.contexto;
  }, [romBytes]);

  const rutaDeEstado = (core: MgbaModule): string | null => {
    const base = core.gameName?.split('/').pop()?.replace(/\.[^.]+$/, '');
    return base ? `${core.filePaths().saveStatePath}/${base}.ss${RANURA_TRATO}` : null;
  };

  /** Saca un estado de la partida tal y como esta ahora mismo. */
  const mirarPartida = useCallback((): Uint8Array | null => {
    const core = coreRef.current;
    if (!core) return null;
    try {
      const ruta = rutaDeEstado(core);
      if (!ruta || !core.saveStateSlot(RANURA_TRATO, 0)) return null;
      const bytes = core.FS.readFile(ruta) as Uint8Array;
      return bytes.length === TAMANO_ESTADO ? bytes : null;
    } catch {
      return null;
    }
  }, [coreRef]);

  /** Mete un estado modificado en la partida en marcha. */
  const cargarPartida = useCallback(
    (bytes: Uint8Array): boolean => {
      const core = coreRef.current;
      if (!core) return false;
      try {
        const ruta = rutaDeEstado(core);
        if (!ruta) return false;
        core.FS.writeFile(ruta, bytes);
        return Boolean(core.loadStateSlot(RANURA_TRATO, 0));
      } catch {
        return false;
      }
    },
    [coreRef],
  );

  /**
   * Escribe el Pokemon recibido en la partida. Devuelve el fallo, o null.
   *
   * Se apunta en el diario ANTES de tocar nada. Y se comprueba que no haya un
   * combate en marcha: cargar un estado editado en mitad de un combate es como
   * se corrompe una partida.
   */
  const aplicar = useCallback(
    (diario: Diario): string | null => {
      if (!partida) return 'No se a que partida pertenece esto.';
      const ctx = contexto();
      if (!ctx) return 'Todavia no tengo tu ROM cargada.';

      const actual = mirarPartida();
      if (!actual) return 'No he podido leer tu partida.';

      let codigo = '';
      try {
        codigo = leerCabecera(actual).codigoJuego;
      } catch {
        return 'Esa partida no la se interpretar.';
      }

      if (enCombate(actual, codigo) === true) {
        return 'Estas en mitad de un combate. Sal al mapa y vuelve a intentarlo.';
      }

      // Con el codigo del juego: sin el se puede acabar mirando el equipo rival.
      if (!localizarEquipo(actual, undefined, codigo)) {
        return 'No encuentro tu equipo en la partida.';
      }

      escribirDiario(partida, diario);

      try {
        const { estado: nuevo } = aplicarRecepcion(
          actual,
          null,
          diario.ranura,
          deBase64(diario.recibo),
          ctx,
        );
        if (!cargarPartida(nuevo)) return 'No he podido devolverle la partida al emulador.';
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }

      escribirDiario(partida, null);
      return null;
    },
    [cargarPartida, contexto, mirarPartida, partida],
  );

  // Al abrir una partida, mirar si quedo un trato a medias de otra vez.
  useEffect(() => {
    setEstado({ ...INICIAL, aMedias: partida !== null && leerDiario(partida) !== null });
  }, [partida]);

  const ofrecer = useCallback(
    (ranura: number) => {
      const actual = mirarPartida();
      if (!actual) {
        setEstado((previo) => ({ ...previo, aviso: 'No he podido leer tu partida.' }));
        return;
      }

      let oferta: OfertaIntercambio;
      try {
        const suyo = prepararOferta(actual, ranura);
        oferta = {
          // Si ella ya ha ofrecido, se usa SU nombre de trato: asi los dos
          // hablan del mismo sin tener que negociar cual vale.
          trato: estado.suya?.trato ?? nuevoTrato(),
          ranura,
          bloque: aBase64(suyo.bloque),
          mote: suyo.mote,
          especie: suyo.especie,
          nivel: suyo.nivel,
        };
      } catch (err) {
        setEstado((previo) => ({
          ...previo,
          aviso: err instanceof Error ? err.message : String(err),
        }));
        return;
      }

      if (!enviar({ type: 'oferta', oferta })) {
        setEstado((previo) => ({ ...previo, aviso: 'No he podido avisar a tu companero.' }));
        return;
      }
      setEstado((previo) => ({ ...previo, mia: oferta, fase: 'hablando', aviso: null }));
    },
    [enviar, estado.suya, mirarPartida],
  );

  const confirmar = useCallback(() => {
    const trato = estado.mia?.trato;
    if (!trato) return;
    if (!enviar({ type: 'trato-listo', trato })) {
      setEstado((previo) => ({ ...previo, aviso: 'No he podido avisar a tu companero.' }));
      return;
    }
    setEstado((previo) => ({ ...previo, miListo: true, aviso: null }));
  }, [enviar, estado.mia]);

  const cancelar = useCallback(() => {
    const trato = estado.mia?.trato ?? estado.suya?.trato;
    if (trato) enviar({ type: 'trato-roto', trato });
    setEstado((previo) => ({ ...INICIAL, aMedias: previo.aMedias }));
  }, [enviar, estado.mia, estado.suya]);

  const olvidar = useCallback(() => {
    setEstado((previo) => ({ ...INICIAL, aMedias: previo.aMedias }));
  }, []);

  const rematar = useCallback(() => {
    if (!partida) return;
    const diario = leerDiario(partida);
    if (!diario) {
      setEstado((previo) => ({ ...previo, aMedias: false }));
      return;
    }
    const fallo = aplicar(diario);
    setEstado((previo) => ({
      ...previo,
      aviso: fallo ?? 'Listo: el intercambio que quedo a medias ya esta aplicado.',
      aMedias: fallo !== null,
      fase: fallo === null ? 'hecho' : previo.fase,
    }));
  }, [aplicar, partida]);

  // --- lo que llega del companero ---
  useEffect(() => {
    return escuchar((mensaje) => {
      if (mensaje.type === 'oferta') {
        setEstado((previo) => ({
          ...previo,
          suya: mensaje.oferta,
          fase: previo.fase === 'hecho' || previo.fase === 'aplicando' ? previo.fase : 'hablando',
          aviso: null,
        }));
        return;
      }

      if (mensaje.type === 'trato-listo') {
        setEstado((previo) => {
          // Su "si" vale solo para el trato del que estamos hablando. Sin esto,
          // un mensaje rezagado de un trato anterior confirmaria el de ahora.
          const nuestro = previo.mia?.trato ?? previo.suya?.trato;
          if (nuestro && mensaje.trato !== nuestro) return previo;
          return { ...previo, suListo: true };
        });
        return;
      }

      if (mensaje.type === 'trato-roto') {
        setEstado((previo) => ({
          ...INICIAL,
          aMedias: previo.aMedias,
          fase: 'roto',
          aviso: 'Tu companero se ha echado atras.',
        }));
      }
    });
  }, [escuchar]);

  // --- cuando estan las cuatro cosas, se escribe ---
  //
  // Se hace en un efecto y no dentro de confirmar() porque el ultimo que falta
  // puede llegar por cualquiera de los dos lados: unas veces lo ultimo es mi
  // confirmacion y otras la suya.
  const aplicandoRef = useRef(false);

  useEffect(() => {
    const { mia, suya, miListo, suListo, fase } = estado;
    if (!mia || !suya || !miListo || !suListo) return;
    if (fase === 'hecho' || fase === 'aplicando') return;
    if (aplicandoRef.current) return;

    aplicandoRef.current = true;
    setEstado((previo) => ({ ...previo, fase: 'aplicando' }));

    const fallo = aplicar({
      trato: mia.trato,
      ranura: mia.ranura,
      recibo: suya.bloque,
      doy: mia.bloque,
    });
    aplicandoRef.current = false;

    setEstado((previo) => ({
      ...previo,
      fase: fallo === null ? 'hecho' : 'roto',
      aviso: fallo,
      aMedias: fallo !== null,
    }));
  }, [aplicar, estado]);

  return { estado, ofrecer, confirmar, cancelar, rematar, olvidar };
};

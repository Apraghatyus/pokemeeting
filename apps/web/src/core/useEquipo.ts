// Lee el equipo de la partida mientras se juega.
//
// El nucleo no deja mirar la memoria directamente: no hay una funcion para
// leer una direccion. Lo que si deja es guardar un estado, que es una copia de
// toda la memoria, y eso es lo que se hace cada pocos segundos. Es el mismo
// camino que ya se uso para los intercambios, solo que aqui en bucle.
//
// Cuesta poco, pero no cuesta cero, y de ahi las dos precauciones:
//
//   - La direccion del equipo se recuerda. Encontrarla la primera vez obliga a
//     recorrer trescientos kilobytes comprobando checksums; despues, con la
//     direccion en la mano, son seis bloques de cien bytes.
//   - El estado NO se sincroniza a IndexedDB. Esto es una mirada, no un
//     guardado: persistirlo cada tres segundos castigaria el disco para nada.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EquipoResumen } from '@emupoke/protocol';
import {
  encontrarTablaMapas,
  enCombate,
  enDerrota,
  bolsilloDeBalls,
  mapaActual,
  rivalEnCombate,
  enSalonDeLaFama,
  leerCabecera,
  quienPelea,
  medallasAhora,
  mismoEquipo,
  releerEquipo,
  resumirEquipo,
  SIN_SABER,
  type MapaEnMemoria,
  type Medallas,
  type TablaMapas,
} from '@emupoke/pokemon';
import type { Lectura, Veredicto } from './reglasEnVivo';
import type { MgbaModule } from './mgbaCore';
import type { Especies } from './useEspecies';

/**
 * Ranura de estado reservada para mirar, separada de las del jugador.
 *
 * La 1 es la de guardar y cargar a mano desde la barra, y la 9 la de exportar.
 * Pisar cualquiera de las dos seria perderle al jugador un guardado suyo.
 */
const RANURA_ESPIA = 8;

/** Cada cuanto se mira. Un equipo cambia de tanto en tanto, no a cada cuadro. */
const CADA_MS = 3000;

/** Quita la extension sea cual sea: hay partidas .gba y partidas .gbc. */
const sinExtension = (nombre: string): string => nombre.replace(/\.[^.]+$/, '');

export type EstadoEquipo = {
  /** El equipo, o null si todavia no se ha podido leer. */
  equipo: EquipoResumen | null;
  /**
   * Si el juego esta enseñando el mensaje de haber perdido.
   *
   * Sale del mismo estado que el equipo, asi que no cuesta otra lectura. Es
   * mejor señal que mirar la vida: al perder, el Centro Pokemon te cura, y la
   * ventana de "todos a cero" dura unos segundos y se puede escapar entre dos
   * lecturas.
   */
  derrota: boolean;
  /**
   * Si el juego esta enseñando el Salon de la Fama.
   *
   * Sale del mismo estado, igual que la derrota. Es la senal de reto
   * completado, y a diferencia de la derrota no hay regla nuestra detras: esto
   * lo dice el juego y punto.
   */
  victoria: boolean;
  /** Las medallas conseguidas, o "no se sabe" si de este juego aun no se leen. */
  medallas: Medallas;
  /**
   * Si este juego permite leer el equipo.
   *
   * Hoy solo la tercera generacion: de segunda la memoria se guarda de otra
   * forma y aun no se sabe interpretar. Sirve para que la interfaz explique
   * por que no hay nada, en vez de enseñar seis huecos sin motivo.
   */
  disponible: boolean;
  /** El mapa donde esta el jugador, o null si no se sabe. Ver `mapas.ts`. */
  mapa: MapaEnMemoria | null;
  /**
   * La ultima vez que se deshizo algo por romper una regla, con el aviso para
   * el jugador. Ver `reglasEnVivo.ts`.
   */
  deshecho: { motivo: string; momento: number } | null;
};

/**
 * Quien mira cada lectura y decide si hay que deshacerla.
 *
 * Recibe la ultima lectura buena y la de ahora; si devuelve un veredicto, se
 * vuelve a cargar uno de los estados buenos de antes. Ver `reglasEnVivo.ts`.
 */
export type Vigilante = (
  antes: Lectura | null,
  ahora: Lectura,
  tabla: TablaMapas | null,
) => Veredicto | null;

/**
 * Cuantas lecturas buenas se guardan para poder volver atras: un minuto.
 *
 * Una sola no basta. Para deshacer una cura hay que volver a ANTES de hablar
 * con la enfermera -si no, el dialogo sigue solo y vuelve a curar-, y para
 * deshacer una captura, a antes del combate. Son unos 400 KB cada una.
 */
const HISTORIAL = 20;

/** Si la misma regla salta otra vez en este tiempo, se vuelve mas atras. */
const REPETICION_MS = 60_000;

/**
 * @param coreRef   el nucleo, cuando ya este arrancado
 * @param jugando   si hay una partida en marcha
 * @param romName   para olvidar lo aprendido al cambiar de juego
 * @param especies  para completar lo que esta en la ROM y no en la partida
 * @param romBytesRef la ROM que corre, para saber en que mapa se esta
 * @param vigilanteRef quien decide si una lectura rompe una regla y se deshace
 */
export const useEquipo = (
  coreRef: { current: MgbaModule | null },
  jugando: boolean,
  romName: string | null,
  especies: Especies,
  romBytesRef: { current: Uint8Array | null } = { current: null },
  vigilanteRef: { current: Vigilante | null } = { current: null },
): EstadoEquipo => {
  const [equipo, setEquipo] = useState<EquipoResumen | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [derrota, setDerrota] = useState(false);
  const [victoria, setVictoria] = useState(false);
  const [medallas, setMedallas] = useState<Medallas>(SIN_SABER);
  const [mapa, setMapa] = useState<MapaEnMemoria | null>(null);
  const [deshecho, setDeshecho] = useState<EstadoEquipo['deshecho']>(null);

  /** La tabla de mapas de la ROM que corre: se busca una vez por ROM. */
  const tablaRef = useRef<{ rom: Uint8Array; tabla: TablaMapas | null } | null>(null);
  /** Donde estaba la cabecera del mapa la ultima vez. */
  const pistaMapaRef = useRef<number | null>(null);
  /** Donde estaba el bloque con la mochila la ultima vez. */
  const pistaMochilaRef = useRef<number | null>(null);
  /** Las ultimas lecturas que no rompian ninguna regla, con su estado. */
  const historialRef = useRef<{ lectura: Lectura; estado: Uint8Array; momento: number }[]>([]);
  /** La ultima vez que se deshizo algo, para ir mas atras si se repite. */
  const ultimoDeshechoRef = useRef<{ motivo: string; momento: number; veces: number } | null>(null);

  const direccionRef = useRef<number | null>(null);
  const juegoRef = useRef<string>('');
  const ultimoRef = useRef<EquipoResumen | null>(null);

  // Igual que el aviso: cambia en cada render y no debe reiniciar el bucle.
  const especiesRef = useRef(especies);
  especiesRef.current = especies;

  const mirar = useCallback(() => {
    const core = coreRef.current;
    if (!core) return;

    try {
      // Sin banderas: la estructura cruda, sin captura de pantalla, que es la
      // que sabemos interpretar y ademas la mas barata de escribir.
      if (!core.saveStateSlot(RANURA_ESPIA, 0)) return;

      const base = sinExtension(core.gameName?.split('/').pop() ?? '');
      const ruta = `${core.filePaths().saveStatePath}/${base}.ss${RANURA_ESPIA}`;
      const estado = core.FS.readFile(ruta) as Uint8Array;

      // Primero por el camino barato, con la direccion ya conocida.
      let leido =
        direccionRef.current === null
          ? null
          : releerEquipo(estado, direccionRef.current, juegoRef.current);

      // Si ahi ya no hay equipo, se busca otra vez: el jugador puede haber
      // reiniciado, cargado otra partida o metido su primer Pokemon.
      if (!leido) {
        const hallado = resumirEquipo(estado);
        if (hallado) {
          direccionRef.current = hallado.equipo.direccion;
          juegoRef.current = hallado.resumen.juego;
          leido = hallado.resumen;
        } else {
          direccionRef.current = null;
        }
      }

      // El tipo de cada especie vive en la ROM, no en la partida, asi que se
      // añade aqui: lo manda cada lado con su copia, porque en dos
      // aleatorizadas por separado la misma especie tiene tipos distintos.
      //
      // Y quien esta peleando, que se busca en el mismo estado: tiene que ir
      // dentro del equipo porque viaja con el al companero, y su memoria no
      // sale de su ordenador.
      if (leido) {
        leido = {
          ...leido,
          ranuras: leido.ranuras.map((r) => ({
            ...r,
            tipos: especiesRef.current.tipos(r.especie),
          })),
          peleando: quienPelea(estado, leido, juegoRef.current || leido.juego),
          enCombate: enCombate(estado, juegoRef.current || leido.juego),
        };
      }

      // De que juego es esto. Se lee de la CABECERA del estado y no del equipo
      // a proposito: antes salia de haber encontrado el equipo, y asi, nada mas
      // empezar una partida -antes del primer Pokemon- no habia codigo y las
      // medallas se quedaban en "no se sabe" aunque el guardado estuviera ahi.
      let codigo = juegoRef.current || leido?.juego || '';
      try {
        codigo = leerCabecera(estado).codigoJuego || codigo;
      } catch {
        // Un estado que no sea de GBA no tiene esta cabecera. Se sigue con lo
        // que diga el equipo, que es lo que habia antes.
      }

      // En que mapa esta. La tabla se busca una vez por ROM.
      const rom = romBytesRef.current;
      if (rom && tablaRef.current?.rom !== rom) {
        tablaRef.current = { rom, tabla: encontrarTablaMapas(rom) };
        pistaMapaRef.current = null;
      }
      const tabla = rom ? (tablaRef.current?.tabla ?? null) : null;
      const donde = tabla ? mapaActual(estado, tabla, pistaMapaRef.current) : null;
      if (donde) pistaMapaRef.current = donde.direccion;

      // Lo que se tiene delante si hay combate.
      const rival = leido ? rivalEnCombate(estado, leido, juegoRef.current || leido.juego) : null;
      // Y el bolsillo de Poke Balls, para saber si se lanza alguna en combate.
      const mochila = donde
        ? bolsilloDeBalls(estado, juegoRef.current || leido?.juego || '', donde, pistaMochilaRef.current)
        : null;
      if (mochila) pistaMochilaRef.current = mochila.bloque;

      // Las reglas que se hacen cumplir. Si esta lectura rompe una, se vuelve
      // a un estado bueno de antes y aqui se acaba: lo leido ya no es la partida.
      const ahora: Lectura = { equipo: leido, mapa: donde, rival, balls: mochila?.firma ?? null };
      const historial = historialRef.current;
      const veredicto =
        vigilanteRef.current?.(historial.at(-1)?.lectura ?? null, ahora, tabla) ?? null;
      if (veredicto && historial.length > 0) {
        const momento = Date.now();
        // La misma regla otra vez enseguida: lo de antes no fue bastante atras.
        const previo = ultimoDeshechoRef.current;
        const veces =
          previo && previo.motivo === veredicto.motivo && momento - previo.momento < REPETICION_MS
            ? previo.veces + 1
            : 0;
        const segundos = veces === 0 ? veredicto.atras : Math.max(veredicto.atras, 3) * 2 ** veces;
        const limite = momento - segundos * 1000;
        let elegido = 0;
        for (let i = historial.length - 1; i >= 0; i -= 1) {
          const h = historial[i]!;
          if (h.momento > limite) continue;
          if (veredicto.antesDe !== undefined && h.lectura.rival?.personalidad === veredicto.antesDe) {
            continue;
          }
          elegido = i;
          break;
        }
        core.FS.writeFile(ruta, historial[elegido]!.estado);
        if (core.loadStateSlot(RANURA_ESPIA, 0)) {
          historialRef.current = historial.slice(0, elegido + 1);
          ultimoDeshechoRef.current = { motivo: veredicto.motivo, momento, veces };
          setDeshecho({ motivo: veredicto.motivo, momento });
          return;
        }
      }
      historial.push({ lectura: ahora, estado, momento: Date.now() });
      if (historial.length > HISTORIAL) historial.shift();
      setMapa((antes) =>
        antes?.grupo === donde?.grupo && antes?.numero === donde?.numero && antes?.zona === donde?.zona
          ? antes
          : donde,
      );

      // Se mira en el mismo estado que acabamos de leer.
      setDerrota(enDerrota(estado));
      setVictoria(enSalonDeLaFama(estado));
      // Las medallas salen de las DOS cosas: del fichero de guardado, que es lo
      // unico con estructura reconocible, y de la memoria, que es la que esta al
      // dia. Manda la memoria cuando cuadra. Sin eso, la medalla no se encendia
      // hasta que el jugador se acordaba de guardar. Ver `medallas.ts`.
      setMedallas(
        medallasAhora(
          (() => {
            try {
              return core.getSave();
            } catch {
              return null;
            }
          })(),
          estado,
          codigo,
        ),
      );

      setDisponible(true);
      if (mismoEquipo(ultimoRef.current, leido)) return;

      ultimoRef.current = leido;
      setEquipo(leido);
    } catch {
      // Un estado que no sabemos interpretar -por ahora, cualquiera que no sea
      // de GBA- cae aqui. No es un fallo: es un juego para el que todavia no
      // hay perfil de memoria, y la interfaz lo dice en vez de callarse.
      setDisponible(false);
      direccionRef.current = null;
    }
  }, [coreRef, romBytesRef, vigilanteRef]);

  useEffect(() => {
    // Al cambiar de juego no vale nada de lo aprendido del anterior.
    direccionRef.current = null;
    pistaMapaRef.current = null;
    pistaMochilaRef.current = null;
    historialRef.current = [];
    ultimoDeshechoRef.current = null;
    setMapa(null);
    setDeshecho(null);
    juegoRef.current = '';
    ultimoRef.current = null;
    setEquipo(null);
    setDisponible(true);
    setDerrota(false);
    setVictoria(false);
    setMedallas(SIN_SABER);

    if (!jugando) return;

    // La primera mirada se retrasa un poco: nada mas cargar, el juego aun esta
    // en la pantalla de presentacion y no hay equipo que leer.
    const primera = setTimeout(mirar, 1500);
    const repetir = setInterval(mirar, CADA_MS);
    return () => {
      clearTimeout(primera);
      clearInterval(repetir);
    };
  }, [jugando, romName, mirar]);

  return { equipo, disponible, derrota, victoria, medallas, mapa, deshecho };
};

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
  enDerrota,
  leerMedallas,
  mismoEquipo,
  releerEquipo,
  resumirEquipo,
  SIN_SABER,
  type Medallas,
} from '@emupoke/pokemon';
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
};

/**
 * @param coreRef   el nucleo, cuando ya este arrancado
 * @param jugando   si hay una partida en marcha
 * @param romName   para olvidar lo aprendido al cambiar de juego
 * @param especies  para completar lo que esta en la ROM y no en la partida
 */
export const useEquipo = (
  coreRef: { current: MgbaModule | null },
  jugando: boolean,
  romName: string | null,
  especies: Especies,
): EstadoEquipo => {
  const [equipo, setEquipo] = useState<EquipoResumen | null>(null);
  const [disponible, setDisponible] = useState(true);
  const [derrota, setDerrota] = useState(false);
  const [medallas, setMedallas] = useState<Medallas>(SIN_SABER);

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
      if (leido) {
        leido = {
          ...leido,
          ranuras: leido.ranuras.map((r) => ({
            ...r,
            tipos: especiesRef.current.tipos(r.especie),
          })),
        };
      }

      // Se mira en el mismo estado que acabamos de leer.
      setDerrota(enDerrota(estado));
      setMedallas(leerMedallas(estado, juegoRef.current || leido?.juego || ''));

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
  }, [coreRef]);

  useEffect(() => {
    // Al cambiar de juego no vale nada de lo aprendido del anterior.
    direccionRef.current = null;
    juegoRef.current = '';
    ultimoRef.current = null;
    setEquipo(null);
    setDisponible(true);
    setDerrota(false);
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

  return { equipo, disponible, derrota, medallas };
};

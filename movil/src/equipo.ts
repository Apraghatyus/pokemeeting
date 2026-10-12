// El equipo de la partida, leido cada pocos segundos.
//
// Es el mismo camino que la web (apps/web/src/core/useEquipo.ts): se pide un
// savestate crudo, se busca el equipo con packages/pokemon y se le añaden los
// tipos con la ROM propia. La diferencia es de donde sale el estado: aqui lo da
// el emulador nativo, y es el mismo bloque de 0x61000 bytes.

import {useEffect, useRef, useState} from 'react';
import type {EquipoResumen} from '@emupoke/protocol';
import {enDerrota, releerEquipo, resumirEquipo} from '@emupoke/pokemon';
import {desdeBase64} from './base64';
import type {Especies} from './especies';
import {Mgba} from './nativo';

/** Cada cuanto se mira. El mismo ritmo que la web. */
const CADA_MS = 3000;

export type EstadoDelEquipo = {
  equipo: EquipoResumen | null;
  /** Si el juego ha cantado la derrota: "fue corriendo a un CENTRO PKMN". */
  derrota: boolean;
};

export const useEquipo = (jugando: boolean, especies: Especies): EstadoDelEquipo => {
  const [estado, setEstado] = useState<EstadoDelEquipo>({equipo: null, derrota: false});
  const direccion = useRef<number | null>(null);
  const juego = useRef('');
  const especiesRef = useRef(especies);
  especiesRef.current = especies;

  useEffect(() => {
    if (!jugando) return;
    let vivo = true;

    const mirar = async () => {
      const base64 = await Mgba.estado();
      if (!vivo || !base64) return;
      const crudo = desdeBase64(base64);
      try {
        let leido =
          direccion.current === null ? null : releerEquipo(crudo, direccion.current, juego.current);
        if (!leido) {
          const hallado = resumirEquipo(crudo);
          direccion.current = hallado?.equipo.direccion ?? null;
          juego.current = hallado?.resumen.juego ?? '';
          leido = hallado?.resumen ?? null;
        }
        const conTipos = leido && {
          ...leido,
          ranuras: leido.ranuras.map(r => ({...r, tipos: especiesRef.current.tipos(r.especie)})),
        };
        setEstado({equipo: conTipos, derrota: enDerrota(crudo)});
      } catch {
        // Un estado que no sabemos leer: se deja como estaba.
      }
    };

    void mirar();
    const reloj = setInterval(() => void mirar(), CADA_MS);
    return () => {
      vivo = false;
      clearInterval(reloj);
    };
  }, [jugando]);

  return estado;
};

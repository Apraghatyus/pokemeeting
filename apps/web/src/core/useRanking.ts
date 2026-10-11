// Los datos del ranking, traidos del servidor.
//
// Se pide entero cada vez que cambia un filtro, y no se filtra aqui dentro. La
// razon no es comodidad: el ranking es de TODOS los jugadores, asi que lo que
// hay en este navegador no es ni una parte de lo que hay que ensenar. Filtrar
// en el cliente obligaria a traerselo todo para poder esconder la mitad.
//
// Se puede mirar sin cuenta. Es una tabla de resultados, no datos de nadie:
// pedir que te registres para ver quien va ganando seria poner una puerta
// donde no hace falta.

import { useCallback, useEffect, useRef, useState } from 'react';

export type PokemonDelRanking = {
  especie: number;
  mote: string;
  nivel: number;
  caido: boolean;
  /** Sus cuatro movimientos, por numero. El nombre lo pone TU ROM. */
  movimientos: number[];
};

export type PartidaDelRanking = {
  cuando: string;
  resultado: 'victoria' | 'derrota' | 'descartada';
  juego: string | null;
  modo: 'sola' | 'soullink' | null;
  companero: string | null;
  medallas: number | null;
  equipo: PokemonDelRanking[];
};

export type JugadorDelRanking = {
  usuario: string;
  apodo: string;
  victorias: number;
  derrotas: number;
  descartadas: number;
  partidas: number;
  /** null mientras no haya partidas suficientes para que signifique algo. */
  porcentaje: number | null;
  ultimas: PartidaDelRanking[];
};

export type FiltrosDelRanking = {
  modo: 'sola' | 'soullink';
  juego: string | null;
};

export type EstadoDelRanking = {
  jugadores: JugadorDelRanking[];
  /** Los juegos de los que hay partidas, para el filtro. */
  juegos: string[];
  cargando: boolean;
  /** Que fallo, si fallo. */
  problema: string | null;
};

export const useRanking = (filtros: FiltrosDelRanking, activo: boolean): EstadoDelRanking => {
  const [estado, setEstado] = useState<EstadoDelRanking>({
    jugadores: [],
    juegos: [],
    cargando: true,
    problema: null,
  });

  // Cambiar de filtro rapido lanza varias peticiones, y pueden volver
  // desordenadas: sin esto, la respuesta vieja pisaria a la nueva y la tabla
  // ensenaria algo que no es lo que esta marcado.
  const ultima = useRef(0);

  const traer = useCallback(async () => {
    const mia = ultima.current + 1;
    ultima.current = mia;

    setEstado((previo) => ({ ...previo, cargando: true, problema: null }));

    const parametros = new URLSearchParams({ modo: filtros.modo });
    if (filtros.juego) parametros.set('juego', filtros.juego);

    try {
      const respuesta = await fetch(`/cuentas/ranking?${parametros}`, { credentials: 'include' });
      if (!respuesta.ok) throw new Error('El servidor no ha querido contestar.');
      const datos = (await respuesta.json()) as {
        jugadores: JugadorDelRanking[];
        juegos: string[];
      };
      if (ultima.current !== mia) return;
      setEstado({
        jugadores: datos.jugadores ?? [],
        juegos: datos.juegos ?? [],
        cargando: false,
        problema: null,
      });
    } catch {
      if (ultima.current !== mia) return;
      setEstado((previo) => ({
        ...previo,
        cargando: false,
        // Sin servicio de cuentas no hay ranking, y eso no es un fallo del
        // jugador: se dice y se sigue jugando.
        problema: 'No puedo hablar con el servidor del ranking.',
      }));
    }
  }, [filtros.modo, filtros.juego]);

  useEffect(() => {
    if (!activo) return;
    void traer();
  }, [activo, traer]);

  return estado;
};

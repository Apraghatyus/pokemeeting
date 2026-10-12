// Todo lo que pasa mientras se juega, en un sitio.
//
// Es lo mismo que hace apps/web/src/App.tsx, y con el MISMO codigo siempre que
// se puede: las reglas (reglasEnVivo, reglasNuzlocke, dificultad), las
// partidas, el historial y el fin de partida vienen de apps/web/src/core, y
// funcionan aqui porque la app tiene su propio localStorage (src/almacen.ts).
// Lo unico propio de la app es de donde sale el estado de la partida: el
// emulador nativo (src/lectura.ts).

import {useEffect, useMemo, useRef, useState} from 'react';
import type {PeerMessage, PokemonResumen, RomFingerprint} from '@emupoke/protocol';
import {
  aprenderCentro,
  cambiarMoteEnEstado,
  codificarTexto,
  encontrarTablaEvoluciones,
  enCombate,
  equiposDeLosLideres,
  familiasEvolutivas,
  leerCabecera,
  LARGO_MOTE,
  motesDebilitados,
  parseGameCode,
  topesDeLosLideres,
  topeSiguiente,
  type PokemonDeEntrenador,
} from '@emupoke/pokemon';
import {reglasActivas, tiposPrimariosRepetidos} from '../../apps/web/src/core/dificultad';
import {
  companeroDeSoullink,
  descartarSoullink,
  dificultadDe,
  esSoullink,
  marcarSoullink,
  modoSoullink,
  todasLasPartidas,
} from '../../apps/web/src/core/partidas';
import {useReglasNuzlocke} from '../../apps/web/src/core/reglasNuzlocke';
import {
  apuntarEncuentro,
  guardarDisposicionDelCentro,
  guardarEncuentros,
  juzgarCaptura,
  juzgarCentro,
  juzgarLider,
  juzgarPokeball,
  leerDisposicionDelCentro,
  leerEncuentros,
  revividoConObjeto,
  seCuroElEquipo,
  type MemoriaDeEncuentros,
} from '../../apps/web/src/core/reglasEnVivo';
import {useFinDePartida} from '../../apps/web/src/core/useFinDePartida';
import {useIntercambioCon, type PartidaIO} from '../../apps/web/src/core/useIntercambio';
import {nombreDeZona, zonaCanonica} from '../../apps/web/src/core/zonas';
import type {Especies} from './especies';
import {cargarEstadoEnBytes, estadoAhora, useLectura, type Vigilante} from './lectura';
import {useSala} from './sala';

export type Aviso = {texto: string; tipo: 'error' | 'info'};

export type DatosDePartida = {
  /** El fichero de la ROM: es lo que une la partida con su registro. */
  fichero: string;
  rom: Uint8Array;
  huella: RomFingerprint;
  especies: Especies;
};

export const usePartidaViva = (datos: DatosDePartida, hayCuenta: boolean) => {
  const {fichero, rom, huella, especies} = datos;
  const sala = useSala(huella);
  const vigilanteRef = useRef<Vigilante | null>(null);
  const lectura = useLectura(true, especies, rom, vigilanteRef);
  const {equipo, medallas} = lectura;
  const conCompanero = sala.estado.fase === 'conectada';
  const nombreDelCompanero = sala.estado.companero ?? 'tu compañero';
  const [aviso, setAviso] = useState<Aviso | null>(null);

  // --- dificultad y reglas ---
  const dificultad = useMemo(() => dificultadDe(fichero), [fichero, equipo]);

  // Lo que las reglas necesitan de la ROM, buscado una vez.
  const [deLaRom, setDeLaRom] = useState<{
    topes: number[] | null;
    lideres: PokemonDeEntrenador[][] | null;
    familia: (especie: number) => number;
  }>({topes: null, lideres: null, familia: e => e});
  useEffect(() => {
    // Un poco despues de arrancar, para no frenar la primera imagen.
    const cuando = setTimeout(() => {
      const evoluciones = encontrarTablaEvoluciones(rom);
      setDeLaRom({
        topes: topesDeLosLideres(rom),
        lideres: equiposDeLosLideres(rom),
        familia: evoluciones ? familiasEvolutivas(evoluciones) : e => e,
      });
    }, 3000);
    return () => clearTimeout(cuando);
  }, [rom]);
  const tope = medallas.cuantas === null ? null : topeSiguiente(deLaRom.topes, medallas.cuantas);

  // --- Soul Link: se pregunta al empezar y queda atada a quien la empezo ---
  const [versionSoullink, setVersionSoullink] = useState(0);
  const partidaApuntada = useMemo(
    () => todasLasPartidas().some(p => p.fichero === fichero),
    [fichero, versionSoullink],
  );
  const modoSoul = useMemo(() => modoSoullink(fichero), [fichero, versionSoullink]);
  const empezando =
    (medallas.cuantas ?? 0) === 0 && (equipo?.ranuras.filter(p => !p.huevo).length ?? 0) <= 1;
  const preguntarSoullink = conCompanero && partidaApuntada && modoSoul === 'sin-decidir' && empezando;
  const companeroInicial = useMemo(() => companeroDeSoullink(fichero), [fichero, versionSoullink]);
  const peerUsuario = sala.estado.usuarioCompanero;
  const otraPersona =
    hayCuenta && modoSoul === 'si' && companeroInicial !== null && peerUsuario !== companeroInicial;
  const enSoulLink = conCompanero && modoSoul === 'si' && !otraPersona;

  const aplicarSoullink = (activo: boolean) => {
    if (!partidaApuntada) return;
    if (activo) marcarSoullink(fichero, sala.estado.usuarioCompanero);
    else descartarSoullink(fichero);
    setVersionSoullink(v => v + 1);
  };
  const elegirSoullink = (activo: boolean) => {
    aplicarSoullink(activo);
    sala.enviar({type: 'soullink', activo});
  };
  const soullinkDelOtro = sala.estado.soullinkCompanero;
  useEffect(() => {
    if (!soullinkDelOtro) return;
    if (!empezando && modoSoul !== 'sin-decidir') return;
    if (modoSoul !== 'sin-decidir' && (modoSoul === 'si') === soullinkDelOtro.activo) return;
    aplicarSoullink(soullinkDelOtro.activo);
    setAviso({
      texto: soullinkDelOtro.activo
        ? `${nombreDelCompanero} ha hecho la partida Soul Link: vale también para la tuya.`
        : `${nombreDelCompanero} prefiere jugar sin Soul Link: jugáis juntos, sin parejas.`,
      tipo: 'info',
    });
  }, [soullinkDelOtro]);
  useEffect(() => {
    if (!conCompanero || !partidaApuntada || !peerUsuario) return;
    if (modoSoul !== 'si' || companeroInicial !== null || !empezando) return;
    marcarSoullink(fichero, peerUsuario);
    setVersionSoullink(v => v + 1);
  }, [conCompanero, partidaApuntada, peerUsuario, modoSoul, companeroInicial, empezando, fichero]);
  useEffect(() => {
    if (!conCompanero || !otraPersona) return;
    setAviso({
      texto: `Esta Soul Link la empezaste con ${companeroInicial}. Con ${peerUsuario ?? nombreDelCompanero} podéis jugar juntos, pero sin parejas, y si la terminas así no contará en el ranking.`,
      tipo: 'error',
    });
  }, [conCompanero, otraPersona, companeroInicial, peerUsuario, nombreDelCompanero]);

  const caidosMios = useMemo(() => motesDebilitados(equipo), [equipo]);
  const caidosSuyos = useMemo(
    () => motesDebilitados(enSoulLink ? sala.estado.equipoCompanero : null),
    [enSoulLink, sala.estado.equipoCompanero],
  );

  // --- fin de partida, con lo que hace falta para el ranking ---
  const fin = useFinDePartida(
    equipo,
    fichero,
    lectura.derrota,
    lectura.victoria,
    caidosSuyos,
    medallas.cuantas,
    enSoulLink && sala.estado.companeroPerdio,
    {
      juego: parseGameCode(huella.gameCode).game?.label ?? null,
      modo: esSoullink(fichero) ? 'soullink' : 'sola',
      companero: conCompanero ? sala.estado.companero : null,
      dificultad,
      fueraDelRanking:
        hayCuenta && modoSoul === 'si' && companeroInicial !== null && (!conCompanero || otraPersona)
          ? `Soul Link empezada con ${companeroInicial} y terminada ${
              conCompanero && peerUsuario ? `con ${peerUsuario}` : 'sin esa persona'
            }`
          : null,
    },
  );
  const reglas = reglasActivas(dificultad, fin.acabada);
  const infracciones = useReglasNuzlocke(fichero, equipo, reglas.primeraCaptura || reglas.muertoEsMuerto);
  const tiposRepetidos = useMemo(
    () =>
      reglas.tipoPrimarioUnico ? tiposPrimariosRepetidos(equipo, sala.estado.equipoCompanero) : undefined,
    [reglas.tipoPrimarioUnico, equipo, sala.estado.equipoCompanero],
  );

  // --- las reglas que se hacen cumplir, igual que en la web ---
  const encuentrosRef = useRef<MemoriaDeEncuentros | null>(null);
  const codigoJuego = huella.gameCode;
  vigilanteRef.current = (antes, ahora, tabla) => {
    if (tabla && ahora.mapa && seCuroElEquipo(antes, ahora)) {
      const aprendida = aprenderCentro(ahora.mapa, tabla);
      if (aprendida !== null) guardarDisposicionDelCentro(codigoJuego, aprendida);
    }
    const propio = infracciones.memoria.propio;

    const reglasDelCentro = {
      muertoEsMuerto: reglas.muertoEsMuerto,
      muertos: infracciones.memoria.muertos,
      tiposRepetidos: reglas.tipoPrimarioUnico ? (tiposRepetidos ?? null) : null,
      disposicionDelCentro: leerDisposicionDelCentro(codigoJuego),
    };
    const resucitado = revividoConObjeto(antes, ahora, reglasDelCentro);
    if (resucitado !== null) {
      infracciones.resucitar(resucitado);
      reglasDelCentro.muertos = reglasDelCentro.muertos.filter(p => p !== resucitado);
      const quien = ahora.equipo?.ranuras.find(p => p.personalidad === resucitado);
      setAviso({texto: `${quien?.mote.trim() || 'Tu Pokémon'} ha vuelto con un Revivir: ya no cuenta como muerto.`, tipo: 'info'});
    }
    const delCentro = juzgarCentro(antes, ahora, reglasDelCentro);
    if (delCentro) return delCentro;

    if (reglas.topeDeNivel && tope) {
      const veredicto = juzgarLider(
        antes,
        ahora,
        {nombre: tope.lider, tope: tope.nivel, equipo: deLaRom.lideres?.[tope.gimnasio - 1] ?? []},
        propio,
      );
      if (veredicto) return veredicto;
    }

    if (!reglas.primeraCaptura || infracciones.memoria.vistos.length < 2) return null;
    const contexto = {propio, rutas: infracciones.memoria.rutas, familia: deLaRom.familia};
    const memoria = encuentrosRef.current ?? leerEncuentros(fichero);
    const lanzada = juzgarPokeball(antes, ahora, memoria, contexto, nombreDeZona);
    if (lanzada) return lanzada;
    const captura = juzgarCaptura(antes, ahora, memoria, contexto, nombreDeZona);
    if (captura) return captura;
    const apuntado = apuntarEncuentro(memoria, ahora, contexto, especies.nombre);
    if (apuntado.memoria !== memoria) {
      encuentrosRef.current = apuntado.memoria;
      guardarEncuentros(fichero, apuntado.memoria);
    }
    if (apuntado.aviso) setAviso({texto: apuntado.aviso, tipo: 'info'});
    return null;
  };
  useEffect(() => {
    encuentrosRef.current = null;
  }, [fichero]);

  // Lo que se deshace se dice.
  useEffect(() => {
    if (lectura.deshecho) setAviso({texto: lectura.deshecho.motivo, tipo: 'error'});
  }, [lectura.deshecho]);

  // --- al companero: el equipo y el mapa ---
  const {enviarEquipo, enviar} = sala;
  useEffect(() => {
    if (equipo) enviarEquipo(equipo, lectura.derrota);
  }, [equipo, lectura.derrota, enviarEquipo, sala.estado.canalListo]);

  const zonasGastadas = useMemo(() => {
    const zonas = new Set(Object.keys(infracciones.memoria.rutas).map(Number));
    for (const p of equipo?.ranuras ?? []) {
      if (p.huevo || p.lugar === null || p.lugar === undefined) continue;
      if (infracciones.memoria.propio !== null && p.entrenador !== infracciones.memoria.propio) continue;
      zonas.add(zonaCanonica(p.lugar));
    }
    return [...zonas].sort((a, b) => a - b);
  }, [infracciones.memoria, equipo]);
  const zonaActual = lectura.mapa ? zonaCanonica(lectura.mapa.zona) : null;
  const claveMapa = `${zonaActual}|${zonasGastadas.join(',')}`;
  useEffect(() => {
    enviar({type: 'mapa', mapa: {zona: zonaActual, gastadas: zonasGastadas}});
  }, [claveMapa, sala.estado.canalListo]);

  // --- el mote, dentro de la partida y a su pareja en una Soul Link ---
  const renombrar = async (personalidad: number, texto: string): Promise<string | null> => {
    const bytes = codificarTexto(texto.trim());
    if (!bytes) {
      return `El mote tiene que tener de 1 a ${LARGO_MOTE} caracteres, y solo letras, números, espacios y signos que el juego conozca.`;
    }
    const estado = await estadoAhora();
    if (!estado) return 'No se ha podido leer la partida.';
    if (enCombate(estado, leerCabecera(estado).codigoJuego) === true) {
      return 'En mitad de un combate no se puede: espera a que acabe.';
    }
    const cambiado = cambiarMoteEnEstado(estado, personalidad, bytes);
    if (!cambiado) return 'Ese Pokémon ya no está en el equipo.';
    return (await cargarEstadoEnBytes(cambiado)) ? null : 'No se ha podido cargar la partida con el mote nuevo.';
  };
  const cambiarMote = async (pokemon: PokemonResumen, nuevo: string): Promise<string | null> => {
    if (infracciones.memoria.propio !== null && pokemon.entrenador !== infracciones.memoria.propio) {
      return 'Solo se le puede cambiar el mote a lo que capturaste tú, como en el juego.';
    }
    const fallo = await renombrar(pokemon.personalidad, nuevo);
    if (!fallo && enSoulLink && pokemon.mote) enviar({type: 'mote', antes: pokemon.mote, nuevo: nuevo.trim()});
    return fallo;
  };
  const moteDelOtro = sala.estado.moteCompanero;
  useEffect(() => {
    if (!moteDelOtro || !enSoulLink) return;
    const pareja = equipo?.ranuras.find(p => !p.huevo && p.mote === moteDelOtro.antes);
    if (!pareja) return;
    void renombrar(pareja.personalidad, moteDelOtro.nuevo).then(fallo =>
      setAviso({
        texto: fallo
          ? `${nombreDelCompanero} ha cambiado el mote de ${moteDelOtro.antes}, pero aquí no se ha podido: ${fallo}`
          : `${nombreDelCompanero} ha llamado ${moteDelOtro.nuevo} a ${moteDelOtro.antes}: su pareja de aquí también se llama así ahora.`,
        tipo: fallo ? 'error' : 'info',
      }),
    );
  }, [moteDelOtro]);

  // --- intercambios: el mismo motor que la web ---
  const io = useMemo<PartidaIO>(() => ({mirar: estadoAhora, cargar: cargarEstadoEnBytes}), []);
  const intercambio = useIntercambioCon(
    io,
    rom,
    fichero,
    (m: PeerMessage) => sala.enviar(m),
    sala.escucharTrato,
  );

  return {
    sala,
    lectura,
    aviso,
    cerrarAviso: () => setAviso(null),
    dificultad,
    reglas,
    tope: reglas.topeDeNivel ? tope : null,
    topes: deLaRom.topes,
    infracciones,
    tiposRepetidos,
    caidosMios,
    caidosSuyos,
    enSoulLink,
    preguntarSoullink,
    elegirSoullink,
    fin,
    zonaActual,
    zonasGastadas,
    cambiarMote,
    intercambio,
    nombreDelCompanero,
  };
};

export type PartidaViva = ReturnType<typeof usePartidaViva>;

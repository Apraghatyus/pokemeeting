// Las reglas que SE HACEN CUMPLIR, no solo se avisan.
//
// 1. LA ENFERMERA NO CURA CON UN MUERTO EN EL EQUIPO. Hay que dejarlo en el PC
//    o liberarlo antes. Revivirlo con un objeto tampoco vale.
// 2. NO SE SALE DEL CENTRO con un muerto, ni -en Nivelada- con un Pokemon cuyo
//    tipo primario se repite entre los equipos: ese hay que guardarlo.
// 3. EN NIVELADA NO SE PELEA CONTRA EL LIDER con alguien por encima de su tope.
// 4. SOLO EL PRIMER ENCUENTRO DE CADA RUTA. El primer Pokemon salvaje que sale
//    en una zona es la unica oportunidad de esa zona: si no se captura, se
//    pierde. Con una excepcion: si ese primero es de una familia que ya llevas
//    en el equipo (el mismo o una de sus evoluciones), no cuenta y el siguiente
//    si.
//
// COMO SE IMPIDE, sin tocar el juego. El equipo se mira cada pocos segundos
// guardando un estado, y se conservan los ultimos estados BUENOS. Si una
// lectura rompe una regla, se vuelve a cargar uno de ellos, lo bastante atras
// para que el jugador no caiga otra vez en lo mismo nada mas cargar: antes de
// hablar con la enfermera, o antes de que empezara el combate. Y se avisa de
// por que. No se escribe nada en la partida que el juego no hubiera escrito.
//
// SABER QUE ESTO ES UN CENTRO. Ningun numero lo dice, pero todos los Centros de
// una region comparten la misma disposicion por dentro. Se aprende la primera
// vez que la enfermera cura al equipo entero (la casa del jugador tambien cura,
// pero es unica y no cuela). Hasta esa primera cura la regla de salir no se
// puede vigilar; la de curar, si.
//
// SABER QUE ESTO ES UN COMBATE SALVAJE. El juego crea a los salvajes con TU
// numero de entrenador, para que al capturarlos ya sean tuyos. Un rival con tu
// numero es salvaje; con otro, de un entrenador. Y el lider se reconoce porque
// lo que saca es exactamente uno de su equipo, leido de la ROM.
//
// Todo lo de aqui es puro: recibe lecturas y memoria y dice que hacer. Cargar
// estados es cosa de `useEquipo`.

import type { EquipoResumen, PokemonResumen } from '@emupoke/protocol';
import {
  esCentro,
  esDelLider,
  TIPO_INTERIOR,
  type MapaInfo,
  type PokemonDeEntrenador,
  type Rival,
} from '@emupoke/pokemon';
import { zonaCanonica } from './zonas';

/** Lo que se sabe de la partida en un momento. */
export type Lectura = {
  equipo: EquipoResumen | null;
  mapa: MapaInfo | null;
  /** El Pokemon que se tiene delante en un combate, o null. */
  rival: Rival | null;
  /**
   * Los bytes del bolsillo de Poke Balls, o null si no se sabe leer. Si cambian
   * en mitad de un combate salvaje, se ha lanzado una. Ver `mochila.ts`.
   */
  balls?: string | null;
};

/**
 * Que hacer cuando se rompe una regla: a que estado volver y que decir.
 *
 * `atras` es cuantos segundos hacia atras como minimo; `antesDe`, la
 * personalidad de un rival: se vuelve a una lectura en la que no estuviera, o
 * sea, a antes de ese combate.
 */
export type Veredicto = {
  motivo: string;
  atras: number;
  antesDe?: number;
};

const vivos = (equipo: EquipoResumen | null): PokemonResumen[] =>
  (equipo?.ranuras ?? []).filter((p) => !p.huevo);

const nombre = (p: PokemonResumen): string => p.mote.trim() || 'ese Pokémon';

/** Segundos atras para deshacer una cura: lo justo para quedar antes de hablar con ella. */
const ATRAS_CURA = 10;
/** Y para deshacer el combate contra el lider: su discurso de antes es largo. */
const ATRAS_LIDER = 15;

// --------------------------------------------------------------- Centro ---

export type ReglasDelCentro = {
  /** Si un debilitado esta muerto (Nuzlocke y Nivelada, con el reto vivo). */
  muertoEsMuerto: boolean;
  /** Personalidades de los que ya han caido, sin contar el laboratorio. */
  muertos: readonly number[];
  /** Tipos primarios que se repiten entre los equipos, si la regla esta activa. */
  tiposRepetidos: ReadonlySet<number> | null;
  /** La disposicion de los Centros de este juego, si ya se aprendio. */
  disposicionDelCentro: number | null;
};

/**
 * Si entre dos lecturas se ha curado al equipo entero, como hace la enfermera.
 *
 * Todos con la vida llena y sin estado ahora, y al menos uno que antes no.
 */
export const seCuroElEquipo = (antes: Lectura | null, ahora: Lectura): boolean => {
  const ahoraVivos = vivos(ahora.equipo);
  if (!antes || ahoraVivos.length === 0) return false;
  if (!ahoraVivos.every((p) => p.psMax !== undefined && p.ps === p.psMax && p.estado === null)) {
    return false;
  }
  const previos = new Map(vivos(antes.equipo).map((p) => [p.personalidad, p]));
  return ahoraVivos.some((p) => {
    const previo = previos.get(p.personalidad);
    return previo !== undefined && (previo.ps !== previo.psMax || previo.estado !== null);
  });
};

/** Quien no puede salir del Centro contigo, y por que. */
const quienNoPuedeSalir = (lectura: Lectura, reglas: ReglasDelCentro): string | null => {
  for (const p of vivos(lectura.equipo)) {
    // Muerto aunque ahora este en pie: dejarlo en el PC y sacarlo le devuelve
    // la vida en el juego, pero para el reto sigue muerto.
    if (reglas.muertoEsMuerto && reglas.muertos.includes(p.personalidad)) {
      return p.estado === 'debilitado'
        ? `No puedes salir del Centro con ${nombre(p)} debilitado. Déjalo en el PC o libéralo.`
        : `No puedes salir del Centro con ${nombre(p)}: está muerto aunque lo hayas sacado del PC. Déjalo en el PC o libéralo.`;
    }
    if (reglas.tiposRepetidos && p.tipos && reglas.tiposRepetidos.has(p.tipos[0])) {
      return `No puedes salir del Centro con ${nombre(p)}: su tipo primario ya lo lleva otro Pokémon de los equipos. Déjalo en el PC.`;
    }
  }
  return null;
};

/**
 * Un muerto que se levanta con un Revivir: la unica forma de volver.
 *
 * Se reconoce porque se levanta EL y no el equipo entero, que es lo que hace
 * la enfermera. Devuelve su personalidad, para quitarlo de los muertos.
 */
export const revividoConObjeto = (
  antes: Lectura | null,
  ahora: Lectura,
  reglas: ReglasDelCentro,
): number | null => {
  if (!antes || !reglas.muertoEsMuerto || seCuroElEquipo(antes, ahora)) return null;
  const previos = new Map(vivos(antes.equipo).map((p) => [p.personalidad, p]));
  const revivido = vivos(ahora.equipo).find((p) => {
    const previo = previos.get(p.personalidad);
    return (
      p.estado !== 'debilitado' &&
      previo?.estado === 'debilitado' &&
      reglas.muertos.includes(p.personalidad)
    );
  });
  return revivido?.personalidad ?? null;
};

/** Las dos reglas del Centro: curar y salir. */
export const juzgarCentro = (
  antes: Lectura | null,
  ahora: Lectura,
  reglas: ReglasDelCentro,
): Veredicto | null => {
  if (!antes) return null;

  // --- un muerto que vuelve a estar en pie, por la enfermera ---
  // Con un Revivir si se puede: eso lo resuelve `revividoConObjeto`, que se
  // mira antes. Lo que llega aqui es la cura del equipo entero.
  if (reglas.muertoEsMuerto && seCuroElEquipo(antes, ahora)) {
    const previos = new Map(vivos(antes.equipo).map((p) => [p.personalidad, p]));
    const revivido = vivos(ahora.equipo).find((p) => {
      const previo = previos.get(p.personalidad);
      return (
        p.estado !== 'debilitado' &&
        previo?.estado === 'debilitado' &&
        reglas.muertos.includes(p.personalidad)
      );
    });
    if (revivido) {
      return {
        motivo: `La enfermera no atiende con ${nombre(revivido)} debilitado en el equipo. Usa un Revivir, o déjalo en el PC o libéralo antes de curar.`,
        atras: ATRAS_CURA,
      };
    }

    // Un muerto en el equipo aunque este en pie: el PC le devuelve la vida al
    // sacarlo, y asi no se veria nunca el paso de debilitado a en pie. La
    // enfermera no atiende igual.
    if (seCuroElEquipo(antes, ahora)) {
      const muerto = vivos(ahora.equipo).find((p) => reglas.muertos.includes(p.personalidad));
      if (muerto) {
        return {
          motivo: `La enfermera no atiende con ${nombre(muerto)} en el equipo: está muerto aunque lo hayas sacado del PC. Solo vuelve con un Revivir; si no, déjalo en el PC o libéralo antes de curar.`,
          atras: ATRAS_CURA,
        };
      }
    }
  }

  // --- salir del Centro con alguien que no deberia ---
  const desde = antes.mapa;
  const hasta = ahora.mapa;
  if (!desde || !hasta || !esCentro(desde, reglas.disposicionDelCentro)) return null;
  const otroMapa = desde.grupo !== hasta.grupo || desde.numero !== hasta.numero;
  // Subir a la planta de arriba sigue siendo estar en el Centro.
  const sigueDentro = hasta.zona === desde.zona && hasta.tipo === TIPO_INTERIOR;
  if (!otroMapa || sigueDentro) return null;

  const motivo = quienNoPuedeSalir(ahora, reglas);
  return motivo ? { motivo, atras: 0 } : null;
};

// ---------------------------------------------------------------- lider ---

/**
 * En Nivelada, el combate contra el lider con alguien por encima de su tope.
 *
 * Se mira al EMPEZAR el combate -un rival nuevo- y se vuelve a antes de el.
 */
export const juzgarLider = (
  antes: Lectura | null,
  ahora: Lectura,
  lider: { nombre: string; tope: number; equipo: readonly PokemonDeEntrenador[] } | null,
  propio: number | null,
): Veredicto | null => {
  const rival = ahora.rival;
  if (!lider || !rival || rival.personalidad === antes?.rival?.personalidad) return null;
  if (propio !== null && rival.entrenador === propio) return null;
  if (!esDelLider(rival, lider.equipo)) return null;

  const pasado = vivos(ahora.equipo).find((p) => p.nivel > lider.tope);
  if (!pasado) return null;
  return {
    motivo: `No puedes pelear contra ${lider.nombre} con ${nombre(pasado)} en nivel ${pasado.nivel}: el tope es ${lider.tope}. Déjalo en el PC o libéralo.`,
    atras: ATRAS_LIDER,
    antesDe: rival.personalidad,
  };
};

// ------------------------------------------------------ primer encuentro ---

/**
 * Lo apuntado de los encuentros de una partida.
 *
 * Por zona, el primer Pokemon salvaje que salio: es la oportunidad de esa
 * zona. Se guarda su personalidad, que es la que tendra si se captura.
 */
export type MemoriaDeEncuentros = {
  zonas: Record<string, { especie: number; personalidad: number }>;
  /** El ultimo rival visto, para saber cuando empieza un combate nuevo. */
  ultimoRival: number | null;
};

export const ENCUENTROS_VACIOS: MemoriaDeEncuentros = { zonas: {}, ultimoRival: null };

export type ContextoDeCaptura = {
  /** Tu numero de entrenador, o null si aun no se sabe. */
  propio: number | null;
  /** Zonas que ya dieron su Pokemon, por personalidad (la memoria de RUTA). */
  rutas: Readonly<Record<string, number>>;
  /** La familia evolutiva de una especie, de ESTA ROM. */
  familia: (especie: number) => number;
};

/**
 * Apunta el primer encuentro de cada zona.
 *
 * Devuelve la memoria nueva y, si toca, un aviso para el jugador (sin deshacer
 * nada): que ese es su encuentro de la zona, o que no cuenta por repetido.
 */
export const apuntarEncuentro = (
  memoria: MemoriaDeEncuentros,
  ahora: Lectura,
  contexto: ContextoDeCaptura,
  nombreDe: (especie: number) => string,
): { memoria: MemoriaDeEncuentros; aviso: string | null } => {
  const rival = ahora.rival;
  if (!rival || rival.personalidad === memoria.ultimoRival) return { memoria, aviso: null };
  const siguiente = { ...memoria, ultimoRival: rival.personalidad };

  // Solo los salvajes: con tu numero de entrenador.
  if (contexto.propio === null || rival.entrenador !== contexto.propio || !ahora.mapa) {
    return { memoria: siguiente, aviso: null };
  }
  const zona = String(zonaCanonica(ahora.mapa.zona));
  if (siguiente.zonas[zona] || contexto.rutas[zona] !== undefined) {
    // Se avisa al empezar: lo que no se puede es lanzarle una Poke Ball.
    return {
      memoria: siguiente,
      aviso: `Esta zona ya tuvo su encuentro: no le lances Poké Balls a ${nombreDe(rival.especie)}.`,
    };
  }

  // Repetido: ya llevas uno de su familia. No gasta la zona.
  const familia = contexto.familia(rival.especie);
  if (vivos(ahora.equipo).some((p) => contexto.familia(p.especie) === familia)) {
    return {
      memoria: siguiente,
      aviso: `${nombreDe(rival.especie)} ya está en tu equipo: no cuenta como el encuentro de esta zona. El siguiente sí.`,
    };
  }

  return {
    memoria: {
      ...siguiente,
      zonas: { ...siguiente.zonas, [zona]: { especie: rival.especie, personalidad: rival.personalidad } },
    },
    aviso: `Primer encuentro de la zona: ${nombreDe(rival.especie)}. Si no lo capturas, la zona queda gastada.`,
  };
};

/** Si en esta zona ya no se puede capturar a ese rival. */
const zonaCerradaPara = (
  zona: number,
  rival: Rival,
  memoria: MemoriaDeEncuentros,
  contexto: ContextoDeCaptura,
): boolean => {
  const clave = String(zona);
  const oportunidad = memoria.zonas[clave];
  if (oportunidad) return oportunidad.personalidad !== rival.personalidad;
  return contexto.rutas[clave] !== undefined;
};

/**
 * Lanzar una Poke Ball en una zona que ya tuvo su encuentro.
 *
 * Se ve en que el bolsillo de Poke Balls cambia en mitad de un combate salvaje.
 * Se vuelve a antes de ese combate, igual que con una captura, pero sin
 * esperar a ver si entra: lanzarla ya es intentarlo.
 *
 * Solo con la bandera de combate (`equipo.enCombate`): fuera de un combate el
 * bolsillo cambia por comprar o por recoger del suelo, y eso no es lanzar.
 */
export const juzgarPokeball = (
  antes: Lectura | null,
  ahora: Lectura,
  memoria: MemoriaDeEncuentros,
  contexto: ContextoDeCaptura,
  nombreDeZona: (zona: number) => string,
): Veredicto | null => {
  const rival = ahora.rival;
  if (!antes || !rival || !ahora.mapa || contexto.propio === null) return null;
  if (rival.entrenador !== contexto.propio || ahora.equipo?.enCombate !== true) return null;
  if (antes.equipo?.enCombate !== true || antes.rival?.personalidad !== rival.personalidad) return null;
  if (!antes.balls || !ahora.balls || antes.balls === ahora.balls) return null;

  const zona = zonaCanonica(ahora.mapa.zona);
  if (!zonaCerradaPara(zona, rival, memoria, contexto)) return null;
  return {
    motivo: `En ${nombreDeZona(zona)} ya tuviste tu encuentro: no puedes lanzar Poké Balls ahí.`,
    atras: 0,
    antesDe: rival.personalidad,
  };
};

/**
 * Una captura en una zona que ya habia tenido su encuentro.
 *
 * Se ve como un Pokemon nuevo en el equipo, tuyo, de una zona cuya oportunidad
 * era otro. Se vuelve a antes de ese combate.
 */
export const juzgarCaptura = (
  antes: Lectura | null,
  ahora: Lectura,
  memoria: MemoriaDeEncuentros,
  contexto: ContextoDeCaptura,
  nombreDeZona: (zona: number) => string,
): Veredicto | null => {
  if (!antes || contexto.propio === null) return null;
  const yaEstaban = new Set(vivos(antes.equipo).map((p) => p.personalidad));

  for (const p of vivos(ahora.equipo)) {
    if (yaEstaban.has(p.personalidad)) continue;
    if (p.entrenador !== contexto.propio || p.lugar === null || p.lugar === undefined) continue;
    const zona = zonaCanonica(p.lugar);
    const clave = String(zona);
    const oportunidad = memoria.zonas[clave];
    const capturado = contexto.rutas[clave];
    const prohibido =
      (oportunidad !== undefined && oportunidad.personalidad !== p.personalidad) ||
      (oportunidad === undefined && capturado !== undefined && capturado !== p.personalidad);
    if (!prohibido) continue;
    return {
      motivo: `En ${nombreDeZona(zona)} ya tuviste tu encuentro: no puedes capturar otro ahí.`,
      atras: 0,
      antesDe: p.personalidad,
    };
  }
  return null;
};

// -------------------------------------------------- memoria por partida ---

const claveEncuentros = (partida: string) => `emupoke.encuentros.${partida}`;

export const leerEncuentros = (partida: string): MemoriaDeEncuentros => {
  try {
    const crudo = globalThis.localStorage?.getItem(claveEncuentros(partida));
    if (!crudo) return ENCUENTROS_VACIOS;
    const datos = JSON.parse(crudo) as Partial<MemoriaDeEncuentros>;
    return {
      zonas: datos.zonas && typeof datos.zonas === 'object' ? datos.zonas : {},
      ultimoRival: typeof datos.ultimoRival === 'number' ? datos.ultimoRival : null,
    };
  } catch {
    return ENCUENTROS_VACIOS;
  }
};

export const guardarEncuentros = (partida: string, memoria: MemoriaDeEncuentros): void => {
  try {
    globalThis.localStorage?.setItem(claveEncuentros(partida), JSON.stringify(memoria));
  } catch {
    // Sin sitio no se recuerda.
  }
};

export const olvidarEncuentros = (partida: string): void => {
  try {
    globalThis.localStorage?.removeItem(claveEncuentros(partida));
  } catch {
    // No estorba.
  }
};

const claveCentro = (juego: string) => `emupoke.centro.${juego}`;

/** La disposicion de los Centros aprendida para este juego, si la hay. */
export const leerDisposicionDelCentro = (juego: string): number | null => {
  try {
    const valor = Number(globalThis.localStorage?.getItem(claveCentro(juego)));
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
};

export const guardarDisposicionDelCentro = (juego: string, disposicion: number): void => {
  try {
    globalThis.localStorage?.setItem(claveCentro(juego), String(disposicion));
  } catch {
    // Sin almacenamiento se vuelve a aprender la proxima vez.
  }
};

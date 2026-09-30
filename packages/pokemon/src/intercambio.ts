// Un intercambio, visto desde una sola partida.
//
// La forma del intercambio es deliberadamente asimetrica: cada lado lee de su
// propia partida lo que entrega, y escribe en su propia partida lo que recibe.
// Nadie toca el estado del otro. Lo unico que cruza la red son cien bytes, y
// por eso no hace falta que las dos ROMs sean el mismo fichero: un estado esta
// atado a su ROM, pero un Pokemon no.
//
// Que las dos copias esten aleatorizadas por separado no es un problema a
// resolver, es el caso normal de este proyecto. El Pokemon llega con su
// especie y su nombre intactos; lo que cambia es que en la ROM que lo recibe
// esa especie puede tener otras estadisticas, otro tipo y otra habilidad.

import { leerPokemon } from './gen3';
import {
  escribirContador,
  escribirEnRanura,
  IntercambioInvalidoError,
  localizarEquipo,
  validarRecibido,
  type Equipo,
} from './equipo';
import { recalcularEnBloque } from './estadisticas';
import {
  describirTipos,
  encontrarTablaEstadisticas,
  encontrarTablaNombres,
  type EstadisticasBase,
} from './rom';
import { leerTexto } from './texto';

/**
 * Hasta donde puede llegar un indice sin corromper la partida que recibe.
 *
 * Los movimientos y los objetos de tercera generacion son un conjunto cerrado:
 * el randomizer reparte los que ya existen, no inventa nuevos. Las especies si
 * se leen de la ROM, porque ahi si conviene contar lo que hay de verdad.
 */
export type Limites = { maxEspecie: number; maxMovimiento: number; maxObjeto: number };

const MOVIMIENTOS_GEN3 = 354;
const OBJETOS_GEN3 = 377;

export const limitesDeRom = (rom: Uint8Array): Limites => {
  const tabla = encontrarTablaEstadisticas(rom);
  return {
    maxEspecie: tabla ? tabla.especies - 1 : 411,
    maxMovimiento: MOVIMIENTOS_GEN3,
    maxObjeto: OBJETOS_GEN3,
  };
};

/**
 * Todo lo que hay que saber de una ROM para recibir un Pokemon en ella.
 *
 * Se arma una vez y se reutiliza: localizar las tablas recorre los dieciseis
 * megas del fichero, y no tiene sentido repetirlo en cada intercambio.
 */
export type ContextoRom = {
  limites: Limites;
  estadisticas: (especie: number) => EstadisticasBase | null;
  nombre: (especie: number) => string;
};

export const contextoDeRom = (rom: Uint8Array): ContextoRom => {
  const stats = encontrarTablaEstadisticas(rom);
  const nombres = encontrarTablaNombres(rom);
  return {
    limites: limitesDeRom(rom),
    estadisticas: (especie) => stats?.estadisticas(especie) ?? null,
    nombre: (especie) => nombres?.nombre(especie) ?? `especie ${especie}`,
  };
};

/** Lo que se manda por la red: cien bytes y lo justo para poder anunciarlo. */
export type Oferta = {
  bloque: Uint8Array;
  especie: number;
  mote: string;
  nivel: number;
};

/**
 * Coge de la propia partida el Pokemon que se va a entregar.
 *
 * Se copia el bloque, no se borra nada: mientras el companero no confirme, la
 * partida de quien ofrece sigue igual. Quitarlo antes de tiempo es como se
 * pierde un Pokemon si la conexion se corta a medias.
 */
export const prepararOferta = (estado: Uint8Array, indice: number): Oferta => {
  const equipo = localizarEquipo(estado);
  if (!equipo) throw new IntercambioInvalidoError('No encuentro tu equipo en la partida.');
  const ranura = equipo.ranuras[indice];
  if (!ranura) {
    throw new IntercambioInvalidoError(`No tienes ningun Pokemon en la ranura ${indice + 1}.`);
  }
  return {
    bloque: ranura.bloque.slice(),
    especie: ranura.pokemon.especie,
    mote: leerTexto(ranura.pokemon.moteBruto),
    nivel: ranura.pokemon.nivel,
  };
};

export type Recepcion = {
  /** El estado nuevo, listo para cargar. El original no se toca. */
  estado: Uint8Array;
  equipo: Equipo;
};

/**
 * Mete en la propia partida el Pokemon recibido, en el sitio del que se entrego.
 *
 * Se valida siempre contra los limites de **la ROM que recibe**, no de la que
 * envia: un indice que existe en la copia del companero puede no existir en la
 * nuestra, y eso no da un Pokemon raro, da un "Bad Egg".
 *
 * El contador puede venir a null, y casi siempre da igual: en un intercambio
 * normal el que llega ocupa el hueco del que se fue y el equipo sigue teniendo
 * los mismos Pokemon. Solo hace falta saber donde esta el contador cuando el
 * equipo crece, y entonces se dice en vez de escribir a ciegas.
 */
export const aplicarRecepcion = (
  estado: Uint8Array,
  direccionContador: number | null,
  indice: number,
  bloque: Uint8Array,
  contexto: ContextoRom,
): Recepcion => {
  const veredicto = validarRecibido(bloque, contexto.limites);
  if (!veredicto.ok) throw new IntercambioInvalidoError(veredicto.motivo);

  const equipo = localizarEquipo(estado);
  if (!equipo) throw new IntercambioInvalidoError('No encuentro tu equipo en la partida.');

  // Un Pokemon guarda sus estadisticas ya calculadas y el juego solo las rehace
  // al subir de nivel. Si viene de una copia aleatorizada distinta, esas
  // estadisticas son las de la ROM de origen: hay que recalcularlas aqui o
  // arrastraria numeros ajenos durante media partida.
  const base = contexto.estadisticas(leerPokemon(bloque).especie);
  const ajustado = base ? recalcularEnBloque(bloque, base) : bloque;

  const nuevo = escribirEnRanura(estado, equipo.direccion, indice, ajustado);

  const cuantos = Math.max(equipo.ranuras.length, indice + 1);
  let conContador = nuevo;
  if (cuantos !== equipo.ranuras.length) {
    if (direccionContador === null) {
      throw new IntercambioInvalidoError(
        'El equipo crecería y no se donde guarda este juego cuantos Pokemon lleva, asi que no lo toco.',
      );
    }
    conContador = escribirContador(nuevo, direccionContador, cuantos);
  }

  const comprobado = localizarEquipo(conContador);
  if (!comprobado || !comprobado.ranuras[indice]?.pokemon.valido) {
    throw new IntercambioInvalidoError(
      'El Pokemon no quedo bien escrito en la partida, asi que no se aplica el cambio.',
    );
  }
  return { estado: conContador, equipo: comprobado };
};

/**
 * Explica en palabras que cambia al cruzar dos copias aleatorizadas distintas.
 *
 * Existe porque este es el punto donde un jugador se sorprende: entrega un
 * Bulbasaur de Planta y al companero le llega un Bulbasaur de Dragon. Mejor
 * decirlo antes que despues.
 */
export const describirTrato = (
  oferta: Oferta,
  romPropia: Uint8Array,
  romDestino: Uint8Array,
): string[] => {
  const aqui = encontrarTablaEstadisticas(romPropia)?.estadisticas(oferta.especie);
  const alli = encontrarTablaEstadisticas(romDestino)?.estadisticas(oferta.especie);
  const nombre =
    encontrarTablaNombres(romDestino)?.nombre(oferta.especie) ??
    encontrarTablaNombres(romPropia)?.nombre(oferta.especie) ??
    `especie ${oferta.especie}`;

  const lineas = [`Entregas ${nombre} "${oferta.mote}" de nivel ${oferta.nivel}.`];
  if (!aqui || !alli) return lineas;

  const resumir = (e: NonNullable<typeof aqui>) =>
    `${describirTipos(e.tipos)}, ${e.ps}/${e.ataque}/${e.defensa}/${e.velocidad}/${e.ataqueEspecial}/${e.defensaEspecial}`;

  lineas.push(`En tu copia ${nombre} es ${resumir(aqui)}.`);
  const igual =
    aqui.total === alli.total &&
    aqui.ps === alli.ps &&
    aqui.tipos[0] === alli.tipos[0] &&
    aqui.habilidades[0] === alli.habilidades[0];
  lineas.push(
    igual
      ? 'En la copia de tu companero es igual: llegara tal cual lo conoces.'
      : `En la copia de tu companero es ${resumir(alli)}: llega con el mismo nombre, y ahi sus estadisticas se rehacen con esos datos.`,
  );
  return lineas;
};

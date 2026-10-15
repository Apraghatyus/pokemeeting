// Cuándo se acabó el reto.
//
// En una Nuzlocke o un Soul Link la partida termina cuando se te cae el equipo
// entero. El juego no lo sabe: tú pierdes, vuelves al Centro Pokémon y la
// aventura sigue. O sea que esto no es leer un dato, es **aplicar una regla**,
// y por eso vive aquí y no en el lector de memoria.
//
// Eso tiene una consecuencia que conviene tener presente: el final lo decide
// esta regla, así que si la regla se equivoca, al jugador le aparece un cartel
// de "se acabó" en mitad de una partida que no se ha acabado. De ahí las dos
// precauciones de abajo.

import { useCallback, useEffect, useRef, useState } from 'react';
import { apuntarPartidaTerminada, type Apunte } from './historial';
import type { EquipoResumen } from '@emupoke/protocol';
import { parejaCaida } from '@emupoke/pokemon';

// ESTA REGLA SE HA EQUIVOCADO TRES VECES. Las tres están aquí porque la forma
// de la regla de ahora es la consecuencia de todas, y sin ellas parece
// complicada de más.
//
//   1. Exigía haber tenido DOS Pokémon distintos, para que el combate del
//      laboratorio -donde solo tienes al inicial- quedara fuera por
//      construcción. Falló: alguien salió con su inicial a buscar el segundo, se
//      lo debilitaron antes de capturar nada, y no apareció nada. Perder antes
//      de la primera captura no es un caso raro: es de las formas más normales
//      de que se acabe una Nuzlocke.
//
//   2. Así que se quitó el mínimo y quedó la regla simple -si lo que tienes está
//      debilitado, se acabó-, confiando en que la ✕ limpiara el cartel de más.
//      También falló, y se vio igual de claro: el cartel salta en el combate del
//      laboratorio, encima del propio diálogo del rival. Un falso final en el
//      minuto dos no es un clic de molestia, es que el reto empieza roto.
//
// LO QUE SEPARA LOS DOS CASOS no es cuántos Pokémon tienes: es **quién lo dice**.
// Al perder de verdad, el juego te manda al Centro Pokémon y lo anuncia ("…fue
// corriendo a un CENTRO PKMN…"). Al perder en el laboratorio no pasa nada de
// eso: el rival se burla y te quedas donde estabas. O sea que el mensaje del
// juego distingue solo los dos casos, sin contar Pokémon.
//
// Así que hay dos caminos y no uno:
//
//   - **Lo dice el juego** -> se acabó, aunque solo tuvieras un Pokémon. Esto es
//     el caso (1), y es el camino bueno.
//   - **Lo deduce el equipo caído** -> respaldo, por si el mensaje no se
//     reconoce, y entonces sí se exigen dos Pokémon. Esto deja fuera el caso (2)
//     por construcción, porque en el laboratorio solo puedes tener uno.
//
//   3. Y faltaba la mitad del problema: el Soul Link. Una pareja caída la
//      reporta el compañero desde SU partida, y a ese camino se le quitó el
//      mínimo de dos Pokémon porque, con uno solo, un Soul Link no acababa
//      nunca. Entonces pasó esto: en el combate del laboratorio, a ella le
//      ganaron, su inicial se quedó a cero, y a ÉL le saltó la pantalla de fin
//      de partida en el minuto dos. El primer combate no cuenta para nadie, y
//      hasta aquí contaba para el de enfrente.
//
// LO QUE SEPARA ESE CASO del de verdad tampoco es contar Pokémon: desde fuera
// se ven igual -un único Pokémon a cero-. Es, otra vez, **quién lo dice**. Si a
// ella la derrotaron de verdad, su juego se lo dijo; en el laboratorio no. Así
// que esa señal viaja: el mensaje del equipo lleva `perdio`, que no es "mis
// Pokémon están a cero" sino "mi juego ha cantado la derrota".
//
// Con eso, una pareja caída acaba tu partida si **el juego del otro lo dijo**, o
// si ya has pasado del tutorial por tu cuenta. En el laboratorio no se cumple
// ninguna de las dos, y eso es exactamente lo que se quería.
//
// La ✕ sigue estando para lo que la regla no pueda saber -las cajas no se leen,
// así que quien guarde Pokémon sanos ahí vería un final que no lo es-, pero ya
// no se le pide que tape el combate del tutorial.

export type FinDePartida = {
  /** Si hay que enseñar el cartel ahora mismo. */
  terminada: boolean;
  /**
   * Si el reto ya se acabo, aunque se este siguiendo la partida.
   *
   * No es lo mismo que `terminada`, que dice si hay que ENSEÑAR el cartel.
   * Esto es lo que apaga las reglas de la dificultad: despues de caer se puede
   * seguir jugando, pero ya no se compite y no hay nada que vigilar.
   */
  acabada: boolean;
  /**
   * Si se acabo por el Soul Link y no por tu propia partida.
   *
   * Importa para contarlo: en ese caso tus Pokemon siguen vivos en el juego, y
   * un cartel que diga "se te cayo el equipo" no cuadra con lo que ves.
   */
  porElEnlace: boolean;
  /**
   * Si lo que te dejo sin equipo fue el tope de nivel.
   *
   * Importa para contarlo: el que queda sigue en pie, asi que decir "tu
   * equipo ha caido al completo" no cuadraria con lo que se ve en pantalla.
   */
  porElTope: boolean;
  /**
   * Como acabo: ganando o perdiendo.
   *
   * Por defecto 'derrota', que es el caso que se decide por regla nuestra. La
   * victoria solo se pone cuando el propio juego la canta, asi que no se
   * inventa nunca.
   */
  resultado: Resultado;
  /** El equipo tal y como quedó, para poder enseñarlo aunque luego cambie. */
  equipoFinal: EquipoResumen | null;
  /**
   * Si esta partida siguió jugándose después de caer.
   *
   * Importa para las estadísticas: lo que venga después de un fin de partida no
   * puede contar, porque si contara bastaría con seguir hasta ganar.
   */
  continuada: boolean;
  /** "Seguir jugando": cierra el cartel y marca la partida como continuada. */
  continuar: () => void;
  /** Cierra el cartel sin dar nada por terminado. Para un falso positivo. */
  descartar: () => void;
};

export type Resultado = 'victoria' | 'derrota';

type Guardado = {
  /** Como acabo, si acabo. */
  resultado: Resultado;
  /** Si lo que lo acabo fue el Soul Link y no tu propia partida. */
  porElEnlace: boolean;
  porElTope: boolean;
  /** Personalidades distintas vistas en el equipo. De aquí sale el mínimo. */
  vistos: number[];
  /** Si ya se dio por terminada, para no repetir el cartel en cada lectura. */
  terminada: boolean;
  continuada: boolean;
};

const VACIO: Guardado = {
  vistos: [],
  terminada: false,
  continuada: false,
  resultado: 'derrota',
  porElEnlace: false,
  porElTope: false,
};

const clave = (partida: string) => `emupoke.fin.${partida}`;

const leer = (partida: string): Guardado => {
  try {
    const crudo = localStorage.getItem(clave(partida));
    if (!crudo) return { ...VACIO };
    const guardado = JSON.parse(crudo) as Partial<Guardado>;
    return {
      vistos: Array.isArray(guardado.vistos) ? guardado.vistos : [],
      terminada: guardado.terminada === true,
      continuada: guardado.continuada === true,
      resultado: guardado.resultado === 'victoria' ? 'victoria' : 'derrota',
      porElEnlace: guardado.porElEnlace === true,
      porElTope: guardado.porElTope === true,
    };
  } catch {
    return { ...VACIO };
  }
};

/**
 * Si esa partida ya habia terminado, de una forma o de otra.
 *
 * La usa el boton de borrar: una partida terminada que se borra no es una
 * partida descartada, es una partida acabada cuya copia ya no hace falta.
 * Apuntarla otra vez como descartada contaria dos veces el mismo final.
 */
export const yaTermino = (partida: string): boolean => leer(partida).terminada;

const escribir = (partida: string, estado: Guardado): void => {
  try {
    localStorage.setItem(clave(partida), JSON.stringify(estado));
  } catch {
    // Sin almacenamiento la regla vale para esta sesion y ya. No es critico:
    // lo peor que pasa es que el cartel vuelva a salir al recargar.
  }
};

/**
 * Cuántos Pokémon distintos hacen falta para fiarse del equipo caído.
 *
 * Dos, y el número sale de un sitio concreto: en el combate del laboratorio solo
 * puedes tener uno. No es un umbral elegido a ojo, es la forma de decir "esto no
 * es el tutorial" sin tener que reconocer el tutorial.
 *
 * Solo manda en el camino de respaldo. Cuando lo dice el juego, con uno basta.
 */
const MINIMO_PARA_DEDUCIRLO = 2;

/** Si todos los que hay están debilitados. Sin Pokémon no hay nada que decidir. */
/**
 * Si no le queda a nadie en pie, contando a los que mato el Soul Link.
 *
 * En un Soul Link los Pokemon van emparejados: si al companero se le debilita
 * el suyo, el tuyo tambien esta muerto para el reto **aunque en tu partida siga
 * vivo**. Eso no era un fin de partida y deberia serlo: puedes quedarte sin
 * nadie con quien seguir sin que tu juego se entere de nada.
 *
 * Se devuelve tambien POR QUE, porque el cartel tiene que explicarlo: decir
 * "tu equipo ha caido al completo" mientras el panel ensena un Pokemon con
 * todos sus PS es lo que confunde a quien lo ve.
 */
const equipoCaido = (
  equipo: EquipoResumen | null,
  caidosDelCompanero: ReadonlySet<string>,
  /**
   * El tope de nivel que hay que respetar, o null si esa regla no esta.
   *
   * En Nivelada, quien se pasa del tope del proximo lider NO se puede usar. No
   * esta muerto -y por eso no se cuenta como caido en el historial- pero para
   * seguir jugando es como si no estuviera: si es el unico que queda, no hay
   * con que pelear y la partida se acabo.
   *
   * Lo reporto quien jugaba: dos debilitados y uno pasado de nivel, y no salia
   * nada. Tenia razon, porque mirando el equipo parecia que le quedaba uno.
   */
  tope: number | null,
): { caido: boolean; porElEnlace: boolean; porElTope: boolean } => {
  const vivos = equipo?.ranuras ?? [];
  // Un huevo no cuenta ni a favor ni en contra: no pelea y no se debilita.
  const pelean = vivos.filter((r) => !r.huevo);
  if (pelean.length === 0) return { caido: false, porElEnlace: false, porElTope: false };

  let porElEnlace = false;
  let porElTope = false;
  const caido = pelean.every((ranura) => {
    if (ranura.estado === 'debilitado') return true;
    if (parejaCaida(ranura.mote, caidosDelCompanero)) {
      porElEnlace = true;
      return true;
    }
    // Pasado del tope: no vale para seguir. Va el ultimo a proposito, para que
    // `porElEnlace` solo se encienda cuando de verdad fue el enlace.
    if (tope !== null && ranura.nivel > tope) {
      porElTope = true;
      return true;
    }
    return false;
  });

  // Se apuntan para poder CONTARLO bien: no es lo mismo quedarse sin nadie
  // porque se murieron todos que porque el ultimo no se puede usar. El cartel
  // lo dice distinto, y con razon: en el segundo caso sigue en pie.
  return { caido, porElEnlace: caido && porElEnlace, porElTope: caido && porElTope };
};

/**
 * @param equipo   el equipo tal y como se está leyendo ahora
 * @param partida  con qué partida se asocia esto; al cambiar, se empieza de cero
 */
export const useFinDePartida = (
  equipo: EquipoResumen | null,
  partida: string | null,
  /**
   * Si el juego esta diciendo que has perdido.
   *
   * Es la señal buena, y la del equipo se queda como respaldo: al perder, el
   * Centro Pokemon te cura, asi que "todos a cero" dura unos segundos y entre
   * dos lecturas se puede escapar. El mensaje, en cambio, lo dice el juego en
   * el momento exacto.
   */
  derrota = false,
  /**
   * Si el juego esta diciendo que has ganado.
   *
   * Esta no es una regla nuestra como la del equipo caido: es el juego
   * ensenando el Salon de la Fama. Por eso manda sobre todo lo demas.
   */
  victoria = false,
  /**
   * Motes que han caido en el equipo del companero.
   *
   * Vacio cuando se juega solo, y entonces esto no cambia nada: sin companero
   * no hay parejas que se puedan morir en otra partida.
   */
  caidosDelCompanero: ReadonlySet<string> = new Set(),
  /**
   * Cuantas medallas llevaba, para apuntarlo en el historial.
   *
   * No cambia nada de lo que se ensena: es por donde iba la partida cuando se
   * acabo, que es la mitad de lo que hace interesante un historial.
   */
  medallas: number | null = null,
  /**
   * Si al companero su juego le ha cantado una derrota.
   *
   * Es lo que separa "se le murio su unico Pokemon" de "le ganaron el combate
   * del laboratorio": desde aqui las dos se ven igual, un Pokemon suyo a cero
   * con el mote de uno mio. Sin esto, el tutorial de uno acababa la partida del
   * otro.
   */
  companeroPerdio = false,
  /**
   * El tope de nivel del proximo lider, o null si no hay esa regla.
   *
   * Solo lo manda la dificultad Nivelada. En Normal y en Nuzlocke pasarse de
   * nivel no es nada, asi que aqui llega null y no cambia ninguna cuenta.
   */
  topeDeNivel: number | null = null,
  /**
   * De que juego es, como se jugo y con quien.
   *
   * Nada de esto cambia lo que se ensena: es lo que hace falta para que el
   * ranking pueda separar una Nuzlocke en solitario de una de Soul Link, y
   * filtrar por juego. Son datos que solo se saben MIENTRAS se juega, asi que
   * o se apuntan aqui o no se apuntan nunca.
   */
  apunte: Apunte = {},
): FinDePartida => {
  const [estado, setEstado] = useState<Guardado>(VACIO);
  const [equipoFinal, setEquipoFinal] = useState<EquipoResumen | null>(null);
  const [descartada, setDescartada] = useState(false);

  // Al cambiar de partida no vale nada de lo aprendido de la anterior.
  useEffect(() => {
    setEstado(partida ? leer(partida) : VACIO);
    setEquipoFinal(null);
    setDescartada(false);
    decidido.current = false;
  }, [partida]);

  // El equipo cambia en cada lectura; se mira por referencia para no reaccionar
  // a lecturas que dicen lo mismo.
  const ultimo = useRef<EquipoResumen | null>(null);
  // Y lo ultimo que se supo del companero: si dice que perdio despues de la
  // ultima lectura del equipo, hay que volver a decidir aunque el equipo sea
  // el mismo de antes. En una partida que ya se acabo puede no haber mas
  // lecturas distintas, y entonces el final no llegaria nunca.
  const perdioVisto = useRef(false);
  // Y el ultimo tope que se miro: al ganar una medalla sube, y con el sube lo
  // que se puede usar. Sin esto, con el mismo equipo no se volveria a mirar.
  const topeVisto = useRef<number | null>(null);

  useEffect(() => {
    if (!partida || !equipo) return;
    if (
      ultimo.current === equipo &&
      perdioVisto.current === companeroPerdio &&
      topeVisto.current === topeDeNivel
    ) {
      return;
    }
    ultimo.current = equipo;
    perdioVisto.current = companeroPerdio;
    topeVisto.current = topeDeNivel;

    setEstado((previo) => {
      // Se apuntan los que van apareciendo. La personalidad no cambia nunca, asi
      // que sirve para contar Pokemon distintos aunque entren y salgan del equipo.
      const vistos = new Set(previo.vistos);
      for (const ranura of equipo.ranuras) {
        if (!ranura.huevo) vistos.add(ranura.personalidad);
      }

      // La victoria manda: si el juego esta ensenando el Salon de la Fama, da
      // igual como este el equipo. Y lo que ya se decidio no se cambia, para
      // que una partida continuada no reescriba su propio final.
      //
      // Deducir que se acabo pide una de dos cosas, y ninguna se cumple en el
      // combate del laboratorio -que es justo lo que se busca-:
      //
      //   - Haber pasado del tutorial por tu cuenta: dos Pokemon distintos, que
      //     ahi no puedes tener.
      //   - O que al companero se lo haya dicho SU juego. Que su Pokemon este a
      //     cero no basta: en el laboratorio se queda a cero por guion.
      //
      // Cuando lo dice tu propio juego no hace falta deducir nada, y por eso
      // `derrota` va por su lado: ese camino si vale con un solo Pokemon.
      const sinNadie = equipoCaido(equipo, caidosDelCompanero, topeDeNivel);
      const loDeduzco =
        sinNadie.caido &&
        (vistos.size >= MINIMO_PARA_DEDUCIRLO || (sinNadie.porElEnlace && companeroPerdio));
      const acabaAhora = victoria || derrota || loDeduzco;

      const siguiente: Guardado = {
        ...previo,
        vistos: [...vistos],
        terminada: previo.terminada || acabaAhora,
        porElEnlace: previo.terminada ? previo.porElEnlace : sinNadie.porElEnlace,
        porElTope: previo.terminada ? previo.porElTope : sinNadie.porElTope,
        resultado: previo.terminada
          ? previo.resultado
          : victoria
            ? 'victoria'
            : previo.resultado,
      };

      // Guardar el equipo del momento exacto: despues el jugador revive a
      // alguno en el Centro Pokemon y el cartel enseñaria algo que ya no fue.
      if (siguiente.terminada && !previo.terminada) setEquipoFinal(equipo);

      return siguiente;
    });
  }, [equipo, partida, derrota, victoria]);

  // El historial, que no se ensena en ningun sitio todavia.
  //
  // Se recoge ahora para que el dia que haya cuentas y perfiles exista algo que
  // contar: una partida terminada no se vuelve a jugar, asi que lo que no se
  // apunte hoy se pierde. Ver `historial.ts`.
  //
  // Va atado a `equipoFinal`, que es la foto del momento exacto en que se
  // acabo: despues el jugador revive a alguno en el Centro Pokemon y lo que se
  // guardaria ya no seria lo que paso.
  const apuntado = useRef<string | null>(null);
  useEffect(() => {
    if (!partida || !estado.terminada) return;
    // Una vez por partida y por sesion. `apuntarPartidaTerminada` ademas no
    // repite lo que ya tenga apuntado, asi que recargar tampoco duplica.
    if (apuntado.current === partida) return;

    // La foto si la hay, y si no el equipo de ahora. La foto solo existe cuando
    // la partida se acaba con la pagina abierta; quien la termino ayer y vuelve
    // hoy no tiene ninguna, y sin esto su partida no se apuntaria nunca.
    const foto = equipoFinal ?? equipo;
    // Pero no se apunta un equipo vacio. Al abrir, el juego esta en su pantalla
    // de titulo unos segundos: apuntarlo ahi dejaria guardada para siempre una
    // partida sin Pokemon, porque esto solo escribe una vez.
    if (!foto || foto.ranuras.length === 0) return;

    apuntado.current = partida;
    apuntarPartidaTerminada(
      partida,
      estado.resultado ?? 'derrota',
      estado.porElEnlace === true,
      medallas,
      foto,
      apunte,
    );
  }, [
    partida,
    equipo,
    equipoFinal,
    estado.terminada,
    estado.resultado,
    estado.porElEnlace,
    medallas,
    // Si el companero dice que perdio DESPUES de la ultima lectura del equipo,
    // hay que volver a mirar: si no, el final llegaria con el siguiente cambio
    // de equipo, que en una partida acabada puede no llegar nunca.
    companeroPerdio,
    // Y lo mismo con el tope: al ganar una medalla sube, y con el sube lo que
    // se puede usar. Sin esto, un equipo que estaba bloqueado seguiria dandose
    // por acabado hasta la siguiente lectura.
    topeDeNivel,
  ]);

  // Se guarda aqui y no dentro del updater: un updater tiene que ser puro, y
  // guardando desde fuera no hay forma de escribir un estado a medias.
  useEffect(() => {
    if (!partida) return;
    if (estado === VACIO) return;
    escribir(partida, estado);
  }, [partida, estado]);

  /**
   * Si el jugador ya eligio, para que cerrar el dialogo no vuelva a decidir.
   *
   * Hace falta por como funciona un <dialog>: al cerrarse dispara su evento
   * `close`, y ese evento esta atado a `descartar`. Sin esta marca, pulsar
   * "seguir jugando" cerraba el cartel y el cierre llamaba a descartar acto
   * seguido, que borraba la marca de terminada justo despues de ponerla. O sea
   * que la partida seguia contando para las estadisticas.
   */
  const decidido = useRef(false);

  const continuar = useCallback(() => {
    decidido.current = true;
    setDescartada(true);
    setEstado((previo) => ({ ...previo, continuada: true }));
  }, []);

  /**
   * Para un falso positivo: se cierra y se olvida que paso.
   *
   * Hace falta porque la regla puede equivocarse -las cajas no se leen, asi que
   * quien tenga Pokemon sanos guardados veria un fin de partida que no lo es- y
   * cuando se equivoca, el jugador necesita poder zanjarlo.
   */
  const descartar = useCallback(() => {
    // Si ya se eligio seguir o reiniciar, esto es solo el cierre del dialogo.
    if (decidido.current) return;
    decidido.current = true;
    setDescartada(true);
    setEstado((previo) => ({ ...previo, terminada: false }));
    setEquipoFinal(null);
  }, []);

  return {
    // Ya decidido, no se vuelve a preguntar: `continuada` sobrevive a recargar
    // la pagina, y sin mirarlo el cartel salia otra vez en cada arranque.
    terminada: estado.terminada && !estado.continuada && !descartada,
    acabada: estado.terminada,
    resultado: estado.resultado,
    porElEnlace: estado.porElEnlace,
    porElTope: estado.porElTope,
    equipoFinal,
    continuada: estado.continuada,
    continuar,
    descartar,
  };
};

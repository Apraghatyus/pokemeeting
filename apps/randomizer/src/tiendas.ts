// Las tiendas que el randomizer no toca.
//
// EL PROBLEMA, Y COSTO ENCONTRARLO. Se marcaba "Objetos de tienda", el
// randomizer decia que las habia cambiado, y al entrar en la primera tienda del
// juego seguian la Poke Ball, la Pocion, el Antidoto y el Antiparaliz de
// siempre. No era un fallo nuestro ni una opcion mal pasada: el Universal
// Randomizer trae, en su propia base de datos de ROMs, una lista `SkipShops`
// con las tiendas que NO va a tocar, y en Rojo Fuego esa lista se come veinte
// de las veintitres. Solo aleatoriza las 12, 13 y 14.
//
// Medido en la ROM espanola: la tienda de Ciudad Verde es la numero 5, en
// 0x16A330, y esta en SkipShops. Las tres que cambiaban -0x16BCC8, 0x16BD1C y
// 0x16BD54- son justo las que su base de datos permite.
//
// Asi que las otras veinte se aleatorizan aqui, despues de que el randomizer
// haga lo suyo.
//
// DE DONDE SALEN LAS DIRECCIONES. De la base de datos del propio randomizer, no
// de una lista nuestra: se lee `gen3_offsets.ini` de dentro de su jar. Copiarlas
// a mano habria significado una lista por cada edicion y cada idioma, y un
// numero mal copiado no se nota al mirar: se nota escribiendo encima de algo
// que no era una tienda.
//
// QUE SE PUEDE VENDER. Solo lo que ya se vendia en alguna tienda de esa ROM.
// Repartir numeros de objeto al azar entre todos los que existen meteria objetos
// clave y MOs en los escaparates, que es pedirle al juego algo que no espera.
// Con el catalogo que ya tiene, cada tienda cambia de genero sin inventarse
// nada.
//
// CADA PLAZA SE CAMBIA POR OTRA DE SU MISMO BOLSILLO, Y ESTO NO ES UN ADORNO:
// es lo que impedia que el juego se colgara.
//
// La primera version repartia los objetos a boleo entre las veinte tiendas. El
// problema es que una de esas veinte -la numero 11 en Rojo Fuego- es la TIENDA
// DE MT, y el juego la enseña con una pantalla distinta: debajo de la lista
// pone el movimiento que enseña la MT seleccionada. Al meterle una Pocion, el
// juego calculaba el movimiento restandole a ese objeto el numero de la MT01,
// se iba fuera de su tabla y leia basura: se veia "Nº??" con un nombre de
// letras sueltas, y el juego se colgaba poco despues.
//
// Por eso el randomizer se la salta, y por eso hay que saltarsela tambien
// cuando se reparte. La regla general evita este caso y todos los de su
// familia: un hueco que vendia una MT seguira vendiendo una MT, uno que vendia
// una ball seguira vendiendo una ball, y uno de pociones seguira siendo del
// mismo bolsillo. De paso sale gratis lo que antes habia que forzar a mano: una
// tienda que vendia balls las sigue vendiendo, que es lo que impide que una
// Nuzlocke se quede sin forma de comprarlas.
//
// EL BOLSILLO SE LEE DE LA ROM, no de una lista: en Rojo Fuego las balls son el
// bolsillo 3 y las MT el 4, pero en Rubi son el 2 y el 3. Una tabla escrita a
// mano habria acertado en un juego y roto el otro.

import { inflateRawSync } from 'node:zlib';

/* ---------- la tabla de objetos ---------- */

/** Lo que ocupa cada objeto en la tabla del juego. */
const OBJETO_ENTRADA = 44;
/** Dentro de esa entrada: 14 bytes de nombre y, justo detras, su propio numero. */
const OBJETO_INDICE = 14;
/** Y en el 0x1A, a que bolsillo de la mochila va. */
const OBJETO_BOLSILLO = 0x1a;
/** Cuantas entradas seguidas tienen que cuadrar para dar la tabla por buena. */
const OBJETOS_PARA_FIARSE = 40;

/**
 * Busca la tabla de objetos por su forma, sin saber donde esta.
 *
 * El ancla es que la entrada N lleva N dentro, en su byte 14. Cuarenta seguidas
 * cumpliendolo no se dan por casualidad en ningun otro sitio de la ROM, y asi
 * no hace falta una direccion por cada edicion y cada idioma.
 */
const tablaDeObjetos = (rom: Buffer): number => {
  const tope = rom.length - OBJETO_ENTRADA * OBJETOS_PARA_FIARSE;
  for (let base = 0; base < tope; base += 4) {
    let cuantas = 0;
    while (
      cuantas < OBJETOS_PARA_FIARSE &&
      rom.readUInt16LE(base + cuantas * OBJETO_ENTRADA + OBJETO_INDICE) === cuantas
    ) {
      cuantas += 1;
    }
    if (cuantas >= OBJETOS_PARA_FIARSE) return base;
  }
  return -1;
};

/**
 * En que bolsillo de la mochila va cada objeto, o -1 si no se sabe.
 *
 * Es lo que decide con que se puede cambiar cada plaza: una MT solo por otra
 * MT, una ball solo por otra ball. Ver la cabecera.
 */
const bolsilloDe = (rom: Buffer, base: number, id: number): number => {
  const donde = base + id * OBJETO_ENTRADA;
  if (base < 0 || donde + OBJETO_ENTRADA > rom.length) return -1;
  // Si la entrada no se nombra a si misma, ese numero no es un objeto de
  // verdad: es uno de los huecos de relleno que tiene la tabla.
  if (rom.readUInt16LE(donde + OBJETO_INDICE) !== id) return -1;
  return rom.readUInt8(donde + OBJETO_BOLSILLO);
};

/**
 * Revivir y Max. Revivir, que NO pueden salir en una tienda.
 *
 * POR QUE. Si se pueden comprar, revivir es cuestion de dinero y la regla de
 * "un debilitado esta muerto" se queda en un tramite. Dejandolos solo en el
 * suelo -donde los reparte el randomizer con otra opcion, y ahi no se tocan-,
 * encontrarse uno tirado en una ruta es un golpe de suerte de verdad.
 *
 * DE DONDE SALEN ESTOS DOS NUMEROS. No de una lista copiada: la tienda de
 * Ciudad Verde vende `4,13,14,18` y el juego las enseña como Poke Ball, Pocion,
 * Antidoto y Antiparaliz, a 200, 300, 100 y 200 -nombres Y precios cuadran con
 * la tabla de objetos de siempre-. En esa misma tabla el 24 es Revivir y el 25
 * Max. Revivir. Lo refuerza una segunda tienda, la de 0x164A4C, que vende
 * `2,3,19,20,21,24,23,85,84`: es la lista de unos grandes almacenes -balls,
 * restaurantes, el 24 en medio y repelentes al final-, justo donde un Revivir
 * encaja y un objeto cualquiera no.
 *
 * Aun asi es una deduccion y no una lectura: el dia que se toque esto, mirar la
 * tienda de Ciudad Azulona dentro del juego lo confirma en cinco minutos.
 */
const REVIVIR = [24, 25];
/** Cuantos objetos existen. Un indice mayor no es un objeto. */
const OBJETO_MAXIMO = 377;
/** Lo mas larga que puede ser la lista de una tienda antes de dar por malo lo leido. */
const MAX_PLAZAS = 24;

/** Donde la cabecera de una ROM de GBA guarda su codigo y su revision. */
const CODIGO = 0xac;
const REVISION = 0xbc;

/* ---------- leer un fichero de dentro del jar ---------- */

/**
 * Saca un fichero de un jar, que no es mas que un zip.
 *
 * Se recorre su directorio central en vez de buscar la firma de cada fichero:
 * la cabecera local no siempre trae los tamanos -depende de como se empaquetara-
 * y entonces no hay forma de saber donde acaba lo comprimido.
 */
const delZip = (zip: Buffer, cual: string): Buffer | null => {
  // El final del directorio central esta al final del fichero, detras de un
  // comentario que puede medir cualquier cosa; se busca hacia atras.
  let fin = -1;
  for (let i = zip.length - 22; i >= 0 && i > zip.length - 0x10000; i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) return null;

  const cuantos = zip.readUInt16LE(fin + 10);
  let puntero = zip.readUInt32LE(fin + 16);

  for (let n = 0; n < cuantos; n += 1) {
    if (zip.readUInt32LE(puntero) !== 0x02014b50) return null;
    const metodo = zip.readUInt16LE(puntero + 10);
    const comprimido = zip.readUInt32LE(puntero + 20);
    const largoNombre = zip.readUInt16LE(puntero + 28);
    const largoExtra = zip.readUInt16LE(puntero + 30);
    const largoComentario = zip.readUInt16LE(puntero + 32);
    const nombre = zip.toString('utf8', puntero + 46, puntero + 46 + largoNombre);

    if (nombre === cual) {
      const local = zip.readUInt32LE(puntero + 42);
      // La cabecera local repite nombre y extra, y los suyos pueden medir otra
      // cosa que los del directorio: hay que leer los de ahi.
      const datos = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const trozo = zip.subarray(datos, datos + comprimido);
      return metodo === 0 ? Buffer.from(trozo) : inflateRawSync(trozo);
    }

    puntero += 46 + largoNombre + largoExtra + largoComentario;
  }
  return null;
};

/* ---------- la base de datos de ROMs del randomizer ---------- */

type Bloque = { nombre: string; claves: Map<string, string> };

/** Parte el .ini en bloques `[Nombre]` con sus claves. */
const leerIni = (texto: string): Bloque[] => {
  const bloques: Bloque[] = [];
  let actual: Bloque | null = null;
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (limpia === '' || limpia.startsWith('//') || limpia.startsWith(';')) continue;
    if (limpia.startsWith('[')) {
      actual = { nombre: limpia.slice(1, limpia.indexOf(']')), claves: new Map() };
      bloques.push(actual);
      continue;
    }
    const corte = limpia.indexOf('=');
    if (corte > 0 && actual) actual.claves.set(limpia.slice(0, corte).trim(), limpia.slice(corte + 1).trim());
  }
  return bloques;
};

/**
 * El valor de una clave, siguiendo los `CopyFrom`.
 *
 * Las entradas de cada idioma heredan de la inglesa casi todo y solo repiten lo
 * que cambia de sitio. Las direcciones de las tiendas SI las repiten -cambian
 * con el idioma-, pero la lista de cuales se saltan no: esa se hereda.
 */
const valorCon = (bloques: Bloque[], bloque: Bloque, clave: string): string | null => {
  const vistos = new Set<string>();
  let actual: Bloque | undefined = bloque;
  while (actual && !vistos.has(actual.nombre)) {
    vistos.add(actual.nombre);
    const valor = actual.claves.get(clave);
    if (valor !== undefined) return valor;
    const padre = actual.claves.get('CopyFrom');
    actual = padre ? bloques.find((b) => b.nombre === padre) : undefined;
  }
  return null;
};

const listaDeNumeros = (valor: string | null): number[] =>
  valor === null
    ? []
    : valor
        .replace(/[[\]]/g, '')
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n));

export type TiendasDeLaRom = {
  /** Donde empieza la lista de cada tienda. */
  offsets: number[];
  /** Cuales se salta el randomizer, que son las que nos tocan a nosotros. */
  saltadas: number[];
};

/**
 * Que tiendas tiene esta ROM, segun la base de datos del randomizer.
 *
 * Devuelve null si no la reconoce. Es lo que hay que hacer: sin saber donde
 * estan las tiendas, escribir a ciegas es romper la copia de alguien.
 */
export const tiendasDeLaRom = (jar: Buffer, rom: Buffer): TiendasDeLaRom | null => {
  const ini = delZip(jar, 'com/dabomstew/pkrandom/config/gen3_offsets.ini');
  if (!ini) return null;

  const codigo = rom.toString('ascii', CODIGO, CODIGO + 4);
  const revision = rom[REVISION] ?? 0;
  const bloques = leerIni(ini.toString('utf8'));
  const mio = bloques.find(
    (b) => b.claves.get('Game') === codigo && Number(b.claves.get('Version') ?? '0') === revision,
  );
  if (!mio) return null;

  const offsets = listaDeNumeros(valorCon(bloques, mio, 'ShopItemOffsets'));
  const saltadas = listaDeNumeros(valorCon(bloques, mio, 'SkipShops'));
  if (offsets.length === 0) return null;

  return { offsets, saltadas };
};

/* ---------- aleatorizar ---------- */

/**
 * Numeros al azar pero siempre los mismos para la misma semilla.
 *
 * Tiene que serlo: una partida se rehace desde su semilla y se compara byte a
 * byte con la original. Un solo objeto distinto y la copia rehecha se rechaza.
 */
const dadoDe = (texto: string) => {
  let estado = 0x9e3779b9;
  for (let i = 0; i < texto.length; i += 1) {
    estado = (Math.imul(estado ^ texto.charCodeAt(i), 0x85ebca6b) >>> 0) + 1;
  }
  return () => {
    estado = (Math.imul(estado ^ (estado >>> 15), 0x2545f491) + 0x6d2b79f5) >>> 0;
    return estado / 0x100000000;
  };
};

/** Lee la lista de una tienda, o null si lo que hay ahi no lo parece. */
const plazasDe = (rom: Buffer, donde: number): number[] | null => {
  if (donde < 0 || donde + 2 > rom.length) return null;
  const plazas: number[] = [];
  for (let i = 0; i < MAX_PLAZAS; i += 1) {
    const sitio = donde + i * 2;
    if (sitio + 2 > rom.length) return null;
    const id = rom.readUInt16LE(sitio);
    // El cero cierra la lista.
    if (id === 0) return plazas.length > 0 ? plazas : null;
    if (id > OBJETO_MAXIMO) return null;
    plazas.push(id);
  }
  return null;
};

/**
 * Si el randomizer aleatorizo las tiendas, mirando la ROM y no lo que se pidio.
 *
 * ESTO NO ES UN RODEO, ES LO UNICO QUE FUNCIONA. Una partida se rehace mandando
 * los ajustes ya resueltos y su semilla, sin la lista de opciones: por ahi no
 * hay ningun 'tiendas' que mirar. Decidiendolo por la peticion, la copia
 * original llevaba las tiendas cambiadas y la rehecha no, y como se comparan
 * byte a byte, la rehecha se rechazaba. Medido: dos CRC distintos.
 *
 * Preguntandoselo a la ROM -si las tres tiendas que el randomizer SI puede tocar
 * han cambiado- la respuesta es la misma por los dos caminos, que es lo que hace
 * falta.
 */
export const tocoLasTiendas = (jar: Buffer, antes: Buffer, despues: Buffer): boolean => {
  const mapa = tiendasDeLaRom(jar, antes);
  if (!mapa) return false;
  return mapa.offsets.some((donde, indice) => {
    if (mapa.saltadas.includes(indice)) return false;
    const plazas = plazasDe(antes, donde);
    if (!plazas) return false;
    const largo = plazas.length * 2;
    return !antes.subarray(donde, donde + largo).equals(despues.subarray(donde, donde + largo));
  });
};

export type ResultadoTiendas = { tiendas: number; plazas: number };

/**
 * Aleatoriza las tiendas que el randomizer se salta.
 *
 * Escribe sobre `rom`. Devuelve cuantas tiendas tocó, o null si de esta ROM no
 * se sabe donde estan: en ese caso no se toca nada, que es lo unico sensato.
 */
export const aleatorizarTiendas = (
  jar: Buffer,
  rom: Buffer,
  semilla: string,
  /**
   * Si los de revivir salen de las tiendas. Lo decide la dificultad: en Normal
   * se venden como en el juego, y en Nuzlocke y Nivelada no.
   *
   * Por defecto SI se quitan, porque es lo que hacian todas las copias hechas
   * antes de que hubiera dificultades: sus recetas no lo dicen y tienen que
   * seguir rehaciendose byte a byte.
   */
  sinRevivir = true,
): ResultadoTiendas | null => {
  const mapa = tiendasDeLaRom(jar, rom);
  if (!mapa) return null;

  // Lo que ya se vende en esta ROM. De aqui sale todo lo que se va a repartir:
  // asi cada objeto que aparezca en un escaparate es uno que el juego ya sabia
  // vender.
  //
  // Se lee SOLO de las tiendas que el randomizer se salta, que son justo las
  // que el no ha tocado: lo que hay ahi es el catalogo original del juego. Si se
  // leyera de todas, las tres que el acaba de aleatorizar meterian en el
  // catalogo lo que el haya decidido, y entonces esto ya no seria "lo que esta
  // ROM vendia" sino "lo que vendia mas lo que se invento otro".
  // Sin la tabla de objetos no se sabe de que bolsillo es cada uno, y sin eso
  // no se puede repartir: antes que arriesgarse a dejar la tienda de MT
  // vendiendo pociones -que cuelga el juego- se prefiere no tocar nada.
  const tabla = tablaDeObjetos(rom);
  if (tabla < 0) return null;

  // Un catalogo POR BOLSILLO, no uno solo. Ver la cabecera: es lo que mantiene
  // cada tienda vendiendo de lo suyo.
  const catalogo = new Map<number, Set<number>>();
  const listas = new Map<number, number[]>();
  for (const [indice, donde] of mapa.offsets.entries()) {
    const plazas = plazasDe(rom, donde);
    if (!plazas) continue;
    listas.set(donde, plazas);
    if (!mapa.saltadas.includes(indice)) continue;
    for (const id of plazas) {
      // Los de revivir no entran en el reparto: por eso se quitan aqui, al
      // hacer el catalogo, y no al escribir. Ver `REVIVIR`.
      if (sinRevivir && REVIVIR.includes(id)) continue;
      const bolsillo = bolsilloDe(rom, tabla, id);
      if (bolsillo < 0) continue;
      if (!catalogo.has(bolsillo)) catalogo.set(bolsillo, new Set());
      catalogo.get(bolsillo)!.add(id);
    }
  }

  /** Los candidatos de un bolsillo, en orden fijo para que el dado cunda igual. */
  const deBolsillo = new Map<number, number[]>();
  for (const [bolsillo, ids] of catalogo) {
    deBolsillo.set(bolsillo, [...ids].sort((a, b) => a - b));
  }
  if (deBolsillo.size === 0) return null;

  const dado = dadoDe(`tiendas:${semilla}`);
  let tiendas = 0;
  let plazasCambiadas = 0;

  for (const [indice, donde] of mapa.offsets.entries()) {
    // Las que el randomizer ya toco se quedan como las dejo.
    if (!mapa.saltadas.includes(indice)) continue;
    const antes = listas.get(donde);
    if (!antes) continue;

    // Cada plaza, por otra de SU bolsillo. Si de ese bolsillo no hay de donde
    // elegir -o el objeto que habia no se reconoce- esa plaza se queda como
    // estaba: no tocarla siempre es mejor que ponerle algo que no encaja.
    const ahora = antes.map((id) => {
      const bolsillo = bolsilloDe(rom, tabla, id);
      const candidatos = deBolsillo.get(bolsillo);
      if (!candidatos || candidatos.length === 0) return id;
      return candidatos[Math.floor(dado() * candidatos.length)] as number;
    });

    for (const [i, id] of ahora.entries()) rom.writeUInt16LE(id, donde + i * 2);
    tiendas += 1;
    plazasCambiadas += ahora.length;
  }

  // Y una ultima pasada por TODAS, tambien por las tres que aleatoriza el
  // randomizer.
  //
  // Es lo que se escapa al mirarlo por encima: quitar los de revivir de nuestro
  // catalogo solo los quita de nuestras veinte tiendas, y el las pone en las
  // suyas igual que el juego las ponia. Sin esto la regla valdria en veinte
  // sitios y no en los tres restantes, que es como no valer.
  //
  // Se recorre en orden y con el mismo dado, asi que sigue saliendo lo mismo
  // para la misma semilla.
  if (!sinRevivir) return { tiendas, plazas: plazasCambiadas };
  for (const donde of mapa.offsets) {
    const plazas = plazasDe(rom, donde);
    if (!plazas) continue;
    for (const [i, id] of plazas.entries()) {
      if (!REVIVIR.includes(id)) continue;
      // Revivir es un objeto normal, asi que se cambia por otro normal: su
      // mismo bolsillo. Si no hubiera de donde elegir se queda, que es peor
      // regla pero no rompe nada.
      const candidatos = deBolsillo.get(bolsilloDe(rom, tabla, id));
      if (!candidatos || candidatos.length === 0) continue;
      rom.writeUInt16LE(candidatos[Math.floor(dado() * candidatos.length)] as number, donde + i * 2);
      plazasCambiadas += 1;
    }
  }

  return { tiendas, plazas: plazasCambiadas };
};

/**
 * Quita los de revivir de todas las tiendas SIN aleatorizarlas.
 *
 * Es lo que pide una Nuzlocke en la que no se marco "Objetos de tienda": las
 * tiendas se quedan como en el juego, pero sin Revivir. Cada uno se cambia por
 * otro objeto que esa ROM ya vendia en alguna tienda, con un dado propio de la
 * semilla para que la copia se rehaga igual.
 *
 * Escribe sobre `rom`. Devuelve cuantas plazas cambio, o null si de esta ROM no
 * se sabe donde estan las tiendas: entonces no se toca nada.
 */
export const quitarRevivir = (jar: Buffer, rom: Buffer, semilla: string): ResultadoTiendas | null => {
  const mapa = tiendasDeLaRom(jar, rom);
  if (!mapa) return null;

  const tabla = tablaDeObjetos(rom);
  if (tabla < 0) return null;

  // Por bolsillo, igual que al aleatorizar: Revivir es un objeto normal y se
  // cambia por otro normal. Meter una MT en su sitio cuelga el juego si esa
  // tienda resulta ser la de MT. Ver la cabecera.
  const catalogo = new Map<number, Set<number>>();
  for (const donde of mapa.offsets) {
    for (const id of plazasDe(rom, donde) ?? []) {
      if (REVIVIR.includes(id)) continue;
      const bolsillo = bolsilloDe(rom, tabla, id);
      if (bolsillo < 0) continue;
      if (!catalogo.has(bolsillo)) catalogo.set(bolsillo, new Set());
      catalogo.get(bolsillo)!.add(id);
    }
  }
  const deBolsillo = new Map<number, number[]>();
  for (const [bolsillo, ids] of catalogo) deBolsillo.set(bolsillo, [...ids].sort((a, b) => a - b));
  if (deBolsillo.size === 0) return null;

  const dado = dadoDe(`revivir:${semilla}`);
  let tiendas = 0;
  let plazasCambiadas = 0;
  for (const donde of mapa.offsets) {
    const plazas = plazasDe(rom, donde);
    if (!plazas) continue;
    let tocada = false;
    for (const [i, id] of plazas.entries()) {
      if (!REVIVIR.includes(id)) continue;
      const candidatos = deBolsillo.get(bolsilloDe(rom, tabla, id));
      if (!candidatos || candidatos.length === 0) continue;
      rom.writeUInt16LE(candidatos[Math.floor(dado() * candidatos.length)] as number, donde + i * 2);
      plazasCambiadas += 1;
      tocada = true;
    }
    if (tocada) tiendas += 1;
  }
  return { tiendas, plazas: plazasCambiadas };
};

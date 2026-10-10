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
// Y LO QUE NO SE TOCA: si una tienda vendia una ball o una pocion, una de sus
// plazas nuevas sigue siendo esa misma. Sin eso, una Nuzlocke se puede quedar
// sin forma de comprar balls, que no es dificultad: es no poder jugar.

import { inflateRawSync } from 'node:zlib';

/** Los identificadores de ball de tercera generacion, de la Master a la Premier. */
const BALLS = { primera: 1, ultima: 12 };
/** La pocion, que es el otro imprescindible del principio. */
const POCION = 13;
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

const esBall = (id: number) => id >= BALLS.primera && id <= BALLS.ultima;

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
  const catalogo = new Set<number>();
  const listas = new Map<number, number[]>();
  for (const [indice, donde] of mapa.offsets.entries()) {
    const plazas = plazasDe(rom, donde);
    if (!plazas) continue;
    listas.set(donde, plazas);
    if (mapa.saltadas.includes(indice)) for (const id of plazas) catalogo.add(id);
  }

  const pool = [...catalogo].sort((a, b) => a - b);
  if (pool.length < 4) return null;

  const dado = dadoDe(`tiendas:${semilla}`);
  let tiendas = 0;
  let plazasCambiadas = 0;

  for (const [indice, donde] of mapa.offsets.entries()) {
    // Las que el randomizer ya toco se quedan como las dejo.
    if (!mapa.saltadas.includes(indice)) continue;
    const antes = listas.get(donde);
    if (!antes) continue;

    const ahora = antes.map(() => pool[Math.floor(dado() * pool.length)] as number);

    // Lo que no se puede perder: si vendia una ball o una pocion, sigue
    // vendiendola. Una Nuzlocke sin forma de comprar balls no es mas dificil,
    // es imposible.
    //
    // Cada imprescindible va a una plaza SUYA, y por eso se apuntan las
    // ocupadas: la primera version los escribia uno detras de otro en plazas al
    // azar y el segundo caia encima del primero. Medido, cuatro tiendas se
    // quedaron sin su ball porque la pocion la habia tapado.
    const imprescindibles = [...new Set(antes.filter((id) => esBall(id) || id === POCION))];
    const ocupadas = new Set<number>();
    for (const id of imprescindibles) {
      if (ocupadas.size >= ahora.length) break;
      // En una plaza al azar, no siempre la primera: si no, todas las tiendas
      // acabarian con la ball arriba del todo y se notaria el truco.
      let plaza = Math.floor(dado() * ahora.length);
      while (ocupadas.has(plaza)) plaza = (plaza + 1) % ahora.length;
      ocupadas.add(plaza);
      ahora[plaza] = id;
    }

    for (const [i, id] of ahora.entries()) rom.writeUInt16LE(id, donde + i * 2);
    tiendas += 1;
    plazasCambiadas += ahora.length;
  }

  return { tiendas, plazas: plazasCambiadas };
};

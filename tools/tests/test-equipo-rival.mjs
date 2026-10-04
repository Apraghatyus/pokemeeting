// El panel debe enseñar TU equipo, tambien en mitad de un combate.
//
// Reproduce un fallo que se vio jugando: durante un combate, el Pokemon del
// panel se cambiaba por el del entrenador rival.
//
// La causa es que el equipo rival vive en memoria con exactamente la misma
// forma que el tuyo, asi que por forma no se distinguen. El localizador elegia
// "el grupo mas largo de bloques seguidos", y contra un entrenador con mas
// Pokemon que tu ese grupo es el suyo. Con un Pokemon contra un entrenador de
// dos, el panel pasaba a enseñar los del rival.
//
// Se prueba con un estado construido a mano y no con una partida real a
// proposito: hace falta controlar exactamente cuantos Pokemon tiene cada uno,
// y eso jugando no se puede pedir. La prueba comprueba ademas que **sin** el
// arreglo el fallo se reproduce, porque una prueba de regresion que pasaria
// igual con el codigo roto no prueba nada.
//
// Uso: npx tsx tools/tests/test-equipo-rival.mjs
import { pathToFileURL } from 'node:url';

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
const { localizarEquipo, recalcularChecksum, pareceValido, TAMANO_ESTADO, DIRECCIONES_CONOCIDAS } = pk;

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

// --- un estado de Rojo Fuego vacio, con lo justo para que se reconozca ---
const EWRAM_EN_ESTADO = 0x21000;
const EWRAM_BASE = 0x02000000;

const estadoVacio = () => {
  const s = new Uint8Array(TAMANO_ESTADO);
  const v = new DataView(s.buffer);
  v.setUint32(0, 0x01000000, true); // magic
  v.setUint32(8, 0xdeadbeef, true); // crc de la ROM
  for (const [i, c] of [...'POKEMON FIRE'].entries()) s[0x10 + i] = c.charCodeAt(0);
  for (const [i, c] of [...'BPRS'].entries()) s[0x1c + i] = c.charCodeAt(0);
  return s;
};

/**
 * Un Pokemon valido de la especie que se pida.
 *
 * Se construye poniendo los campos en claro y dejando que el propio paquete
 * cifre y cuadre el checksum: inventarse los bytes a mano daria un bloque que
 * `pareceValido` rechazaria, y entonces la prueba no probaria nada.
 */
const pokemonDe = (especie, personalidad) => {
  const bloque = new Uint8Array(100);
  const v = new DataView(bloque.buffer);
  v.setUint32(0, personalidad, true); // personalidad
  v.setUint32(4, 0x00001234, true); // id del entrenador

  // Las cuatro subestructuras de 12 bytes van cifradas con personalidad ^ id.
  // Se escribe la especie en su sitio dentro de la subestructura G y se cifra.
  const datos = new Uint8Array(48);
  const dv = new DataView(datos.buffer);
  const posG = pk.posicionDe(personalidad, 'G');
  dv.setUint16(posG, especie, true); // especie
  dv.setUint16(posG + 4, 10, true); // experiencia, algo distinto de cero

  const clave = (personalidad ^ 0x00001234) >>> 0;
  for (let i = 0; i < 48; i += 4) {
    const palabra = dv.getUint32(i, true);
    v.setUint32(32 + i, (palabra ^ clave) >>> 0, true);
  }

  bloque[0x54] = 5; // nivel
  v.setUint16(0x56, 20, true); // vida actual
  v.setUint16(0x58, 20, true); // vida maxima

  return recalcularChecksum(bloque);
};

/** Mete un equipo de N Pokemon en una direccion del juego. */
const ponerEquipo = (estado, direccion, cuantos, especieBase) => {
  const off = EWRAM_EN_ESTADO + (direccion - EWRAM_BASE);
  for (let i = 0; i < cuantos; i += 1) {
    estado.set(pokemonDe(especieBase + i, 0x11110000 + i * 7 + especieBase), off + i * 100);
  }
};

// --- el escenario del fallo ---
const MIO = DIRECCIONES_CONOCIDAS.BPR.equipo; // 0x02024284
// El equipo rival va ANTES en memoria, que es parte del problema.
const RIVAL = MIO - 0x258; // seis bloques mas abajo

const estado = estadoVacio();
ponerEquipo(estado, MIO, 1, 1); // tu: un Pokemon
ponerEquipo(estado, RIVAL, 3, 100); // el rival: tres

// Que el montaje sea valido, o lo demas no significa nada.
const bloqueMio = estado.subarray(
  EWRAM_EN_ESTADO + (MIO - EWRAM_BASE),
  EWRAM_EN_ESTADO + (MIO - EWRAM_BASE) + 100,
);
check('el Pokemon de prueba pasa por valido', pareceValido(bloqueMio));

// --- lo que importa ---
const conJuego = localizarEquipo(estado, undefined, 'BPRS');
check('en combate se encuentra TU equipo, no el del rival',
  conJuego?.direccion === MIO,
  `0x${conJuego?.direccion?.toString(16)} (el tuyo es 0x${MIO.toString(16)})`);
check('y con el numero de Pokemon que llevas tu', conJuego?.ranuras.length === 1,
  `${conJuego?.ranuras.length}`);

// --- y que el fallo era real: sin el codigo del juego se elige por forma ---
const sinJuego = localizarEquipo(estado);
check('sin saber de que juego es, gana el grupo mas largo (el fallo de antes)',
  sinJuego?.direccion === RIVAL,
  `0x${sinJuego?.direccion?.toString(16)}`);

// --- el barrido sigue sirviendo cuando la direccion documentada no vale ---
// Es lo que mantiene funcionando los hacks que mueven el equipo de sitio.
const movido = estadoVacio();
const OTRA = MIO + 0x1000;
ponerEquipo(movido, OTRA, 2, 1);
const hallado = localizarEquipo(movido, undefined, 'BPRS');
check('si el equipo no esta donde dice la documentacion, se busca igual',
  hallado?.direccion === OTRA, `0x${hallado?.direccion?.toString(16)}`);

// --- y una partida sin nada no inventa un equipo ---
check('en una partida sin Pokemon no se encuentra nada',
  localizarEquipo(estadoVacio(), undefined, 'BPRS') === null);

console.log(fallos === 0 ? '\nEL PANEL ENSEÑA TU EQUIPO' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

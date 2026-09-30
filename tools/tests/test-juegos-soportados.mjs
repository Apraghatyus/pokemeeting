// Comprueba que los juegos que decimos aceptar los acepta el randomizer.
//
// El alcance de la aleatorizacion se declara en dos sitios nuestros -el
// servicio y el menu- y quien manda de verdad es un tercero: el jar. Si
// dijeramos que aceptamos un juego que el no reconoce, el jugador se
// encontraria un error feo despues de subir dieciseis megas.
//
// La lista buena esta dentro del propio jar, en sus ficheros de posiciones,
// uno por generacion, con una entrada por ROM y su codigo de cabecera. Se lee
// de ahi en vez de copiarla: asi, si algun dia se cambia el jar por otra
// version, esta prueba lo nota.
//
// Uso: node tools/tests/test-juegos-soportados.mjs
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';

const JAR = process.env.UPR_JAR ?? 'tools/randomizer/PokeRandoZX.jar';
const CONFIGS = [1, 2, 3, 4, 5].map(
  (gen) => `com/dabomstew/pkrandom/config/gen${gen}_offsets.ini`,
);

if (!existsSync(JAR)) {
  console.error(`No encuentro el jar en ${JAR}.`);
  console.error('Descargalo siguiendo tools/randomizer/LEEME.md.');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const jar = readFileSync(JAR);

/**
 * Saca un fichero del jar leyendolo como el zip que es.
 *
 * Se va por el directorio central y no por las cabeceras locales: en estas
 * ultimas el tamano comprimido puede venir a cero cuando el zip usa descriptor
 * de datos, y entonces no hay nada que descomprimir. Eso fallo la primera vez.
 */
const leerDelZip = (ruta) => {
  let finDirectorio = -1;
  for (let i = jar.length - 22; i >= 0; i -= 1) {
    if (jar.readUInt32LE(i) === 0x06054b50) {
      finDirectorio = i;
      break;
    }
  }
  if (finDirectorio < 0) return null;

  const nombre = Buffer.from(ruta, 'utf8');
  let entradas = jar.readUInt16LE(finDirectorio + 10);
  let cursor = jar.readUInt32LE(finDirectorio + 16);

  while (entradas-- > 0 && jar.readUInt32LE(cursor) === 0x02014b50) {
    const largoNombre = jar.readUInt16LE(cursor + 28);
    const largoExtra = jar.readUInt16LE(cursor + 30);
    const largoComentario = jar.readUInt16LE(cursor + 32);

    if (jar.subarray(cursor + 46, cursor + 46 + largoNombre).equals(nombre)) {
      const metodo = jar.readUInt16LE(cursor + 10);
      const comprimido = jar.readUInt32LE(cursor + 20);
      const local = jar.readUInt32LE(cursor + 42);
      // La cabecera local repite el nombre y los extras, y sus longitudes no
      // tienen por que coincidir con las del directorio.
      const inicio = local + 30 + jar.readUInt16LE(local + 26) + jar.readUInt16LE(local + 28);
      const datos = jar.subarray(inicio, inicio + comprimido);
      return (metodo === 0 ? datos : inflateRawSync(datos)).toString('utf8');
    }
    cursor += 46 + largoNombre + largoExtra + largoComentario;
  }
  return null;
};

/** Con un JDK a mano se usa su orden `jar`; con solo un JRE, el lector de zip. */
const leerDelJar = (ruta) => {
  const destino = process.env.TEMP ?? process.env.TMPDIR ?? '.';
  try {
    execFileSync('jar', ['xf', JAR, ruta], { cwd: destino, stdio: 'pipe' });
    return readFileSync(join(destino, ruta), 'utf8');
  } catch {
    return leerDelZip(ruta);
  }
};

const juegosDelJar = new Set();
let romsLeidas = 0;
for (const config of CONFIGS) {
  const ini = leerDelJar(config);
  if (ini === null) continue;
  for (const [, codigo] of ini.matchAll(/^Game=([A-Za-z0-9]{3,4})/gm)) {
    romsLeidas += 1;
    // Las tres primeras letras son el juego; la cuarta, el idioma.
    juegosDelJar.add(codigo.slice(0, 3).toUpperCase());
  }
}

check('el jar declara sus ROMs por generacion', romsLeidas > 50, `${romsLeidas} ROMs`);
console.log(`   el jar acepta: ${[...juegosDelJar].sort().join(', ')}\n`);

// Nuestro alcance declarado, leido de donde vive de verdad.
const servicio = readFileSync('apps/randomizer/src/index.ts', 'utf8');
const menu = readFileSync('apps/web/src/ui/RandomizerModal.tsx', 'utf8');

/** Del servicio, que los guarda con su generacion: AAU: 2, BPR: 3... */
const bloqueServicio = /SUPPORTED_GAMES[^{]*\{([^}]*)\}/.exec(servicio)?.[1] ?? '';
const delServicio = [...bloqueServicio.matchAll(/^\s*([A-Z]{3}):\s*\d/gm)].map((m) => m[1]);

/** Del menu, que solo necesita saber si entra o no. */
const bloqueMenu = /SUPPORTED = new Set\(\[([^\]]*)\]/.exec(menu)?.[1] ?? '';
const delMenu = [...bloqueMenu.matchAll(/'([A-Z]{3})'/g)].map((m) => m[1]);

check('el servicio declara algun juego', delServicio.length > 0, delServicio.join(', '));
check(
  'el menu declara los mismos que el servicio',
  delMenu.length === delServicio.length && delMenu.every((j) => delServicio.includes(j)),
  `menu: ${delMenu.join(', ')}`,
);

const desconocidos = delServicio.filter((juego) => !juegosDelJar.has(juego));
check(
  'todos los que decimos aceptar los conoce el jar',
  desconocidos.length === 0,
  desconocidos.length ? `el jar no conoce ${desconocidos.join(', ')}` : '',
);

// El catalogo de dominio tiene que conocerlos tambien, o la interfaz no sabria
// como se llaman ni de que generacion son.
const catalogo = readFileSync('packages/pokemon/src/games.ts', 'utf8');
const sinNombre = delServicio.filter((juego) => !new RegExp(`\\b${juego}: \\{`).test(catalogo));
check(
  'y todos tienen nombre en el catalogo de juegos',
  sinNombre.length === 0,
  sinNombre.length ? `faltan ${sinNombre.join(', ')}` : '',
);

// Y al reves: si el jar acepta un juego que no ofrecemos, no es un fallo, pero
// conviene saberlo.
const sinOfrecer = [...juegosDelJar].filter((juego) => !delServicio.includes(juego));
if (sinOfrecer.length > 0) {
  console.log(`\nnota: el jar tambien acepta ${sinOfrecer.sort().join(', ')}, que no ofrecemos.`);
}

console.log(fallos === 0 ? '\nEL ALCANCE DECLARADO ES REAL' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

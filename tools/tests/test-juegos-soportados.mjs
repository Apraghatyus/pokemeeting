// Comprueba que los juegos que decimos aceptar los acepta el randomizer.
//
// El alcance de la aleatorizacion se declara en dos sitios nuestros -el
// servicio y el menu- y quien manda de verdad es un tercero: el jar. Si
// dijeramos que aceptamos un juego que el no reconoce, el jugador se
// encontraria un error feo despues de subir dieciseis megas.
//
// La lista buena esta dentro del propio jar, en su fichero de posiciones de
// tercera generacion, con una entrada por ROM y su codigo de cabecera. Se lee
// de ahi en vez de copiarla: asi, si algun dia se cambia el jar por otra
// version, esta prueba lo nota.
//
// Uso: node tools/tests/test-juegos-soportados.mjs
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const JAR = process.env.UPR_JAR ?? 'tools/randomizer/PokeRandoZX.jar';
const CONFIG = 'com/dabomstew/pkrandom/config/gen3_offsets.ini';

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

/**
 * Saca un fichero del jar sin descomprimirlo entero.
 *
 * Un jar es un zip, y Node no trae con que abrirlo. Java si, y Java ya hace
 * falta para usar el randomizer, asi que no se anade ninguna dependencia.
 */
const leerDelJar = (ruta) => {
  const destino = process.env.TEMP ?? process.env.TMPDIR ?? '.';
  execFileSync('jar', ['xf', JAR, ruta], { cwd: destino, stdio: 'pipe' });
  return readFileSync(join(destino, ruta), 'utf8');
};

let ini;
try {
  ini = leerDelJar(CONFIG);
} catch {
  // Un JRE no trae la orden `jar`, solo un JDK. Sin ella se lee el zip a mano.
  // Se va por el directorio central y no por las cabeceras locales: en estas
  // ultimas el tamano comprimido puede venir a cero cuando el zip usa
  // descriptor de datos, y entonces no hay nada que descomprimir.
  const { inflateRawSync } = await import('node:zlib');
  const jar = readFileSync(JAR);

  let finDirectorio = -1;
  for (let i = jar.length - 22; i >= 0; i -= 1) {
    if (jar.readUInt32LE(i) === 0x06054b50) { finDirectorio = i; break; }
  }
  if (finDirectorio < 0) {
    console.error('Ese jar no parece un zip valido.');
    process.exit(1);
  }

  const nombre = Buffer.from(CONFIG, 'utf8');
  let entradas = jar.readUInt16LE(finDirectorio + 10);
  let cursor = jar.readUInt32LE(finDirectorio + 16);
  let encontrado = null;

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
      encontrado = metodo === 0 ? datos : inflateRawSync(datos);
      break;
    }
    cursor += 46 + largoNombre + largoExtra + largoComentario;
  }

  if (!encontrado) {
    console.error(`No encuentro ${CONFIG} dentro del jar.`);
    process.exit(1);
  }
  ini = encontrado.toString('utf8');
}

const delJar = new Set([...ini.matchAll(/^Game=([A-Z0-9]{4})/gm)].map((m) => m[1]));
check('el jar declara los juegos de tercera generacion', delJar.size > 20, `${delJar.size} ROMs`);

/** Las tres primeras letras son el juego; la cuarta, el idioma. */
const juegosDelJar = new Set([...delJar].map((codigo) => codigo.slice(0, 3)));
console.log(`   el jar acepta: ${[...juegosDelJar].sort().join(', ')}\n`);

// Nuestro alcance declarado, leido de donde vive de verdad.
const servicio = readFileSync('apps/randomizer/src/index.ts', 'utf8');
const menu = readFileSync('apps/web/src/ui/RandomizerModal.tsx', 'utf8');
const listaDe = (fuente, marca) => {
  const bloque = new RegExp(`${marca}[^\\[]*\\[([^\\]]*)\\]`).exec(fuente)?.[1] ?? '';
  return [...bloque.matchAll(/'([A-Z]{3})'/g)].map((m) => m[1]);
};

const delServicio = listaDe(servicio, 'SUPPORTED_GAMES = new Set');
const delMenu = listaDe(menu, 'SUPPORTED = new Set');

check('el servicio declara algun juego', delServicio.length > 0, delServicio.join(', '));
check('el menu declara los mismos que el servicio',
  delMenu.length === delServicio.length && delMenu.every((j) => delServicio.includes(j)),
  `menu: ${delMenu.join(', ')}`);

const desconocidos = delServicio.filter((juego) => !juegosDelJar.has(juego));
check('todos los que decimos aceptar los conoce el jar', desconocidos.length === 0,
  desconocidos.length ? `el jar no conoce ${desconocidos.join(', ')}` : '');

// Y al reves: si el jar acepta un juego de tercera generacion que nosotros no
// ofrecemos, no es un fallo, pero conviene saberlo.
const sinOfrecer = [...juegosDelJar].filter((juego) => !delServicio.includes(juego));
if (sinOfrecer.length > 0) {
  console.log(`\nnota: el jar tambien acepta ${sinOfrecer.sort().join(', ')}, que no ofrecemos.`);
}

console.log(fallos === 0 ? '\nEL ALCANCE DECLARADO ES REAL' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

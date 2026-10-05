// La tabla de caracteres del juego.
//
// Existe por un fallo concreto: la 'ñ' estaba puesta en 0xe7, que es la 's'
// -0xd5 es la 'a', mas dieciocho-, asi que pisaba una letra del tramo de
// minusculas y TODA 's' salia como 'ñ'. Se vio jugando, con un Pokemon llamado
// "Huesitos" que en el panel aparecia como "Hueñitoñ".
//
// Lo que lo hacia invisible es que los nombres de especie de la ROM no llevan
// 's' minuscula -van en mayusculas-, asi que nada de lo que se probaba lo
// tocaba. Solo salia en los motes, que los escribe cada jugador.
//
// Por eso la prueba no comprueba unas pocas letras sueltas: recorre el abecedario
// entero en los dos tramos. Un caracter suelto mal puesto no se nota mirando
// ejemplos, se nota recorriendo.
//
// Uso: npx tsx tools/tests/test-texto.mjs [rom.gba]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
const { leerTexto, pareceNombre } = pk;

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const bytes = (...valores) => new Uint8Array(valores);
const tramo = (inicio, cuantos) =>
  leerTexto(new Uint8Array(Array.from({ length: cuantos }, (_, i) => inicio + i)));

// --- los dos abecedarios, enteros ---
check('las mayusculas salen de la A a la Z',
  tramo(0xbb, 26) === 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', tramo(0xbb, 26));
check('y las minusculas de la a a la z',
  tramo(0xd5, 26) === 'abcdefghijklmnopqrstuvwxyz', tramo(0xd5, 26));
check('los digitos tambien', tramo(0xa1, 10) === '0123456789', tramo(0xa1, 10));

// --- la ñ, donde de verdad vive ---
check('la ñ es 0x29', leerTexto(bytes(0x29)) === 'ñ', leerTexto(bytes(0x29)));
check('la Ñ es 0x14', leerTexto(bytes(0x14)) === 'Ñ', leerTexto(bytes(0x14)));

// --- el mote que destapo el fallo ---
// Se codifica a partir de los dos tramos en vez de a mano: escribir los bytes
// uno a uno es justo como se cuelan los errores que esta prueba vigila.
const may = (c) => 0xbb + c.charCodeAt(0) - 65;
const min = (c) => 0xd5 + c.charCodeAt(0) - 97;
const mote = (texto) =>
  new Uint8Array([
    ...[...texto].map((c) =>
      c >= 'A' && c <= 'Z' ? may(c) : c >= 'a' && c <= 'z' ? min(c) : c === 'ñ' ? 0x29 : 0x14,
    ),
    0xff,
  ]);

const huesitos = mote('Huesitos');
check('"Huesitos" se lee "Huesitos" y no "Hueñitoñ"',
  leerTexto(huesitos) === 'Huesitos', leerTexto(huesitos));

// --- un mote con ñ de verdad ---
check('un mote con ñ se lee entero', leerTexto(mote('Ñoño')) === 'Ñoño', leerTexto(mote('Ñoño')));

// --- y pasa por nombre valido, que antes no ---
check('un mote con ñ cuenta como nombre', pareceNombre(mote('Ñoño')));
check('y uno normal tambien', pareceNombre(huesitos));
check('pero basura no', pareceNombre(bytes(0x9f, 0x9e, 0x9d, 0xff)) === false);

// --- contra la ROM, si la hay: nada debe quedar sin descodificar ---
const ROM = process.argv[2];
if (ROM) {
  const rom = new Uint8Array(readFileSync(ROM));
  const tablaNombres = pk.encontrarTablaNombres(rom);
  if (tablaNombres) {
    const raros = [];
    for (let i = 1; i <= 411; i += 1) {
      const nombre = tablaNombres.nombre(i);
      if (nombre.includes('·')) raros.push(`${i}:${nombre}`);
    }
    check('ningun nombre de especie queda con caracteres sin traducir',
      raros.length === 0, raros.slice(0, 5).join(' | ') || 'todos legibles');
  } else {
    console.log('(no se pudo localizar la tabla de nombres; se omite esa parte)');
  }
}

console.log(fallos === 0 ? '\nLA TABLA DE CARACTERES ESTA BIEN' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

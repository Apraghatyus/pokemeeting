// Comprueba el fichero de partida: el que te llevas a otro aparato.
//
// Lleva dentro el guardado y la receta con la que se vuelve a generar la copia
// aleatorizada. Lo que no lleva es la ROM, y eso tambien se comprueba aqui:
// es lo que hace que este fichero se pueda mover sin repartir el juego.
//
// Uso: npx tsx tools/tests/test-paquete.mjs
import { pathToFileURL } from 'node:url';

const base = pathToFileURL(`${process.cwd()}/apps/web/src/core/`).href;
const { empaquetar, leerPaquete, nombreDeFichero } = await import(`${base}paquete.ts`);
const { codificarReceta, descodificarReceta } = await import(`${base}receta.ts`);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const receta = {
  baseCrc32: '9f08064e',
  crc32: 'becc1ebf',
  semilla: '138536082248422',
  ajustes: 'AAIBBQQAAAMABgAEAAEeJAIBFAAAFABABAABG',
};

// Un guardado de GBA son 128 KB. Se rellena con algo reconocible y, a
// proposito, con saltos de linea dentro: el formato parte por los dos primeros
// y tiene que dar igual lo que venga despues.
const sav = new Uint8Array(131072);
for (let i = 0; i < sav.length; i += 1) sav[i] = i % 256;
sav[100] = 0x0a;
sav[101] = 0x0a;

const paquete = empaquetar({ receta, sav, nombre: 'Rojo Fuego aleatorizada' });
check('se empaqueta', paquete.length > sav.length, `${paquete.length} bytes`);
check('y ocupa poco mas que el guardado', paquete.length - sav.length < 500,
  `${paquete.length - sav.length} bytes de cabecera`);

const leido = leerPaquete(paquete);
check('se vuelve a leer', leido !== null);
check('con la receta intacta',
  leido.receta.semilla === receta.semilla && leido.receta.ajustes === receta.ajustes);
check('y el guardado intacto byte a byte',
  leido.sav.length === sav.length && leido.sav.every((b, i) => b === sav[i]));
check('incluidos los saltos de linea de dentro',
  leido.sav[100] === 0x0a && leido.sav[101] === 0x0a);
check('y con su nombre', leido.nombre === 'Rojo Fuego aleatorizada', leido.nombre);

// La receta de dentro tiene que valer tal cual para rehacer la ROM.
const comoTexto = codificarReceta(leido.receta);
check('la receta de dentro sirve para rehacer la copia',
  descodificarReceta(comoTexto)?.crc32 === receta.crc32, comoTexto.slice(0, 32) + '...');

// --- lo que NO lleva ---
//
// Si algun dia alguien mete la ROM aqui "por comodidad", esto lo caza: una ROM
// de GBA son dieciseis megas y empieza por un salto a su codigo.
check('no cabe una ROM dentro: el fichero pesa lo que el guardado',
  paquete.length < sav.length + 1024);

// --- lo que llega de fuera ---
check('un .sav suelto no pasa por fichero de partida', leerPaquete(sav) === null);
check('ni un fichero vacio', leerPaquete(new Uint8Array(0)) === null);
check('ni uno con la marca pero sin guardado',
  leerPaquete(new TextEncoder().encode(`EMUPOKE-PARTIDA-1\n{"receta":${JSON.stringify(receta)}}\n`)) ===
    null);
check('ni uno con la cabecera rota',
  leerPaquete(new TextEncoder().encode('EMUPOKE-PARTIDA-1\n{roto\nxx')) === null);
check('ni uno sin receta',
  leerPaquete(new TextEncoder().encode('EMUPOKE-PARTIDA-1\n{"nombre":"x"}\nxx')) === null);

// --- el nombre del fichero ---
check('el nombre sale limpio',
  nombreDeFichero('Pokemon - Edicion Rojo Fuego (Spain).gba') === 'Pokemon - Edicion Rojo Fuego Spain.emupoke',
  nombreDeFichero('Pokemon - Edicion Rojo Fuego (Spain).gba'));
check('y nunca vacio', nombreDeFichero('???') === 'partida.emupoke', nombreDeFichero('???'));

console.log(fallos === 0 ? '\nEL FICHERO DE PARTIDA FUNCIONA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

// Comprueba el camino de vuelta del texto: de lo que escribe el jugador a los
// bytes del juego, para cambiar un mote desde la pagina.
//
// Uso: npx tsx tools/tests/test-mote.mjs
import { pathToFileURL } from 'node:url';

const { codificarTexto, leerTexto, LARGO_MOTE } = await import(
  pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href
);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

for (const mote of ['PIDGEY', 'Huesitos', 'Ñoño 2', 'Mr. Mime', 'AÉIÓÚ']) {
  const bytes = codificarTexto(mote);
  const vuelta = bytes ? leerTexto(Uint8Array.from([...bytes, 0xff])) : null;
  check(`"${mote}" va y vuelve igual`, vuelta === mote, String(vuelta));
}
check('la s no se confunde con la ñ', codificarTexto('s')?.[0] === 0xe7);
check(`mas de ${LARGO_MOTE} caracteres no cabe`, codificarTexto('ABCDEFGHIJK') === null);
check('vacio, tampoco', codificarTexto('') === null);
check('un emoji no se puede escribir', codificarTexto('Pika⚡') === null);

console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallos.`);
process.exit(fallos === 0 ? 0 : 1);

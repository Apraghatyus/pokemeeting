// Comprueba el resumen del equipo: lo que se enseña en pantalla y lo que se le
// manda al companero.
//
// Se hace contra una partida de verdad, no contra datos inventados: la gracia
// de este resumen es que sale de la memoria del juego, y eso solo se comprueba
// leyendo una partida que alguien jugo.
//
// Uso: npx tsx tools/tests/test-resumen.mjs <estado.bin> [rom.gba]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [, , ESTADO, ROM] = process.argv;
if (!ESTADO) {
  console.error('Uso: npx tsx tools/tests/test-resumen.mjs <estado.bin> [rom.gba]');
  process.exit(2);
}

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
const { parsePeerMessage } = await import(
  pathToFileURL(`${process.cwd()}/packages/protocol/src/index.ts`).href
);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const estado = new Uint8Array(readFileSync(ESTADO));

// --- leer el equipo de la partida ---
const hallado = pk.resumirEquipo(estado);
check('se encuentra el equipo en la partida', hallado !== null);
if (!hallado) process.exit(1);

const { resumen, equipo } = hallado;
console.log(
  `   equipo en 0x${equipo.direccion.toString(16).toUpperCase()} (${equipo.region}), ` +
    `${resumen.ranuras.length} Pokemon\n`,
);

const primero = resumen.ranuras[0];
check('trae al menos un Pokemon', primero !== undefined);
check('con su mote', typeof primero.mote === 'string' && primero.mote.length > 0, `"${primero.mote}"`);
check('su especie como numero, no como nombre', Number.isInteger(primero.especie), String(primero.especie));
check('su nivel', primero.nivel > 0 && primero.nivel <= 100, String(primero.nivel));
check('y sus PS', primero.psMaximos > 0 && primero.ps <= primero.psMaximos,
  `${primero.ps}/${primero.psMaximos}`);
check('no es un huevo', primero.huevo === false);
check('y lleva su personalidad, que es lo que no cambia nunca',
  primero.personalidad > 0, `0x${primero.personalidad.toString(16).toUpperCase()}`);

// --- la relectura barata tiene que dar lo mismo ---
const releido = pk.releerEquipo(estado, equipo.direccion, resumen.juego);
check('releer en la direccion ya conocida da lo mismo', pk.mismoEquipo(resumen, releido));
check('y en una direccion donde no hay equipo, nada',
  pk.releerEquipo(estado, equipo.direccion + 0x400, resumen.juego) === null ||
    !pk.mismoEquipo(resumen, pk.releerEquipo(estado, equipo.direccion + 0x400, resumen.juego)));

// --- comparar dos lecturas ---
check('dos lecturas iguales se reconocen como iguales', pk.mismoEquipo(resumen, { ...resumen }));
const herido = {
  ...resumen,
  ranuras: resumen.ranuras.map((r, i) => (i === 0 ? { ...r, ps: r.ps - 1 } : r)),
};
check('y un Pokemon con un PS menos ya no', !pk.mismoEquipo(resumen, herido));

// --- lo que viaja por el cable ---
const paquete = JSON.stringify({ type: 'equipo', equipo: resumen });
check('el mensaje es pequeño', paquete.length < 2000, `${paquete.length} bytes`);

// Esto es lo que mantiene limpia la frontera: por el cable no va un solo dato
// sacado de la ROM. El nombre de la especie lo pone cada lado con su copia.
const nombresDeEspecie = ['BULBASAUR', 'CHARMANDER', 'SQUIRTLE', 'PIKACHU', 'MEW'];
check('no viaja ningun nombre de especie, que eso sale de la ROM',
  !nombresDeEspecie.some((n) => paquete.toUpperCase().includes(n)));

const vuelta = parsePeerMessage(paquete);
check('el companero lo entiende', vuelta?.type === 'equipo');
check('y le llega el equipo entero',
  vuelta.equipo.ranuras.length === resumen.ranuras.length);

// --- al otro lado hay un navegador que no controlamos ---
check('un mensaje que no es JSON se descarta', parsePeerMessage('{{{') === null);
check('uno de otro tipo tambien', parsePeerMessage('{"type":"otra-cosa"}') === null);
check('uno sin ranuras tambien', parsePeerMessage('{"type":"equipo","equipo":{}}') === null);
check('un equipo de cien Pokemon se descarta entero',
  parsePeerMessage(
    JSON.stringify({ type: 'equipo', equipo: { juego: 'BPRS', momento: 1, ranuras: new Array(100).fill(primero) } }),
  ) === null);
const conBasura = parsePeerMessage(
  JSON.stringify({
    type: 'equipo',
    equipo: { juego: 'BPRS', momento: 1, ranuras: [primero, { mote: 'x'.repeat(50) }] },
  }),
);
check('y una ranura con un mote imposible se cae, pero el resto llega',
  conBasura?.equipo.ranuras.length === 1);

// --- con la ROM a mano, el nombre se resuelve en el lado que recibe ---
if (ROM) {
  const rom = new Uint8Array(readFileSync(ROM));
  const tabla = pk.encontrarTablaNombres(rom);
  check('quien recibe le pone nombre con SU ROM', tabla !== null,
    `especie ${primero.especie} = ${tabla?.nombre(primero.especie)}`);
}

console.log(fallos === 0 ? '\nEL RESUMEN DEL EQUIPO ES CORRECTO' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

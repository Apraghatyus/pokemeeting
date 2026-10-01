// Comprueba el emparejado del Soul Link.
//
// La regla es que los Pokemon van de dos en dos, uno en cada partida, y que si
// cae uno se acabo para su pareja. Desde fuera solo hay una forma de saber
// quien va con quien: el mote, porque los dos jugadores le ponen el mismo
// nombre a los dos. Las especies no sirven -pueden ser distintas, y mas con
// copias aleatorizadas-, ni los niveles, ni las posiciones.
//
// Esto es logica pura y no necesita ni navegador ni ROM.
//
// Uso: npx tsx tools/tests/test-soullink.mjs
import { pathToFileURL } from 'node:url';

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const pokemon = (mote, estado = null, extra = {}) => ({
  ranura: 0,
  especie: 1,
  mote,
  nivel: 10,
  estado,
  huevo: false,
  tipos: null,
  personalidad: 1,
  ...extra,
});

const equipo = (...ranuras) => ({
  juego: 'BPRS',
  momento: Date.now(),
  ranuras: ranuras.map((p, i) => ({ ...p, ranura: i, personalidad: i + 1 })),
});

// --- quien ha caido ---
const mio = equipo(pokemon('RAYO'), pokemon('ROCA', 'debilitado'), pokemon('HOJA', 'envenenado'));
const caidos = pk.motesDebilitados(mio);
check('se recogen los motes de los que han caido', caidos.has('ROCA'), [...caidos].join(', '));
check('y solo esos: uno envenenado sigue vivo', !caidos.has('HOJA'));
check('ni los que estan bien', !caidos.has('RAYO'));
check('de un equipo vacio no cae nadie', pk.motesDebilitados(null).size === 0);

// --- el emparejado ---
check('si al companero se le cayo ROCA, mi ROCA queda marcada',
  pk.parejaCaida('ROCA', caidos));
check('pero mi RAYO no', !pk.parejaCaida('RAYO', caidos));

// Los dos escriben el mote a mano, cada uno en su partida.
check('da igual como lo escribieran: mayusculas', pk.parejaCaida('roca', caidos));
check('y espacios de sobra', pk.parejaCaida('  Roca  ', caidos));

// --- lo que NO debe emparejarse ---
const sinMote = equipo(pokemon('', 'debilitado'), pokemon('   ', 'debilitado'));
const vacios = pk.motesDebilitados(sinMote);
check('un Pokemon sin mote no entra en el reparto', vacios.size === 0);
check('y otro sin mote no se empareja con el', !pk.parejaCaida('', vacios));

// En un Soul Link esto es lo grave: dar por muerto al que no era.
const suyo = equipo(pokemon('ROCA', 'debilitado'));
const soloSuyos = pk.motesDebilitados(suyo);
check('un mote parecido pero distinto no cuenta', !pk.parejaCaida('ROCAS', soloSuyos));
check('ni uno contenido en otro', !pk.parejaCaida('ROC', soloSuyos));

// --- los dos lados ---
const equipoA = equipo(pokemon('RAYO', 'debilitado'), pokemon('HOJA'));
const equipoB = equipo(pokemon('RAYO'), pokemon('HOJA', 'debilitado'));
const deA = pk.motesDebilitados(equipoA);
const deB = pk.motesDebilitados(equipoB);
check('a B se le marca RAYO porque a A se le cayo', pk.parejaCaida('RAYO', deA));
check('y a A se le marca HOJA porque a B se le cayo', pk.parejaCaida('HOJA', deB));
check('cada lado mira los caidos del otro, no los suyos', !pk.parejaCaida('RAYO', deB));

console.log(fallos === 0 ? '\nEL EMPAREJADO FUNCIONA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

// Comprueba las dificultades: que viajen en la semilla sin romper las de antes,
// que enciendan lo que tienen que encender y que se apaguen al acabar el reto,
// y la regla de no repetir tipo primario.
//
// La semilla es lo delicado. Lleva la dificultad porque cambia la copia -los de
// revivir salen o no de las tiendas- y porque asi viaja en la invitacion de un
// Soul Link. Pero las semillas de antes, de cinco campos, tienen que seguir
// leyendose IGUAL: con otra cosa se rehace otra copia y el guardado deja de
// encajar.
//
// Esto es logica pura y no necesita ni navegador ni ROM.
//
// Uso: npx tsx tools/tests/test-dificultad.mjs
import { pathToFileURL } from 'node:url';

const desde = (ruta) => import(pathToFileURL(`${process.cwd()}/${ruta}`).href);
const { codificarSemilla, descodificarSemilla } = await desde('apps/web/src/core/semilla.ts');
const { reglasActivas, tiposPrimariosRepetidos } = await desde('apps/web/src/core/dificultad.ts');
const { sinRevivirDe } = await desde('apps/web/src/core/partidas.ts');

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

// --- la semilla ---

const base = {
  baseCrc32: 'dd88761c',
  crc32: '0a1b2c3d',
  semilla: '219722550258604',
  ajustes: 'AAECAwQFBgcICQoLDA0ODw+/=',
};

const vieja = codificarSemilla(base);
check('sin dificultad se escribe con cinco campos, como antes', vieja.split('.').length === 5, vieja);
check('y se lee sin dificultad', descodificarSemilla(vieja)?.dificultad === null);

for (const dificultad of ['normal', 'nuzlocke', 'nivelada']) {
  const texto = codificarSemilla({ ...base, dificultad });
  const leida = descodificarSemilla(texto);
  check(`${dificultad}: ida y vuelta`, leida?.dificultad === dificultad && leida?.ajustes === base.ajustes);
}

check(
  'una dificultad inventada no se acepta',
  descodificarSemilla(`${vieja}.imposible`) === null,
);
check('siete campos no se aceptan', descodificarSemilla(`${vieja}.nuzlocke.otra`) === null);
check(
  'un salto de linea en medio no la rompe',
  descodificarSemilla(codificarSemilla({ ...base, dificultad: 'nivelada' }).replace('.', '.\n'))
    ?.dificultad === 'nivelada',
);

// --- que le pide cada una al randomizer ---

check('sin dificultad no se dice nada: se rehace como se hizo', sinRevivirDe(null) === undefined);
check('Normal vende Revivir', sinRevivirDe('normal') === false);
check('Nuzlocke no', sinRevivirDe('nuzlocke') === true);
check('Nivelada tampoco', sinRevivirDe('nivelada') === true);

// --- que enciende cada una ---

const normal = reglasActivas('normal', false);
const nuzlocke = reglasActivas('nuzlocke', false);
const nivelada = reglasActivas('nivelada', false);
check('Normal no vigila el tope', !normal.topeDeNivel && !normal.tipoPrimarioUnico);
check('Nuzlocke tampoco', !nuzlocke.topeDeNivel && !nuzlocke.tipoPrimarioUnico);
check('Nivelada vigila el tope y el tipo', nivelada.topeDeNivel && nivelada.tipoPrimarioUnico);

const acabada = reglasActivas('nivelada', true);
check(
  'acabado el reto se apaga todo, aunque se siga jugando',
  !acabada.topeDeNivel && !acabada.tipoPrimarioUnico,
);

// --- sin repetir tipo primario ---

const NORMAL = 0;
const AGUA = 11;
const ROCA = 5;
const PLANTA = 12;

const pokemon = (tipos, extra = {}) => ({
  ranura: 0,
  especie: 1,
  mote: 'X',
  nivel: 10,
  estado: null,
  huevo: false,
  tipos,
  personalidad: 1,
  ...extra,
});
const equipo = (...ranuras) => ({ juego: 'BPRS', momento: 0, ranuras });

check(
  'dos de Agua primario en tu equipo chocan',
  tiposPrimariosRepetidos(equipo(pokemon([AGUA, AGUA]), pokemon([AGUA, ROCA]))).has(AGUA),
);
check(
  'y tambien uno tuyo con uno del companero',
  tiposPrimariosRepetidos(equipo(pokemon([AGUA, AGUA])), equipo(pokemon([AGUA, PLANTA]))).has(AGUA),
);
check(
  'solo cuenta el primario: un Roca/Agua no choca con un Agua',
  tiposPrimariosRepetidos(equipo(pokemon([ROCA, AGUA])), equipo(pokemon([AGUA, AGUA]))).size === 0,
);
check(
  'un huevo no cuenta',
  tiposPrimariosRepetidos(equipo(pokemon([NORMAL, NORMAL]), pokemon([NORMAL, NORMAL], { huevo: true })))
    .size === 0,
);
check(
  'sin tipos leidos no se inventa nada',
  tiposPrimariosRepetidos(equipo(pokemon(null), pokemon(null))).size === 0,
);
check('sin companero tambien funciona', tiposPrimariosRepetidos(equipo(pokemon([AGUA, AGUA])), null).size === 0);

console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);

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
const { aplicarReglas, MEMORIA_VACIA } = await desde('apps/web/src/core/reglasNuzlocke.ts');

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
check('Normal no vigila nada', Object.values(normal).every((v) => v === false));
check('Nuzlocke no vigila el tope ni el tipo', !nuzlocke.topeDeNivel && !nuzlocke.tipoPrimarioUnico);
check('pero si la primera captura y los muertos', nuzlocke.primeraCaptura && nuzlocke.muertoEsMuerto);
check('Nivelada lo vigila todo', Object.values(nivelada).every((v) => v === true));

const acabada = reglasActivas('nivelada', true);
check(
  'acabado el reto se apaga todo, aunque se siga jugando',
  Object.values(acabada).every((v) => v === false),
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

// --- solo el primero de cada ruta, y debilitado = muerto ---

const YO = 1111;
const OTRO = 2222;
const RUTA_1 = 101;
const RUTA_2 = 102;

const p = (personalidad, extra = {}) =>
  pokemon([NORMAL, NORMAL], { personalidad, lugar: RUTA_1, entrenador: YO, ...extra });

// Lee una serie de equipos seguidos, como hace el juego cada tres segundos.
const jugar = (...equipos) => {
  let memoria = MEMORIA_VACIA;
  let infracciones = null;
  for (const e of equipos) ({ memoria, infracciones } = aplicarReglas(memoria, e));
  return { memoria, infracciones };
};

const inicial = p(1, { lugar: 88 });
let r = jugar(equipo(inicial, p(2)));
check('la primera de cada zona no cuenta como infraccion', r.infracciones.rutaRepetida.size === 0);

r = jugar(equipo(inicial, p(2)), equipo(inicial, p(2), p(3)));
check('una segunda captura en la misma zona se marca', r.infracciones.rutaRepetida.has(3));
check('y no a la primera', !r.infracciones.rutaRepetida.has(2));

r = jugar(equipo(inicial, p(2)), equipo(inicial), equipo(inicial, p(3)));
check(
  'liberar a la primera no deja la zona libre',
  r.infracciones.rutaRepetida.has(3),
);

r = jugar(equipo(inicial, p(2)), equipo(inicial, p(2), p(4, { lugar: RUTA_2 })));
check('otra zona no choca', r.infracciones.rutaRepetida.size === 0);

r = jugar(equipo(inicial, p(2)), equipo(inicial, p(2), p(5, { entrenador: OTRO })));
check('lo que llega por intercambio no gasta tu ruta', r.infracciones.rutaRepetida.size === 0);

r = jugar(equipo(inicial, p(2)), equipo(inicial, p(2), p(6, { lugar: null })));
check('un huevo eclosionado o un regalo sin zona no cuenta', r.infracciones.rutaRepetida.size === 0);

// El laboratorio: tu inicial cae por guion y el juego lo cura.
r = jugar(equipo({ ...inicial, estado: 'debilitado' }), equipo(inicial));
check('caer en el laboratorio no cuenta como muerte', r.infracciones.revividos.size === 0);

r = jugar(equipo(inicial, p(2)), equipo(inicial, p(2, { estado: 'debilitado' })), equipo(inicial, p(2)));
check('un debilitado que vuelve a estar en pie se marca', r.infracciones.revividos.has(2));

r = jugar(
  equipo(inicial, p(2)),
  equipo(inicial, p(2, { estado: 'debilitado' })),
  equipo(inicial),
  equipo(inicial, p(2)),
);
check('tambien si se curo en el PC y vuelve despues', r.infracciones.revividos.has(2));

r = jugar(equipo(inicial, p(2)), equipo(inicial, p(2, { estado: 'debilitado' })));
check('mientras siga debilitado no es una infraccion', r.infracciones.revividos.size === 0);

const una = aplicarReglas(MEMORIA_VACIA, equipo(inicial, p(2))).memoria;
check(
  'leer el mismo equipo dos veces no cambia la memoria',
  JSON.stringify(aplicarReglas(una, equipo(inicial, p(2))).memoria) === JSON.stringify(una),
);

console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);

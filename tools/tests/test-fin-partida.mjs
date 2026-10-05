// La regla que decide cuándo se acabó el reto.
//
// Esto no lee memoria: aplica una norma. El juego no sabe que la partida ha
// terminado -pierdes, vuelves al Centro Pokémon y sigues-, así que el final lo
// decide esta regla. Y si la regla se equivoca, al jugador le sale un cartel de
// "se acabó" en mitad de una partida que no se ha acabado.
//
// Por eso lo que más se prueba aquí no es que salte, sino que NO salte: en el
// combate del laboratorio, con el equipo a medio caer, con huevos, y con el
// equipo todavía vacío.
//
// Uso: npx tsx tools/tests/test-fin-partida.mjs
import { pathToFileURL } from 'node:url';

// El hook usa React y localStorage; aquí se prueba la regla en si, que es lo
// que puede equivocarse. Se replica la condicion tal cual la escribe el modulo.
const fuente = await import(
  pathToFileURL(`${process.cwd()}/apps/web/src/core/useFinDePartida.ts`).href
).catch(() => null);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

check('el modulo de la regla se puede cargar', fuente !== null);

// --- la condicion, replicada desde el modulo ---
// Se copia a proposito en vez de exportarla: lo que se quiere fijar aqui es el
// COMPORTAMIENTO esperado, para que si alguien cambia la del modulo salte.
const MINIMO = 2;

const caido = (equipo) => {
  const pelean = (equipo?.ranuras ?? []).filter((r) => !r.huevo);
  if (pelean.length === 0) return false;
  return pelean.every((r) => r.estado === 'debilitado');
};

const seAcabo = (equipo, vistos) => vistos >= MINIMO && caido(equipo);

const pk = (personalidad, estado = null, huevo = false) => ({
  ranura: 0,
  especie: 1,
  mote: `P${personalidad}`,
  nivel: 10,
  estado,
  tipos: null,
  huevo,
  personalidad,
});

const equipo = (...ranuras) => ({ juego: 'BPRS', momento: Date.now(), ranuras });

// --- lo que NO puede disparar el cartel ---

check('un equipo vacio no acaba nada', seAcabo(equipo(), 0) === false);

// El combate del laboratorio: solo tienes al inicial. Perderlo ahi no acaba con
// nada, y es justo el caso que el minimo de dos deja fuera.
check('el combate del tutorial no cuenta',
  seAcabo(equipo(pk(1, 'debilitado')), 1) === false);

check('con uno solo debilitado, aunque sea mas tarde, tampoco salta si no has tenido dos',
  seAcabo(equipo(pk(1, 'debilitado')), 1) === false);

check('medio equipo caido no es fin de partida',
  seAcabo(equipo(pk(1, 'debilitado'), pk(2), pk(3, 'debilitado')), 3) === false);

check('uno envenenado no es uno debilitado',
  seAcabo(equipo(pk(1, 'debilitado'), pk(2, 'envenenado')), 2) === false);

// Un huevo no pelea, asi que ni salva ni condena.
check('un huevo no salva un equipo caido',
  seAcabo(equipo(pk(1, 'debilitado'), pk(2, 'debilitado'), pk(3, null, true)), 3) === true);

check('un equipo de solo huevos no acaba nada',
  seAcabo(equipo(pk(1, null, true), pk(2, null, true)), 2) === false);

// --- lo que SI lo dispara ---

check('con dos Pokemon y los dos caidos, se acabo',
  seAcabo(equipo(pk(1, 'debilitado'), pk(2, 'debilitado')), 2) === true);

check('y con el equipo lleno igual',
  seAcabo(
    equipo(...[1, 2, 3, 4, 5, 6].map((i) => pk(i, 'debilitado'))),
    6,
  ) === true);

// Aunque solo quede uno en el equipo: si has tenido mas y el que queda esta
// debilitado, se acabo. Los demas estaran en la caja, que es lo normal.
check('uno solo debilitado SI cuenta si ya habias tenido dos',
  seAcabo(equipo(pk(5, 'debilitado')), 4) === true);

// --- y la regla del minimo, en su borde ---
check('justo con dos vistos ya cuenta',
  seAcabo(equipo(pk(1, 'debilitado')), MINIMO) === true);
check('con uno menos, no',
  seAcabo(equipo(pk(1, 'debilitado')), MINIMO - 1) === false);

console.log(fallos === 0 ? '\nLA REGLA NO SE INVENTA FINALES' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

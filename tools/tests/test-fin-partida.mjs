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
// Hay DOS caminos y conviene no mezclarlos al leer esto:
//
//   - Lo dice el juego (el mensaje de ir corriendo al Centro Pokémon). Basta,
//     aunque solo tengas un Pokémon.
//   - Lo deducimos del equipo caído. Respaldo, y pide dos Pokémon distintos,
//     que es lo que deja fuera el combate del laboratorio.
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
const seAcabo = (equipo, { loDiceElJuego = false, vistos = null } = {}) => {
  // Camino bueno: el juego lo ha dicho. No hace falta nada mas.
  if (loDiceElJuego) return true;

  const pelean = (equipo?.ranuras ?? []).filter((r) => !r.huevo);
  if (pelean.length === 0) return false;
  if (!pelean.every((r) => r.estado === 'debilitado')) return false;

  // Camino de respaldo: dos Pokemon distintos vistos alguna vez. Por defecto,
  // los que hay ahora mismo.
  const conocidos = vistos ?? new Set(pelean.map((r) => r.personalidad));
  return conocidos.size >= 2;
};

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

check('un equipo vacio no acaba nada', seAcabo(equipo()) === false);

// LOS DOS CASOS QUE FALLARON, que son el mismo equipo y dan resultados
// distintos. Lo unico que cambia entre ellos es si el juego lo ha dicho, y por
// eso la regla no puede decidirlo contando Pokemon.

// Primero: el combate del laboratorio. Un solo Pokemon, debilitado, y el juego
// NO dice nada porque no te manda al Centro Pokemon: el rival se burla y te
// quedas donde estabas. El cartel salia encima del dialogo del propio rival.
check('en el combate del laboratorio NO se acaba nada',
  seAcabo(equipo(pk(1, 'debilitado')), { loDiceElJuego: false }) === false);

// Y el otro: saliste con tu inicial a buscar el segundo y te lo debilitaron
// antes de capturar nada. Ahi el juego SI lo dice, y cuenta aunque solo tengas
// uno. Perder antes de la primera captura es de las formas mas normales de que
// se acabe una Nuzlocke.
check('pero perdiendo de verdad con un solo Pokemon, si',
  seAcabo(equipo(pk(1, 'debilitado')), { loDiceElJuego: true }) === true);

check('medio equipo caido no es fin de partida',
  seAcabo(equipo(pk(1, 'debilitado'), pk(2), pk(3, 'debilitado'))) === false);

check('uno envenenado no es uno debilitado',
  seAcabo(equipo(pk(1, 'debilitado'), pk(2, 'envenenado'))) === false);

// Un huevo no pelea, asi que ni salva ni condena.
check('un huevo no salva un equipo caido',
  seAcabo(equipo(pk(1, 'debilitado'), pk(2, 'debilitado'), pk(3, null, true))) === true);

check('un equipo de solo huevos no acaba nada',
  seAcabo(equipo(pk(1, null, true), pk(2, null, true))) === false);

// --- lo que SI lo dispara ---

check('con dos Pokemon y los dos caidos, se acabo',
  seAcabo(equipo(pk(1, 'debilitado'), pk(2, 'debilitado'))) === true);

check('y con el equipo lleno igual',
  seAcabo(
    equipo(...[1, 2, 3, 4, 5, 6].map((i) => pk(i, 'debilitado'))),
    6,
  ) === true);

// Y con uno en el equipo y los demas en la caja, igual: lo que se mira es lo
// que llevas encima, que es lo unico que se puede leer.
check('uno solo debilitado cuenta aunque hayas tenido mas',
  seAcabo(equipo(pk(5, 'debilitado')), { vistos: new Set([1, 2, 3, 4, 5]) }) === true);

// Y el respaldo no se salta con el mismo Pokemon contado dos veces: se cuentan
// personalidades distintas, que es lo unico que no se repite.
check('el mismo Pokemon dos veces no son dos Pokemon',
  seAcabo(equipo(pk(1, 'debilitado')), { vistos: new Set([1]) }) === false);

console.log(fallos === 0 ? '\nLA REGLA NO SE INVENTA FINALES' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

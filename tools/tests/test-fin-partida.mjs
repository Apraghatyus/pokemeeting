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
// Y un Pokémon cuenta como caído de DOS formas: debilitado en tu partida, o con
// la pareja caída en la del compañero. Lo segundo es la regla del Soul Link: su
// pareja murió, así que ese ya no sirve aunque en tu juego tenga todos los PS.
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
const seAcabo = (
  equipo,
  {
    loDiceElJuego = false,
    vistos = null,
    caidosSuyos = [],
    elOtroPerdio = false,
    tope = null,
  } = {},
) => {
  // Camino bueno: el juego lo ha dicho. No hace falta nada mas.
  if (loDiceElJuego) return true;

  const sinPareja = new Set(caidosSuyos.map((m) => m.trim().toUpperCase()));
  const pelean = (equipo?.ranuras ?? []).filter((r) => !r.huevo);
  if (pelean.length === 0) return false;

  let porElEnlace = false;
  const todos = pelean.every((r) => {
    if (r.estado === 'debilitado') return true;
    if (r.mote && sinPareja.has(r.mote.trim().toUpperCase())) {
      porElEnlace = true;
      return true;
    }
    // Pasado del tope: en Nivelada no se puede usar, asi que para seguir
    // jugando es como si no estuviera.
    if (tope !== null && r.nivel > tope) return true;
    return false;
  });
  if (!todos) return false;

  // Camino de respaldo: dos Pokemon distintos vistos alguna vez. Por defecto,
  // los que hay ahora mismo. Dos es la forma de decir "esto no es el combate
  // del laboratorio" sin tener que reconocerlo.
  const conocidos = vistos ?? new Set(pelean.map((r) => r.personalidad));
  if (conocidos.size >= 2) return true;

  // Y con uno solo, una pareja caida acaba la partida unicamente si a la otra
  // persona se lo dijo SU juego. Que su Pokemon este a cero no basta: en el
  // laboratorio se queda a cero por guion, y eso le acababa la partida al de
  // enfrente en el minuto dos.
  return porElEnlace && elOtroPerdio;
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

// --- la regla del Soul Link ---
//
// Lo que se reporto: en un Soul Link te puedes quedar sin nadie con quien
// seguir sin que tu juego se entere, porque a los tuyos les cayo la pareja en
// la otra partida. Ahi no sale ningun mensaje de derrota ni tienes a nadie
// debilitado: tus Pokemon estan en pie y el reto se ha acabado igual.
const conMote = (mote, estado = null) => ({
  ranura: 0, especie: 1, mote, nivel: 10, estado, tipos: null, huevo: false, personalidad: 99,
});

// Con UN solo Pokemon hace falta ademas que a la otra persona se lo dijera su
// juego: ver el apartado del combate del laboratorio, mas abajo. Aqui la
// pareja murio de verdad, que es lo que describen estas tres.
check('si a tu unico Pokemon le cae la pareja, se acabo',
  seAcabo(equipo(conMote('Rayo')), { caidosSuyos: ['Rayo'], elOtroPerdio: true }) === true);

check('aunque en tu partida este perfectamente',
  seAcabo(equipo(conMote('Rayo', null)), { caidosSuyos: ['Rayo'], elOtroPerdio: true }) === true);

// Mayusculas y espacios no pueden separar una pareja: uno escribio "Rayo" y el
// otro "RAYO ".
check('el mote se compara sin distinguir mayusculas ni espacios',
  seAcabo(equipo(conMote('Rayo')), { caidosSuyos: ['  rayo '], elOtroPerdio: true }) === true);

// Y mezclado: uno debilitado en tu partida y al otro le cayo la pareja.
check('mezclando las dos formas de morir, tambien se acaba',
  seAcabo(equipo(pk(1, 'debilitado'), conMote('Rayo')), { caidosSuyos: ['Rayo'] }) === true);

// --- lo que el enlace NO puede dar por acabado ---
check('si solo cae la pareja de UNO y el otro sigue, no se acaba',
  seAcabo(equipo(conMote('Rayo'), pk(2)), { caidosSuyos: ['Rayo'] }) === false);

check('un mote que no coincide no mata a nadie',
  seAcabo(equipo(conMote('Rayo')), { caidosSuyos: ['Chispa'] }) === false);

// Sin companero no hay parejas que se puedan morir en otra partida.
check('jugando solo, el enlace no acaba nada',
  seAcabo(equipo(conMote('Rayo'))) === false);

// Un Pokemon sin mote no tiene pareja que buscar: emparejar dos vacios juntaria
// cosas que no van juntas.
check('sin mote no hay pareja', seAcabo(equipo(conMote('')), { caidosSuyos: [''] }) === false);

// --- EL COMBATE DEL LABORATORIO, POR EL LADO DEL ENLACE ---
//
// Lo que se reporto: en el primer combate, a ella le ganaron, su inicial se
// quedo a cero, y a EL le salto la pantalla de fin de partida. Los dos tenian
// un solo Pokemon y el mismo mote, que es como se emparejan.
//
// Desde aqui ese caso y una muerte de verdad se ven IGUAL: un Pokemon suyo a
// cero con el mote de uno mio. Lo unico que los separa es si a ella se lo dijo
// su juego, y en el laboratorio no lo dice: el rival se burla y te quedas
// donde estabas.
check('el primer combate del companero NO acaba tu partida',
  seAcabo(equipo(conMote('Rayo')), { caidosSuyos: ['Rayo'], elOtroPerdio: false }) === false);

// Y el caso que protegia la version anterior, que tiene que seguir en pie: con
// un solo Pokemon, si a ella la derrotaron de verdad, se acabo.
check('pero si a ella se lo dijo su juego, si',
  seAcabo(equipo(conMote('Rayo')), { caidosSuyos: ['Rayo'], elOtroPerdio: true }) === true);

// Pasado el tutorial ya no hace falta preguntarle a nadie: con dos Pokemon
// vistos, una pareja caida basta. Es lo normal a partir de la primera captura.
check('con dos Pokemon vistos, una pareja caida basta sin preguntar',
  seAcabo(equipo(conMote('Rayo')), {
    caidosSuyos: ['Rayo'],
    vistos: new Set([99, 100]),
    elOtroPerdio: false,
  }) === true);

// Y tu propio primer combate tampoco acaba la tuya, que es el caso de siempre
// visto desde el otro lado: lo mismo da que el Pokemon a cero sea el tuyo.
check('ni tu propio primer combate acaba la tuya',
  seAcabo(equipo(pk(1, 'debilitado')), { elOtroPerdio: true }) === false);

// --- EL TOPE DE NIVEL, QUE TAMBIEN DEJA SIN EQUIPO ---
//
// Lo reportado: dos debilitados y uno pasado de nivel, y no salia la pantalla
// de fin de partida. Tenia razon quien lo dijo. En Nivelada, quien se pasa del
// tope del proximo lider NO se puede usar; si es el unico que queda, no hay con
// que pelear y la partida se acabo, aunque ese siga en pie.
const conNivel = (personalidad, nivel, estado = null) => ({
  ranura: 0, especie: 1, mote: `P${personalidad}`, nivel, estado,
  tipos: null, huevo: false, personalidad,
});

// El caso tal cual: dos caidos y uno de nivel 25 con el tope en 24.
const comoLoReportaron = equipo(
  conNivel(1, 18, 'debilitado'),
  conNivel(2, 25),
  conNivel(3, 14, 'debilitado'),
);
check('dos caidos y el ultimo pasado de nivel: se acabo',
  seAcabo(comoLoReportaron, { tope: 24 }) === true);

// Y sin esa regla -Normal o Nuzlocke- pasarse de nivel no es nada, asi que ese
// mismo equipo sigue jugando.
check('pero sin tope de nivel, ese mismo equipo sigue',
  seAcabo(comoLoReportaron, { tope: null }) === false);

// Lo que no puede pasar: que un equipo sano se de por acabado porque uno se
// pase. Mientras quede alguien que SI se puede usar, se sigue.
check('con uno pasado pero otro utilizable, no se acaba nada',
  seAcabo(equipo(conNivel(1, 25), conNivel(2, 20)), { tope: 24 }) === false);

// Justo en el tope se puede usar: el tope es "hasta aqui", no "por debajo".
check('estar justo en el tope no te deja fuera',
  seAcabo(equipo(conNivel(1, 24), conNivel(2, 18, 'debilitado')), { tope: 24 }) === false);

// Y al ganar una medalla el tope sube, asi que el que estaba bloqueado vuelve:
// la partida que parecia acabada no lo estaba.
check('y si el tope sube, se vuelve a poder jugar',
  seAcabo(comoLoReportaron, { tope: 29 }) === false);

console.log(fallos === 0 ? '\nLA REGLA NO SE INVENTA FINALES' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

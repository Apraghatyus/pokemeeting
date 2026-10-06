// Quien esta peleando.
//
// La version anterior daba por hecho que el juego sube al que pelea a la ranura
// 0. Una partida de verdad lo desmintio: equipo [PEZGATO, A BUENO], peleando
// A BUENO, ranura 0 todavia PEZGATO. Asi que ahora se busca la copia de combate
// por la personalidad, que no cambia nunca.
//
// Lo que mas importa aqui NO es que lo encuentre: es que no se lo invente. Si la
// estructura no fuera como creemos, tiene que decir "no lo se" en vez de senalar
// a cualquiera, porque senalar al que no es en mitad de un Soul Link es peor que
// no senalar a nadie.
//
// Uso: npx tsx tools/tests/test-combate.mjs
import { pathToFileURL } from 'node:url';

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
const { quienPelea, TAMANO_COMBATIENTE, TAMANO_ESTADO } = pk;

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const EWRAM_EN_ESTADO = 0x21000;
const ESPECIE = 0x00;
const NIVEL = 0x2a;
const PERSONALIDAD = 0x48;

const pkmn = (personalidad, especie, nivel, ranura) => ({
  ranura, especie, mote: `P${personalidad}`, nivel,
  estado: null, tipos: null, huevo: false, personalidad,
});

// El equipo del caso real: el primero de la lista no es el que pelea.
const equipo = {
  juego: 'BPES',
  momento: 0,
  ranuras: [pkmn(0x11112222, 260, 5, 0), pkmn(0x33334444, 379, 7, 1)],
};

const vacio = () => new Uint8Array(TAMANO_ESTADO);

/** Escribe una copia de combate donde se diga. */
const ponerCombatiente = (estado, offset, { personalidad, especie, nivel }) => {
  const base = EWRAM_EN_ESTADO + offset;
  const v = new DataView(estado.buffer);
  v.setUint16(base + ESPECIE, especie, true);
  estado[base + NIVEL] = nivel;
  v.setUint32(base + PERSONALIDAD, personalidad, true);
  return estado;
};

check('sin combate no hay nadie peleando', quienPelea(vacio(), equipo) === null);

// El caso que se reporto: pelea el SEGUNDO de la lista.
const peleaElSegundo = ponerCombatiente(vacio(), 0x8000, equipo.ranuras[1]);
check('encuentra al que pelea aunque no sea el primero de la lista',
  quienPelea(peleaElSegundo, equipo) === 0x33334444,
  '0x' + (quienPelea(peleaElSegundo, equipo) ?? 0).toString(16));

const peleaElPrimero = ponerCombatiente(vacio(), 0x8000, equipo.ranuras[0]);
check('y al primero cuando es el primero', quienPelea(peleaElPrimero, equipo) === 0x11112222);

check('da igual en que parte de la memoria este',
  quienPelea(ponerCombatiente(vacio(), 0x3f000, equipo.ranuras[1]), equipo) === 0x33334444);

// --- lo que NO puede dar por bueno ---

// La personalidad sola no basta: en el equipo tambien esta, y ahi no significa
// que ese Pokemon este peleando.
const soloPersonalidad = vacio();
new DataView(soloPersonalidad.buffer).setUint32(EWRAM_EN_ESTADO + 0x8000 + PERSONALIDAD, 0x33334444, true);
check('una personalidad suelta no es una copia de combate',
  quienPelea(soloPersonalidad, equipo) === null);

// Si la especie no cuadra, la estructura no es la que creemos.
const especieQueNoEs = ponerCombatiente(vacio(), 0x8000, {
  ...equipo.ranuras[1], especie: 999,
});
check('con la especie en otro sitio, dice que no lo sabe',
  quienPelea(especieQueNoEs, equipo) === null);

const nivelQueNoEs = ponerCombatiente(vacio(), 0x8000, { ...equipo.ranuras[1], nivel: 99 });
check('y con el nivel tampoco se lo inventa', quienPelea(nivelQueNoEs, equipo) === null);

// Un Pokemon que no es tuyo -el rival- no ilumina nada tuyo.
const delRival = ponerCombatiente(vacio(), 0x8000, {
  personalidad: 0x99998888, especie: 25, nivel: 3,
});
check('el Pokemon del rival no es ninguno de los tuyos',
  quienPelea(delRival, equipo) === null);

// --- bordes ---
check('sin equipo no hay nada que buscar', quienPelea(vacio(), null) === null);
check('un equipo vacio tampoco', quienPelea(vacio(), { juego: 'BPES', momento: 0, ranuras: [] }) === null);
check('un estado que no lo es no rompe nada', quienPelea(new Uint8Array(64), equipo) === null);

// Un huevo no pelea, asi que no se busca ni aunque cuadrara.
const conHuevo = {
  juego: 'BPES', momento: 0,
  ranuras: [{ ...pkmn(0x55556666, 1, 1, 0), huevo: true }],
};
check('un huevo no pelea',
  quienPelea(ponerCombatiente(vacio(), 0x8000, conHuevo.ranuras[0]), conHuevo) === null);

check('la copia de combate ocupa 88 bytes', TAMANO_COMBATIENTE === 88);

console.log(fallos === 0 ? '\nEL QUE PELEA NO SE ADIVINA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

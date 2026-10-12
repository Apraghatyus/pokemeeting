// Comprueba las reglas del Centro Pokemon, las que se hacen cumplir: la
// enfermera no cura con un muerto en el equipo, y no se sale del Centro con un
// muerto ni, en Nivelada, con alguien por encima del tope.
//
// Es logica pura: dos lecturas -antes y ahora- y lo que hay que hacer. Cargar
// el estado anterior es cosa de `useEquipo`, y eso necesita navegador y ROM.
//
// Uso: npx tsx tools/tests/test-centro.mjs
import { pathToFileURL } from 'node:url';

const desde = (ruta) => import(pathToFileURL(`${process.cwd()}/${ruta}`).href);
const { juzgar, seCuroElEquipo } = await desde('apps/web/src/core/centroPokemon.ts');

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const CENTRO = 0x08350000;
const centro = { grupo: 5, numero: 4, zona: 0x5b, tipo: 8, disposicion: CENTRO };
const arriba = { grupo: 5, numero: 5, zona: 0x5b, tipo: 8, disposicion: CENTRO + 0x100 };
const calle = { grupo: 3, numero: 3, zona: 0x5b, tipo: 2, disposicion: 0x08360000 };
const ruta = { grupo: 3, numero: 20, zona: 0x68, tipo: 3, disposicion: 0x08370000 };

const pk = (personalidad, mote, { ps = 30, psMax = 30, nivel = 12, estado = null } = {}) => ({
  ranura: 0,
  especie: 1,
  mote,
  nivel,
  estado: ps === 0 ? 'debilitado' : estado,
  tipos: null,
  huevo: false,
  personalidad,
  ps,
  psMax,
});
const equipo = (...ranuras) => ({ juego: 'BPRS', ranuras, momento: 0 });
const lectura = (mapa, ...ranuras) => ({ mapa, equipo: equipo(...ranuras) });

const nuzlocke = {
  muertoEsMuerto: true,
  muertos: [2],
  tope: null,
  disposicionDelCentro: CENTRO,
};

// --- curar con un muerto ---
const conMuerto = lectura(centro, pk(1, 'BULBA', { ps: 10 }), pk(2, 'PIDGEY', { ps: 0 }));
const curados = lectura(centro, pk(1, 'BULBA'), pk(2, 'PIDGEY'));
check('la cura se reconoce', seCuroElEquipo(conMuerto, curados));
const aviso = juzgar(conMuerto, curados, nuzlocke);
check('la enfermera no cura con un muerto', aviso?.includes('enfermera') === true, aviso ?? '');
check('y dice a quien', aviso?.includes('PIDGEY') === true);

const conRevivir = juzgar(
  lectura(ruta, pk(1, 'BULBA', { ps: 10 }), pk(2, 'PIDGEY', { ps: 0 })),
  lectura(ruta, pk(1, 'BULBA', { ps: 10 }), pk(2, 'PIDGEY', { ps: 15 })),
  nuzlocke,
);
check('revivir con un objeto tampoco', conRevivir?.includes('no se puede revivir') === true);

const sinMuerto = juzgar(
  lectura(centro, pk(1, 'BULBA', { ps: 10 })),
  lectura(centro, pk(1, 'BULBA')),
  nuzlocke,
);
check('curar sin muertos, adelante', sinMuerto === null);

const laboratorio = juzgar(
  lectura(calle, pk(9, 'CHARMANDER', { ps: 0 })),
  lectura(calle, pk(9, 'CHARMANDER')),
  nuzlocke,
);
check('la caida del laboratorio no es un muerto', laboratorio === null);

const normal = juzgar(conMuerto, curados, { ...nuzlocke, muertoEsMuerto: false });
check('en Normal no hay nada que impedir', normal === null);

// --- salir del Centro ---
const dentroConMuerto = lectura(centro, pk(1, 'BULBA'), pk(2, 'PIDGEY', { ps: 0 }));
const fueraConMuerto = lectura(calle, pk(1, 'BULBA'), pk(2, 'PIDGEY', { ps: 0 }));
const salir = juzgar(dentroConMuerto, fueraConMuerto, nuzlocke);
check('no se sale con un muerto', salir?.includes('salir del Centro') === true, salir ?? '');

check(
  'subir a la planta de arriba si se puede',
  juzgar(dentroConMuerto, lectura(arriba, pk(1, 'BULBA'), pk(2, 'PIDGEY', { ps: 0 })), nuzlocke) ===
    null,
);
check(
  'quedarse dentro, tambien',
  juzgar(dentroConMuerto, dentroConMuerto, nuzlocke) === null,
);
check(
  'con el muerto ya en el PC, se sale',
  juzgar(lectura(centro, pk(1, 'BULBA')), lectura(calle, pk(1, 'BULBA')), nuzlocke) === null,
);
check(
  'sin saber cual es el Centro, no se impide salir',
  juzgar(dentroConMuerto, fueraConMuerto, { ...nuzlocke, disposicionDelCentro: null }) === null,
);
check(
  'salir de otro sitio con un muerto, si: hay que llegar al Centro',
  juzgar(lectura(ruta, pk(2, 'PIDGEY', { ps: 0 })), lectura(calle, pk(2, 'PIDGEY', { ps: 0 })), nuzlocke) ===
    null,
);

// --- el tope, en Nivelada ---
const nivelada = { ...nuzlocke, muertos: [], tope: 14 };
const pasado = juzgar(
  lectura(centro, pk(1, 'BULBA', { nivel: 16 })),
  lectura(calle, pk(1, 'BULBA', { nivel: 16 })),
  nivelada,
);
check('en Nivelada no se sale por encima del tope', pasado?.includes('tope es 14') === true, pasado ?? '');
check(
  'en el tope justo, si',
  juzgar(lectura(centro, pk(1, 'BULBA', { nivel: 14 })), lectura(calle, pk(1, 'BULBA', { nivel: 14 })), nivelada) ===
    null,
);
check(
  'en Nuzlocke el tope no cuenta',
  juzgar(lectura(centro, pk(1, 'BULBA', { nivel: 40 })), lectura(calle, pk(1, 'BULBA', { nivel: 40 })), nuzlocke) ===
    null,
);

console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallos.`);
process.exit(fallos === 0 ? 0 : 1);

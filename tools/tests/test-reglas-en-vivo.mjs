// Comprueba las reglas que se hacen cumplir:
//
//   - la enfermera no cura con nadie que deberia estar guardado en el PC;
//   - no se sale del Centro con un muerto, ni con un tipo primario repetido;
//   - y se dice al entrar que hay que guardarlo antes de seguir;
//   - una zona se gasta con el primer encuentro, que es lo que pinta el mapa;
//   - en Nivelada no se pelea contra el lider con alguien por encima del tope;
//   - solo el primer encuentro de cada zona, con la excepcion de los repetidos;
//
// y el lector del rival en combate y las familias evolutivas, que es de donde
// salen los datos.
//
// Es logica pura: lecturas y memoria, y lo que hay que hacer. Cargar el estado
// de antes es cosa de `useEquipo`, y eso necesita navegador y ROM.
//
// Uso: npx tsx tools/tests/test-reglas-en-vivo.mjs
import { pathToFileURL } from 'node:url';

const desde = (ruta) => import(pathToFileURL(`${process.cwd()}/${ruta}`).href);
const {
  juzgarCentro,
  juzgarLider,
  juzgarCaptura,
  apuntarEncuentro,
  seCuroElEquipo,
  revividoConObjeto,
  juzgarPokeball,
  deberDelCentro,
  zonasGastadas,
  ENCUENTROS_VACIOS,
} =
  await desde('apps/web/src/core/reglasEnVivo.ts');
const { rivalEnCombate, familiasEvolutivas, bolsilloDeBalls, TAMANO_ESTADO, REGIONES } = await desde(
  'packages/pokemon/src/index.ts',
);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const CENTRO = 0x08350000;
const centro = { grupo: 5, numero: 4, zona: 0x5b, tipo: 8, disposicion: CENTRO };
const arriba = { grupo: 5, numero: 5, zona: 0x5b, tipo: 8, disposicion: CENTRO + 0x100 };
const calle = { grupo: 3, numero: 3, zona: 0x5b, tipo: 2, disposicion: 0x08360000 };
const ruta = { grupo: 3, numero: 20, zona: 0x67, tipo: 3, disposicion: 0x08370000 };

const YO = 0x1234abcd;
const pk = (personalidad, mote, o = {}) => {
  const { ps = 30, psMax = 30, nivel = 12, estado = null, especie = 1, tipo = 12 } = o;
  return {
    ranura: 0,
    especie,
    mote,
    nivel,
    estado: ps === 0 ? 'debilitado' : estado,
    tipos: [tipo, tipo],
    huevo: false,
    personalidad,
    ps,
    psMax,
    entrenador: o.entrenador ?? YO,
    lugar: o.lugar ?? null,
  };
};
const equipo = (...ranuras) => ({ juego: 'BPRS', ranuras, momento: 0 });
// `balls` son los bytes del bolsillo: null es "no hay ninguna" (o no se sabe
// cual es el bolsillo, que para la regla es lo mismo). Por defecto se juega con
// balls encima, que es lo normal; el caso de ir sin ellas tiene sus pruebas.
const lectura = (mapa, ranuras, rival = null, balls = 'aa') => ({
  mapa,
  equipo: equipo(...ranuras),
  rival,
  balls,
});

const centroReglas = {
  muertoEsMuerto: true,
  muertos: [2],
  tiposRepetidos: null,
  disposicionDelCentro: CENTRO,
};

// --- curar con un muerto ---
const conMuerto = lectura(centro, [pk(1, 'BULBA', { ps: 10 }), pk(2, 'PIDGEY', { ps: 0 })]);
const curados = lectura(centro, [pk(1, 'BULBA'), pk(2, 'PIDGEY')]);
check('la cura se reconoce', seCuroElEquipo(conMuerto, curados));
const cura = juzgarCentro(conMuerto, curados, centroReglas);
check('la enfermera no cura con un muerto', cura?.motivo.includes('enfermera') === true, cura?.motivo);
check('y se vuelve a antes de hablar con ella', cura?.atras >= 8);
// Con un Revivir si: es la unica forma de volver.
const conRevivir = [
  lectura(ruta, [pk(1, 'BULBA', { ps: 10 }), pk(2, 'PIDGEY', { ps: 0 })]),
  lectura(ruta, [pk(1, 'BULBA', { ps: 10 }), pk(2, 'PIDGEY', { ps: 15 })]),
];
check('revivir con un objeto no se deshace', juzgarCentro(...conRevivir, centroReglas) === null);
check('y deja de estar muerto', revividoConObjeto(...conRevivir, centroReglas) === 2);
check('la cura de la enfermera no cuenta como Revivir', revividoConObjeto(conMuerto, curados, centroReglas) === null);
check(
  'un Revivir en Normal no hace nada',
  revividoConObjeto(...conRevivir, { ...centroReglas, muertoEsMuerto: false }) === null,
);
check(
  'curar sin muertos, adelante',
  juzgarCentro(lectura(centro, [pk(1, 'BULBA', { ps: 3 })]), lectura(centro, [pk(1, 'BULBA')]), centroReglas) ===
    null,
);
check(
  'la caida del laboratorio no es un muerto',
  juzgarCentro(lectura(calle, [pk(9, 'CHARM', { ps: 0 })]), lectura(calle, [pk(9, 'CHARM')]), centroReglas) ===
    null,
);
check(
  'en Normal no hay nada que impedir',
  juzgarCentro(conMuerto, curados, { ...centroReglas, muertoEsMuerto: false }) === null,
);

// --- un muerto sacado del PC: en pie, pero muerto ---
const sacadoDelPC = lectura(centro, [pk(1, 'BULBA', { ps: 10 }), pk(2, 'PIDGEY')]);
const curaConSacado = juzgarCentro(sacadoDelPC, lectura(centro, [pk(1, 'BULBA'), pk(2, 'PIDGEY')]), centroReglas);
check(
  'la enfermera tampoco cura con un muerto sacado del PC',
  curaConSacado?.motivo.includes('PIDGEY') === true && curaConSacado?.atras >= 8,
  curaConSacado?.motivo,
);
const salirConSacado = juzgarCentro(
  lectura(centro, [pk(1, 'BULBA'), pk(2, 'PIDGEY')]),
  lectura(calle, [pk(1, 'BULBA'), pk(2, 'PIDGEY')]),
  centroReglas,
);
check('ni se sale del Centro con el', salirConSacado?.motivo.includes('PIDGEY') === true, salirConSacado?.motivo);

// --- salir del Centro ---
const dentroConMuerto = lectura(centro, [pk(1, 'BULBA'), pk(2, 'PIDGEY', { ps: 0 })]);
const fueraConMuerto = lectura(calle, [pk(1, 'BULBA'), pk(2, 'PIDGEY', { ps: 0 })]);
const salir = juzgarCentro(dentroConMuerto, fueraConMuerto, centroReglas);
check('no se sale con un muerto', salir?.motivo.includes('salir del Centro') === true, salir?.motivo);
check('y se vuelve justo a antes de salir', salir?.atras === 0);
check(
  'subir a la planta de arriba si se puede',
  juzgarCentro(dentroConMuerto, lectura(arriba, [pk(1, 'BULBA'), pk(2, 'PIDGEY', { ps: 0 })]), centroReglas) ===
    null,
);
check(
  'con el muerto ya en el PC, se sale',
  juzgarCentro(lectura(centro, [pk(1, 'BULBA')]), lectura(calle, [pk(1, 'BULBA')]), centroReglas) === null,
);
check(
  'sin saber cual es el Centro, no se impide salir',
  juzgarCentro(dentroConMuerto, fueraConMuerto, { ...centroReglas, disposicionDelCentro: null }) === null,
);
check(
  'salir de otro sitio con un muerto, si: hay que llegar al Centro',
  juzgarCentro(lectura(ruta, [pk(2, 'PIDGEY', { ps: 0 })]), lectura(calle, [pk(2, 'PIDGEY', { ps: 0 })]), centroReglas) ===
    null,
);
check(
  'el tope ya no impide salir del Centro',
  juzgarCentro(lectura(centro, [pk(1, 'BULBA', { nivel: 60 })]), lectura(calle, [pk(1, 'BULBA', { nivel: 60 })]), centroReglas) ===
    null,
);

// --- tipo primario repetido (Nivelada) ---
const conRepetido = { ...centroReglas, muertos: [], tiposRepetidos: new Set([11]) };
const tipo = juzgarCentro(
  lectura(centro, [pk(1, 'BULBA'), pk(3, 'PSYDUCK', { tipo: 11 })]),
  lectura(calle, [pk(1, 'BULBA'), pk(3, 'PSYDUCK', { tipo: 11 })]),
  conRepetido,
);
check('no se sale con un tipo primario repetido', tipo?.motivo.includes('PSYDUCK') === true, tipo?.motivo);

// --- LO QUE HAY QUE GUARDAR ANTES DE SEGUIR, al entrar en el Centro ---
//
// Lo pedido: entrar en el Centro con una restriccion obliga a guardar un
// Pokemon antes de continuar. Antes solo se sabia al chocarse con la regla
// -la enfermera que no atiende, la puerta que no deja salir-, asi que se
// descubria deshaciendo. Ahora se dice en cuanto entras y se queda dicho
// mientras siga sin cumplirse.
const deber = deberDelCentro(centro, equipo(pk(1, 'BULBA'), pk(2, 'PIDGEY')), centroReglas);
check('al entrar en el Centro con un muerto, se dice que hay que guardarlo', deber?.includes('PIDGEY') === true, deber);
check('y por que no se puede seguir sin eso', deber?.includes('PC') === true && deber?.includes('enfermera') === true);
check(
  'con el muerto debilitado, igual',
  deberDelCentro(centro, equipo(pk(1, 'BULBA'), pk(2, 'PIDGEY', { ps: 0 })), centroReglas)?.includes('PIDGEY') === true,
);
check(
  'ya guardado, nada que hacer',
  deberDelCentro(centro, equipo(pk(1, 'BULBA')), centroReglas) === null,
);
check(
  'fuera del Centro no se obliga a nada',
  deberDelCentro(calle, equipo(pk(1, 'BULBA'), pk(2, 'PIDGEY')), centroReglas) === null,
);
check(
  'arriba del Centro tambien cuenta como Centro',
  deberDelCentro(arriba, equipo(pk(2, 'PIDGEY')), centroReglas) === null,
);
check(
  'en Normal no hay nada que guardar',
  deberDelCentro(centro, equipo(pk(2, 'PIDGEY')), { ...centroReglas, muertoEsMuerto: false }) === null,
);
check(
  'sin saber cual es el Centro, no se pide nada',
  deberDelCentro(centro, equipo(pk(2, 'PIDGEY')), { ...centroReglas, disposicionDelCentro: null }) === null,
);
check(
  'sin partida cargada tampoco',
  deberDelCentro(null, null, centroReglas) === null,
);
const deberTipo = deberDelCentro(
  centro,
  equipo(pk(1, 'BULBA'), pk(3, 'PSYDUCK', { tipo: 11 })),
  { ...centroReglas, muertos: [], tiposRepetidos: new Set([11]) },
);
check('y en Nivelada, el del tipo repetido tambien hay que guardarlo', deberTipo?.includes('PSYDUCK') === true, deberTipo);
// Y la enfermera lo hace cumplir: curar es seguir.
const curaConTipo = juzgarCentro(
  lectura(centro, [pk(1, 'BULBA', { ps: 5 }), pk(3, 'PSYDUCK', { tipo: 11, ps: 5 })]),
  lectura(centro, [pk(1, 'BULBA'), pk(3, 'PSYDUCK', { tipo: 11 })]),
  { ...centroReglas, muertos: [], tiposRepetidos: new Set([11]) },
);
check(
  'la enfermera tampoco atiende con un tipo repetido sin guardar',
  curaConTipo?.motivo.includes('PSYDUCK') === true && curaConTipo?.punto === 'centro',
  curaConTipo?.motivo,
);

// --- el lider, en Nivelada ---
const brock = { nombre: 'BROCK', tope: 14, equipo: [{ especie: 74, nivel: 12 }, { especie: 95, nivel: 14 }] };
const geodude = { especie: 74, nivel: 12, personalidad: 777, entrenador: 999 };
const lider = juzgarLider(
  lectura(calle, [pk(1, 'BULBA', { nivel: 16 })]),
  lectura(calle, [pk(1, 'BULBA', { nivel: 16 })], geodude),
  brock,
  YO,
);
check('no se pelea contra el lider por encima del tope', lider?.motivo.includes('BROCK') === true, lider?.motivo);
check('y se vuelve a antes del combate', lider?.antesDe === 777 && lider?.atras >= 10);
check(
  'dentro del tope, adelante',
  juzgarLider(lectura(calle, [pk(1, 'BULBA', { nivel: 14 })]), lectura(calle, [pk(1, 'BULBA', { nivel: 14 })], geodude), brock, YO) ===
    null,
);
check(
  'contra otro entrenador, adelante',
  juzgarLider(
    lectura(calle, [pk(1, 'BULBA', { nivel: 16 })]),
    lectura(calle, [pk(1, 'BULBA', { nivel: 16 })], { ...geodude, nivel: 9 }),
    brock,
    YO,
  ) === null,
);
check(
  'solo al empezar el combate',
  juzgarLider(lectura(calle, [pk(1, 'BULBA', { nivel: 16 })], geodude), lectura(calle, [pk(1, 'BULBA', { nivel: 16 })], geodude), brock, YO) ===
    null,
);

// --- primer encuentro de cada zona ---
const familia = (especie) => ({ 16: 16, 17: 16, 18: 16 })[especie] ?? especie;
const contexto = { propio: YO, rutas: {}, familia };
const nombreDe = (e) => ({ 16: 'PIDGEY', 19: 'RATTATA', 17: 'PIDGEOTTO' })[e] ?? `#${e}`;
const salvaje = (especie, personalidad) => ({ especie, nivel: 3, personalidad, entrenador: YO });

const equipoBase = [pk(1, 'BULBA')];
let paso = apuntarEncuentro(ENCUENTROS_VACIOS, lectura(ruta, equipoBase, salvaje(19, 500)), contexto, nombreDe);
check('el primer salvaje de la zona se apunta', paso.memoria.zonas[String(0x67)]?.personalidad === 500);
check('y se avisa', paso.aviso?.includes('RATTATA') === true, paso.aviso);
const tras = apuntarEncuentro(paso.memoria, lectura(ruta, equipoBase, salvaje(16, 501)), contexto, nombreDe);
check(
  'el segundo no cambia la zona, pero avisa de que no se le lanzan Poke Balls',
  tras.memoria.zonas[String(0x67)]?.personalidad === 500 && tras.aviso?.includes('Poké Balls') === true,
);

const captura = juzgarCaptura(
  lectura(ruta, equipoBase, salvaje(16, 501)),
  lectura(ruta, [...equipoBase, pk(501, 'PIDGEY', { especie: 16, lugar: 0x67 })], salvaje(16, 501)),
  tras.memoria,
  contexto,
  () => 'Ruta 3',
);
check('capturar el segundo de la zona se deshace', captura?.motivo.includes('Ruta 3') === true, captura?.motivo);
check('volviendo a antes de ese combate', captura?.antesDe === 501);
check(
  'capturar el primero, adelante',
  juzgarCaptura(
    lectura(ruta, equipoBase, salvaje(19, 500)),
    lectura(ruta, [...equipoBase, pk(500, 'RATTATA', { especie: 19, lugar: 0x67 })], salvaje(19, 500)),
    tras.memoria,
    contexto,
    () => 'Ruta 3',
  ) === null,
);
check(
  'lo que llega de un intercambio no cuenta',
  juzgarCaptura(
    lectura(ruta, equipoBase),
    lectura(ruta, [...equipoBase, pk(600, 'X', { lugar: 0x67, entrenador: 4242 })]),
    tras.memoria,
    contexto,
    () => 'Ruta 3',
  ) === null,
);

// La excepcion: el primero es de una familia que ya llevas.
const conPidgeotto = [pk(1, 'BULBA'), pk(7, 'PIDGEOTTO', { especie: 17 })];
const repetido = apuntarEncuentro(ENCUENTROS_VACIOS, lectura(ruta, conPidgeotto, salvaje(16, 800)), contexto, nombreDe);
check('un repetido de familia no gasta la zona', repetido.memoria.zonas[String(0x67)] === undefined);
check('y se dice', repetido.aviso?.includes('no cuenta') === true, repetido.aviso);
const siguiente = apuntarEncuentro(repetido.memoria, lectura(ruta, conPidgeotto, salvaje(19, 801)), contexto, nombreDe);
check('el siguiente si es el de la zona', siguiente.memoria.zonas[String(0x67)]?.personalidad === 801);

// SIN POKE BALLS NO SE GASTA LA RUTA.
//
// Lo reportado: al empezar no te dan ninguna, y de camino a por ellas salieron
// dos combates que no se podian intentar. El tercero, ya con balls, fue un
// EXEGGUTOR que se le resistio -gasto todas y no lo capturo- y la ruta no se
// marco como gastada en el mapa.
const sinBalls = apuntarEncuentro(
  ENCUENTROS_VACIOS,
  lectura(ruta, equipoBase, salvaje(19, 400), null),
  contexto,
  nombreDe,
);
check('sin Poke Balls, el salvaje no gasta la zona', sinBalls.memoria.zonas[String(0x67)] === undefined);
check('y se dice por que', sinBalls.aviso?.includes('Sin Poké Balls') === true, sinBalls.aviso);
// Pero se apunta que ese combate ya se vio, para no repetir el aviso.
check('aunque el combate queda visto', sinBalls.memoria.ultimoRival === 400);

// Y en cuanto hay balls, el siguiente SI es el encuentro de la ruta.
const yaConBalls = apuntarEncuentro(
  sinBalls.memoria,
  lectura(ruta, equipoBase, salvaje(103, 401)),
  contexto,
  nombreDe,
);
check('con balls, el siguiente si es el encuentro de la zona',
  yaConBalls.memoria.zonas[String(0x67)]?.personalidad === 401);

// Y una vez apuntado, que se escape no devuelve la ruta: el siguiente ya no
// se puede intentar.
const trasEscaparse = juzgarPokeball(
  { ...lectura(ruta, equipoBase, salvaje(19, 402), 'aa'), equipo: { ...equipo(...equipoBase), enCombate: true } },
  { ...lectura(ruta, equipoBase, salvaje(19, 402), 'ab'), equipo: { ...equipo(...equipoBase), enCombate: true } },
  yaConBalls.memoria,
  contexto,
  () => 'Ruta 1',
);
check('y si se escapa, al siguiente ya no se le tira nada',
  trasEscaparse?.motivo.includes('Ruta 1') === true, trasEscaparse?.motivo);

// Un combate contra un entrenador no es un encuentro.
const entrenador = apuntarEncuentro(
  ENCUENTROS_VACIOS,
  lectura(ruta, equipoBase, { ...salvaje(19, 900), entrenador: 31337 }),
  contexto,
  nombreDe,
);
check('un entrenador no gasta la zona', entrenador.memoria.zonas[String(0x67)] === undefined);

// Una zona que ya dio su Pokemon antes de apuntar encuentros.
const yaCapturada = apuntarEncuentro(
  ENCUENTROS_VACIOS,
  lectura(ruta, equipoBase, salvaje(19, 950)),
  { ...contexto, rutas: { [String(0x67)]: 1 } },
  nombreDe,
);
check('una zona ya gastada no apunta otro', yaCapturada.memoria.zonas[String(0x67)] === undefined);

// --- lanzar una Poke Ball donde no toca ---
const enCombate = (ranuras, rival, balls) => ({
  mapa: ruta,
  equipo: { ...equipo(...ranuras), enCombate: true },
  rival,
  balls,
});
const otroSalvaje = salvaje(16, 501);
const lanzar = juzgarPokeball(
  enCombate(equipoBase, otroSalvaje, 'aa'),
  enCombate(equipoBase, otroSalvaje, 'ab'),
  tras.memoria,
  contexto,
  () => 'Ruta 3',
);
check('lanzar una Poke Ball en una zona gastada se deshace', lanzar?.motivo.includes('Poké Balls') === true, lanzar?.motivo);
check('volviendo a antes del combate', lanzar?.antesDe === 501);
check(
  'al primero de la zona si se le puede lanzar',
  juzgarPokeball(
    enCombate(equipoBase, salvaje(19, 500), 'aa'),
    enCombate(equipoBase, salvaje(19, 500), 'ab'),
    tras.memoria,
    contexto,
    () => 'Ruta 3',
  ) === null,
);
check(
  'sin lanzar nada, nada',
  juzgarPokeball(enCombate(equipoBase, otroSalvaje, 'aa'), enCombate(equipoBase, otroSalvaje, 'aa'), tras.memoria, contexto, () => '') ===
    null,
);
check(
  'fuera de combate, comprar no es lanzar',
  juzgarPokeball(
    { ...enCombate(equipoBase, otroSalvaje, 'aa'), equipo: equipo(...equipoBase) },
    { ...enCombate(equipoBase, otroSalvaje, 'ab'), equipo: equipo(...equipoBase) },
    tras.memoria,
    contexto,
    () => '',
  ) === null,
);
const aviso = apuntarEncuentro(tras.memoria, lectura(ruta, equipoBase, salvaje(16, 502)), contexto, nombreDe);
check('al empezar en una zona gastada se avisa', aviso.aviso?.includes('Poké Balls') === true, aviso.aviso);

// --- LAS ZONAS GASTADAS, que es lo que pinta el mapa ---
//
// Lo reportado: ya habia tenido el primer combate de la ruta y el mapa seguia
// diciendo que ahi se podia capturar. El mapa contaba solo las capturas, y la
// regla cuenta los encuentros.
const unEncuentro = { [String(0x67)]: { especie: 19, personalidad: 500 } };
check(
  'una ruta con su encuentro ya sale gastada aunque no se capturara nada',
  zonasGastadas(unEncuentro, {}, equipo(pk(1, 'BULBA')), YO).join() === String(0x67),
  JSON.stringify(zonasGastadas(unEncuentro, {}, equipo(pk(1, 'BULBA')), YO)),
);
check(
  'sin encuentros ni capturas, ninguna',
  zonasGastadas({}, {}, equipo(pk(1, 'BULBA')), YO).length === 0,
);
check(
  'la zona apuntada por una captura sigue contando',
  zonasGastadas({}, { [String(0x68)]: 77 }, null, YO).join() === String(0x68),
);
check(
  'y el sitio de donde salio cada uno del equipo, para las partidas ya empezadas',
  zonasGastadas({}, {}, equipo(pk(1, 'BULBA', { lugar: 0x69 })), YO).join() === String(0x69),
);
check(
  'lo que llego de un intercambio no gasta tu zona',
  zonasGastadas({}, {}, equipo(pk(1, 'BULBA', { lugar: 0x69, entrenador: 999 })), YO).length === 0,
);
check(
  'un huevo tampoco',
  zonasGastadas({}, {}, equipo({ ...pk(1, 'HUEVO', { lugar: 0x69 }), huevo: true }), YO).length === 0,
);
check(
  'las tres fuentes se juntan sin repetir y en orden',
  zonasGastadas(unEncuentro, { [String(0x67)]: 500, [String(0x66)]: 1 }, equipo(pk(1, 'BULBA', { lugar: 0x68 })), YO).join() ===
    [0x66, 0x67, 0x68].join(),
);

// --- el bolsillo de Poke Balls en la memoria ---
{
  const est = new Uint8Array(TAMANO_ESTADO);
  const base = REGIONES.ewram.inicio;
  const bloque = 0x1a48;
  est[base + bloque + 4] = 3;
  est[base + bloque + 5] = 20;
  const v = new DataView(est.buffer);
  v.setUint16(base + bloque + 0x430, 4, true); // Poke Ball
  v.setUint16(base + bloque + 0x432, 7, true);
  v.setUint16(base + bloque + 0x434, 3, true); // Super Ball
  const bolsillo = bolsilloDeBalls(est, 'BPRS', { grupo: 3, numero: 20 });
  check('se encuentra el bolsillo de Poke Balls', bolsillo?.tipos === 2, JSON.stringify(bolsillo?.tipos));
  const firma = bolsillo?.firma;
  v.setUint16(base + bloque + 0x432, 6, true);
  check('y cambia al gastar una', bolsilloDeBalls(est, 'BPRS', { grupo: 3, numero: 20 }, bolsillo?.bloque)?.firma !== firma);
  check('en otro mapa no se reconoce', bolsilloDeBalls(est, 'BPRS', { grupo: 4, numero: 20 }) === null);
  v.setUint16(base + bloque + 0x438, 99, true);
  check('con algo que no es una Poke Ball, no es el bolsillo', bolsilloDeBalls(est, 'BPRS', { grupo: 3, numero: 20 }) === null);
}

// --- el rival en la memoria ---
const estado = new Uint8Array(TAMANO_ESTADO);
const ewram = REGIONES.ewram.inicio;
const vista = new DataView(estado.buffer);
const copia = 0x23f00;
const escribirCopia = (donde, especie, nivel, personalidad, entrenadorId) => {
  vista.setUint16(ewram + donde, especie, true);
  estado[ewram + donde + 0x2a] = nivel;
  vista.setUint16(ewram + donde + 0x28, 20, true);
  vista.setUint16(ewram + donde + 0x2c, 25, true);
  vista.setUint32(ewram + donde + 0x48, personalidad, true);
  vista.setUint32(ewram + donde + 0x54, entrenadorId, true);
};
escribirCopia(copia, 1, 12, 1, YO);
escribirCopia(copia + 0x58, 19, 4, 4321, YO);
const rival = rivalEnCombate(estado, equipo(pk(1, 'BULBA', { especie: 1, nivel: 12 })));
check('se lee el rival junto a tu copia', rival?.especie === 19 && rival?.nivel === 4, JSON.stringify(rival));
check('con su entrenador', rival?.entrenador === YO && rival?.personalidad === 4321);
estado.fill(0, ewram + copia + 0x58, ewram + copia + 0xb0);
check('sin rival que cuadre, null', rivalEnCombate(estado, equipo(pk(1, 'BULBA', { especie: 1 }))) === null);

// --- familias evolutivas ---
const tabla = {
  evolucionesDe: (e) => ({ 16: [{ destino: 17 }], 17: [{ destino: 18 }], 133: [{ destino: 134 }, { destino: 135 }] })[e] ?? [],
};
const fam = familiasEvolutivas(tabla);
check('Pidgey y Pidgeot son de la misma familia', fam(16) === fam(18));
check('Vaporeon y Jolteon tambien, por Eevee', fam(134) === fam(135));
check('Pidgey y Rattata no', fam(16) !== fam(19));

console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallos.`);
process.exit(fallos === 0 ? 0 : 1);

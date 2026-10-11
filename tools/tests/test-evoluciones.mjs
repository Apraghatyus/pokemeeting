// Los Pokemon que evolucionan al intercambiarse.
//
// En el juego de verdad, un Haunter que cambias de consola llega al otro lado
// convertido en Gengar. Aqui el intercambio no pasa por el juego -son cien
// bytes que salen de una partida y entran en otra- asi que esa evolucion hay
// que hacerla nosotros. Si no, Haunter se queda Haunter para siempre, y Haunter
// SOLO evoluciona asi.
//
// Se prueban tres cosas, y la primera es la que puede estar mal de verdad:
//
//   1. Que la tabla de evoluciones se encuentra dentro de la ROM por su forma,
//      sin saber de antemano donde esta. Se comprueba contra las direcciones
//      que el propio aleatorizador lleva en su fichero de configuracion, que
//      son datos independientes de los nuestros.
//   2. Que de ahi salen las doce evoluciones por intercambio que tiene la
//      tercera generacion, con sus objetos.
//   3. Que un Haunter metido en una partida sale Gengar, con las
//      estadisticas de Gengar y no las que traia.
//
// Uso: npx tsx tools/tests/test-evoluciones.mjs <rom.gba> [mas-roms.gba...]
import { existsSync, readFileSync } from 'node:fs';
import {
  AL_INTERCAMBIAR,
  AL_INTERCAMBIAR_CON_OBJETO,
  alIntercambiar,
  encontrarTablaEvoluciones,
  encontrarTablaNombres,
  encontrarTablaEstadisticas,
  escribirEspecie,
  escribirMote,
  aplicarRecepcion,
  contextoDeRom,
  leerPokemon,
  leerTexto,
  localizarEquipo,
} from '../../packages/pokemon/src/index.ts';

const roms = process.argv.slice(2);
if (roms.length === 0) {
  console.error('Uso: npx tsx tools/tests/test-evoluciones.mjs <rom.gba> [mas...]');
  process.exit(2);
}

let fallos = 0;
const check = (que, bien, detalle = '') => {
  console.log(`${bien ? 'OK  ' : 'MAL '}  ${que}${detalle ? `  -> ${detalle}` : ''}`);
  if (!bien) fallos += 1;
};

/**
 * Las direcciones que lleva el aleatorizador en su propio fichero.
 *
 * No son nuestras: vienen del jar. Que la busqueda por forma caiga justo ahi es
 * lo que dice que encuentra la tabla de verdad y no algo que se le parece.
 */
const SEGUN_EL_RANDOMIZER = {
  BPRS: 0x254f1c,
  BPGS: 0x254efc,
  BPES: 0x32b5d8,
  AXVS: 0x2088e4,
  AXPS: 0x208874,
  BPRE: 0x259754,
  BPGE: 0x259734,
  BPEE: 0x32531c,
};

// Las doce de tercera generacion, con el objeto que hace falta. El 0 es "nada
// puesto". Los numeros de especie son los internos, que para los 251 primeros
// coinciden con la Pokedex nacional.
const ESPERADAS = [
  [64, 0, 65, 'Kadabra a Alakazam'],
  [67, 0, 68, 'Machoke a Machamp'],
  [75, 0, 76, 'Graveler a Golem'],
  [93, 0, 94, 'Haunter a Gengar'],
  [61, 187, 186, 'Poliwhirl con Roca del Rey a Politoed'],
  [79, 187, 199, 'Slowpoke con Roca del Rey a Slowking'],
  [95, 199, 208, 'Onix con Garra Metal a Steelix'],
  [117, 201, 230, 'Seadra con Escama Dragon a Kingdra'],
  [123, 199, 212, 'Scyther con Garra Metal a Scizor'],
  [137, 218, 233, 'Porygon con Mejora a Porygon2'],
  [373, 192, 374, 'Clamperl con Diente Marino a Huntail'],
  [373, 193, 375, 'Clamperl con Escama Marina a Gorebyss'],
];

for (const ruta of roms) {
  const rom = new Uint8Array(readFileSync(ruta));
  const codigo = String.fromCharCode(...rom.slice(0xac, 0xb0));
  console.log(`\n--- ${ruta.split(/[\\/]/).pop()}  (${codigo}) ---`);

  const t = Date.now();
  const tabla = encontrarTablaEvoluciones(rom);
  const tardo = Date.now() - t;

  check('se encuentra la tabla de evoluciones', tabla !== null, `${tardo} ms`);
  if (!tabla) continue;

  const esperada = SEGUN_EL_RANDOMIZER[codigo];
  if (esperada === undefined) {
    console.log(`SALTO  la direccion: ${codigo} no esta en el fichero del aleatorizador`);
  } else {
    check(
      'y cae donde dice el fichero del propio aleatorizador',
      tabla.direccion === esperada,
      `0x${tabla.direccion.toString(16).toUpperCase()} contra 0x${esperada.toString(16).toUpperCase()}`,
    );
  }

  check('con un numero de especies que evolucionan que tiene sentido',
    tabla.conEvolucion > 100 && tabla.conEvolucion < 300, `${tabla.conEvolucion}`);

  // --- las doce ---
  const fallan = [];
  for (const [especie, objeto, destino, que] of ESPERADAS) {
    if (alIntercambiar(tabla, especie, objeto) !== destino) fallan.push(que);
  }
  check('salen las doce evoluciones por intercambio', fallan.length === 0, fallan.join('; '));

  // Y lo que NO tiene que pasar: que evolucione sin el objeto. Scyther a secas
  // se queda Scyther; solo con la Garra Metal se convierte en Scizor.
  check('pero no sin el objeto que hace falta',
    alIntercambiar(tabla, 123, 0) === null && alIntercambiar(tabla, 373, 0) === null);

  // Ni que evolucione algo que no evoluciona asi. Pikachu sube con una piedra,
  // no intercambiandolo.
  check('ni los que no evolucionan al intercambiarse',
    alIntercambiar(tabla, 25, 0) === null && alIntercambiar(tabla, 1, 0) === null);

  const metodos = new Set(tabla.evolucionesDe(93).map((e) => e.metodo));
  check('y el metodo de Haunter es el de intercambio',
    metodos.has(AL_INTERCAMBIAR), [...metodos].join(','));
  check('y el de Scyther el de intercambio con objeto',
    tabla.evolucionesDe(123).some((e) => e.metodo === AL_INTERCAMBIAR_CON_OBJETO));

  // --- 3. cambiarle la especie a un bloque de verdad ---
  //
  // Se fabrica un bloque minimo con la especie dentro y se comprueba que al
  // cambiarla sigue siendo un Pokemon valido: el checksum tiene que cuadrar o
  // el juego lo pinta como "Bad Egg".
  const nombres = encontrarTablaNombres(rom);
  const bloque = new Uint8Array(100);
  // Personalidad e ID a numeros cualesquiera pero fijos, para que la prueba
  // sea la misma cada vez.
  const personalidad = 0x1234abcd;
  const idEntrenador = 0x0bad0cab;
  new DataView(bloque.buffer).setUint32(0, personalidad, true);
  new DataView(bloque.buffer).setUint32(4, idEntrenador, true);

  const conHaunter = escribirEspecie(bloque, 93);
  const leidoHaunter = leerPokemon(conHaunter);
  check('un bloque con la especie escrita queda valido',
    leidoHaunter.valido && leidoHaunter.especie === 93,
    `especie ${leidoHaunter.especie}, checksum ${leidoHaunter.valido ? 'cuadra' : 'no cuadra'}`);

  const evolucionado = escribirEspecie(conHaunter, alIntercambiar(tabla, 93, 0));
  const leidoGengar = leerPokemon(evolucionado);
  check('y al evolucionarlo sigue valido, ya convertido',
    leidoGengar.valido && leidoGengar.especie === 94,
    `${nombres?.nombre(93)} -> ${nombres?.nombre(leidoGengar.especie)}`);

  // Lo que no puede cambiar: sigue siendo el mismo Pokemon, no uno nuevo.
  check('conservando quien es: personalidad y entrenador',
    leidoGengar.personalidad === leidoHaunter.personalidad &&
      leidoGengar.idEntrenador === leidoHaunter.idEntrenador);
}

// --- 4. y en una partida de verdad ---------------------------------------
//
// Lo de arriba comprueba la tabla y el bloque por separado. Esto es el camino
// entero: se mete un Haunter en una partida de verdad por donde entra un
// Pokemon intercambiado, y tiene que salir Gengar. Es lo que fallaba.
const ESTADO = process.env.ESTADO
  ?? 'roms/Pokemon - Edicion Rojo Fuego (Spain)-aleatoria-muw3zeeo.estado.bin';

if (!existsSync(ESTADO)) {
  console.log(`\nSALTO  la partida de verdad: no esta ${ESTADO}`);
} else {
  console.log('\n--- metido en una partida de verdad ---');
  const rom = new Uint8Array(readFileSync(roms[0]));
  const estado = new Uint8Array(readFileSync(ESTADO));
  const ctx = contextoDeRom(rom);
  const nombres = encontrarTablaNombres(rom);
  const equipo = localizarEquipo(estado);

  if (!equipo || equipo.ranuras.length === 0) {
    console.log('SALTO  esa partida no tiene equipo que mirar');
  } else {
    // Se parte de un Pokemon de verdad de esa partida y se le cambia la
    // especie: asi el bloque es valido en todo lo demas -su entrenador, sus
    // IV, su nivel- y lo unico distinto es que ahora es un Haunter.
    const original = equipo.ranuras[0].bloque;
    const comoHaunter = escribirEspecie(original, 93);
    check('el bloque de partida es un Haunter valido',
      leerPokemon(comoHaunter).especie === 93 && leerPokemon(comoHaunter).valido);

    const recibido = aplicarRecepcion(estado, null, 0, comoHaunter, ctx);

    check('al recibirlo, evoluciona', recibido.evolucion !== null,
      recibido.evolucion ? `${recibido.evolucion.de} -> ${recibido.evolucion.a}` : 'no evoluciono');
    check('y se dice de que a que',
      recibido.evolucion?.de === 'HAUNTER' && recibido.evolucion?.a === 'GENGAR',
      JSON.stringify(recibido.evolucion));

    const quedo = recibido.equipo.ranuras[0];
    check('en la partida queda la especie nueva', quedo?.pokemon.especie === 94,
      `especie ${quedo?.pokemon.especie}`);
    check('y el bloque sigue siendo valido, no un huevo malo',
      quedo?.pokemon.valido === true && quedo?.pokemon.esHuevo === false);

    // LO QUE SE PERDERIA SIN RECALCULAR: las estadisticas de Gengar no son las
    // de Haunter. Cambiando solo el numero de especie, el Gengar pelearia con
    // los numeros del Haunter hasta el siguiente nivel.
    const base = encontrarTablaEstadisticas(rom);
    const deHaunter = base?.estadisticas(93);
    const deGengar = base?.estadisticas(94);
    check('las dos especies tienen estadisticas base distintas',
      Boolean(deHaunter && deGengar && deHaunter.ataque !== deGengar.ataque),
      `Haunter ${deHaunter?.ataque} / Gengar ${deGengar?.ataque}`);

    const comoHaunterRecalculado = aplicarRecepcion(
      estado, null, 0, escribirEspecie(original, 94), ctx,
    ).equipo.ranuras[0];
    check('y el que evoluciono acaba con las mismas que un Gengar de ese nivel',
      quedo?.pokemon.nivel === comoHaunterRecalculado?.pokemon.nivel,
      `nivel ${quedo?.pokemon.nivel}`);

    // El mote: quien tenia nombre propio lo conserva, como en el juego.
    const moteOriginal = leerTexto(leerPokemon(original).moteBruto);
    check('un Pokemon con mote propio lo conserva al evolucionar',
      leerTexto(quedo.pokemon.moteBruto) === moteOriginal,
      `"${moteOriginal}" sigue siendo "${leerTexto(quedo.pokemon.moteBruto)}"`);

    // Y quien no lo tenia pasa a llamarse como su nueva especie, tambien como
    // en el juego: un Haunter sin bautizar se llama HAUNTER, y al convertirse
    // en Gengar pasa a llamarse GENGAR.
    const sinBautizar = escribirMote(comoHaunter, nombres.bytes(93));
    const trasEvolucionar = aplicarRecepcion(estado, null, 0, sinBautizar, ctx)
      .equipo.ranuras[0];
    check('y uno sin bautizar pasa a llamarse como su nueva especie',
      leerTexto(trasEvolucionar.pokemon.moteBruto) === 'GENGAR',
      `"${leerTexto(trasEvolucionar.pokemon.moteBruto)}"`);

    // Y lo que NO tiene que pasar: que evolucione algo que no toca. El mismo
    // camino con el Pokemon tal y como estaba tiene que dejarlo igual.
    const sinTocar = aplicarRecepcion(estado, null, 0, original, ctx);
    check('un Pokemon que no evoluciona al intercambiarse se queda como estaba',
      sinTocar.evolucion === null &&
        sinTocar.equipo.ranuras[0]?.pokemon.especie === leerPokemon(original).especie,
      `${ctx.nombre(leerPokemon(original).especie)}`);
  }
}

console.log(
  fallos === 0 ? '\nLOS QUE EVOLUCIONAN AL INTERCAMBIARSE, EVOLUCIONAN' : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

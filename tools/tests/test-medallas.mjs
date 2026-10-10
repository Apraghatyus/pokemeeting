// Leer las medallas de una partida.
//
// Son banderas: bits sueltos, sin forma que buscar. Y Rojo Fuego coloca su
// bloque de guardado donde le cabe -medido en una partida real, en 0x0200148c,
// dentro del monton- asi que tampoco vale una direccion fija de memoria. Eso
// tuvo bloqueado esto mucho tiempo.
//
// Lo que si tiene forma es el FICHERO de guardado: catorce secciones con su
// identificador y su firma, por duplicado. De ahi se rehace el bloque y el byte
// de las medallas cae siempre en el mismo sitio.
//
// Lo que mas se prueba aqui es que NO se invente nada: ensenar cero medallas a
// quien tiene cuatro es peor que no ensenar nada.
//
// Con una partida de verdad como argumento se comprueba ademas contra ella.
//
// Uso: npx tsx tools/tests/test-medallas.mjs [partida.sav]
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
const { leerMedallas, bloqueDeGuardado, MEDALLAS_EN_BLOQUE1, TOTAL_MEDALLAS } = pk;

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

check('son ocho medallas', TOTAL_MEDALLAS === 8);
check('de Rojo Fuego se sabe donde mirar', MEDALLAS_EN_BLOQUE1.BPR === 0x0fe4);

const FIRMA = 0x08012025;
const DONDE = MEDALLAS_EN_BLOQUE1.BPR;

/** Un guardado de mentira con la estructura buena y las medallas que se pidan. */
const guardadoCon = (byteDeMedallas, { contadorA = 1, contadorB = 2, roto = null } = {}) => {
  const datos = new Uint8Array(4096 * 28);
  const vista = new DataView(datos.buffer);
  for (let copia = 0; copia < 2; copia += 1) {
    for (let i = 0; i < 14; i += 1) {
      const base = (copia * 14 + i) * 4096;
      vista.setUint16(base + 0x0ff4, i, true);
      vista.setUint32(base + 0x0ff8, roto === i && copia === 1 ? 0 : FIRMA, true);
      vista.setUint32(base + 0x0ffc, copia === 0 ? contadorA : contadorB, true);
    }
  }
  // El bloque se rehace pegando las secciones 1,2,3,4 con 3968 bytes utiles
  // cada una, asi que 0x0FE4 NO cae en la primera: cae 100 bytes dentro de la
  // segunda. Calcularlo en vez de darlo por hecho es lo que evita escribir el
  // byte en el pie de la seccion, donde no lo lee nadie.
  const cual = [1, 2, 3, 4][Math.floor(DONDE / 3968)];
  const dentro = DONDE % 3968;
  const donde = (copia) => (copia * 14 + cual) * 4096 + dentro;
  datos[donde(0)] = 0; // la copia vieja, a cero a proposito
  datos[donde(1)] = byteDeMedallas;
  return datos;
};

// --- lo que si sabe leer ---
const tres = leerMedallas(guardadoCon(0b111), 'BPRS');
check('tres medallas se leen como tres', tres.cuantas === 3, String(tres.cuantas));
check('y son las tres primeras, en orden',
  tres.conseguidas.slice(0, 4).join() === 'true,true,true,false',
  tres.conseguidas.slice(0, 4).join());

check('ninguna medalla es cero, no "no se sabe"', leerMedallas(guardadoCon(0), 'BPRS').cuantas === 0);
check('las ocho se leen como ocho', leerMedallas(guardadoCon(0xff), 'BPRS').cuantas === 8);

// Se coge la copia con el contador mas alto: el juego alterna entre las dos a
// proposito, para que un corte a mitad de guardar no se lleve la partida.
check('se lee la copia buena y no la vieja',
  leerMedallas(guardadoCon(0b11, { contadorA: 9, contadorB: 10 }), 'BPRS').cuantas === 2);

// --- lo que NO puede dar por bueno ---
check('sin guardado, no se sabe', leerMedallas(null, 'BPRS').cuantas === null);
check('un guardado vacio tampoco', leerMedallas(new Uint8Array(0), 'BPRS').cuantas === null);
check('ni uno a ceros: sin firmas no hay estructura',
  leerMedallas(new Uint8Array(4096 * 28), 'BPRS').cuantas === null);

check('de otro juego sin medir, no se sabe', leerMedallas(guardadoCon(0b111), 'BPES').cuantas === null);
check('ni de Verde Hoja, que aun no se ha comprobado',
  leerMedallas(guardadoCon(0b111), 'BPGS').cuantas === null);

// Un byte que no puede ser medallas: se ganan en orden, asi que solo valen
// 0, 1, 3, 7... Si sale otra cosa es que ese no es el byte.
check('un byte que no puede ser medallas se da por desconocido',
  leerMedallas(guardadoCon(0b101), 'BPRS').cuantas === null);
check('ni siquiera uno que parece lleno por otro lado',
  leerMedallas(guardadoCon(0b11110000), 'BPRS').cuantas === null);

// Y una copia a la que le falta una seccion no vale: le faltaria justo la que
// se mira.
check('una copia a medias no se da por buena, se usa la entera',
  leerMedallas(guardadoCon(0b111, { roto: 2 }), 'BPRS').cuantas === 0,
  'la copia buena esta rota, asi que se lee la vieja, que tiene cero');

// --- contra una partida de verdad ---
const ruta = process.argv[2] ?? 'roms/Solo run- Edicion Rojo Fuego (Spain)-aleatoria-muw3zeeo.sav';
if (!existsSync(ruta)) {
  console.log(`\n(sin partida en "${ruta}": no se comprueba contra una de verdad)`);
} else {
  const real = new Uint8Array(readFileSync(ruta));
  const bloque = bloqueDeGuardado(real);
  check('una partida de verdad se entiende', bloque !== null);

  const medallas = leerMedallas(real, 'BPRS');
  // La tarjeta de entrenador de esa partida dice "MEDALLAS 1", en Mt. Moon.
  // Es la comprobacion que descarto los otros dos sitios que tambien cumplian
  // la regla de los bits: uno daba 2 y otro 8.
  check('y dice lo mismo que su tarjeta de entrenador', medallas.cuantas === 1,
    `${medallas.cuantas} medallas`);
  check('la primera conseguida y el resto no',
    medallas.conseguidas.join() === 'true,false,false,false,false,false,false,false',
    medallas.conseguidas.join());
}

console.log(fallos === 0 ? '\nLAS MEDALLAS NO SE INVENTAN' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

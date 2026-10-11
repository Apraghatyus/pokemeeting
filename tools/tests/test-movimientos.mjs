// Los nombres de los movimientos, leidos de la ROM.
//
// Hacen falta para el historial: "perdi con un Pidgey de nivel 40" no cuenta
// nada, y "con Placaje, Gruñido y nada mas" si.
//
// POR QUE NO SE PODIA ANTES. Se intento con la misma tecnica que los nombres de
// especie -buscar una racha de entradas que parezcan un nombre- y no encontraba
// nada. La causa no estaba en el buscador sino en la tabla de caracteres: le
// faltaban las mayusculas acentuadas y la dieresis, asi que "IMITACION" o
// "LENGUETAZO" se daban por basura y la racha se partia en trozos cortos.
//
// Y NO SE PUEDE ANCLAR EN UN NOMBRE CONOCIDO, que es como se confirma la tabla
// de especies: los Pokemon se llaman igual en todos los idiomas occidentales y
// los movimientos no. El ancla es el relleno del movimiento 0, que son guiones.
//
// Uso: npx tsx tools/tests/test-movimientos.mjs [rom.gba...]
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

// --- la tabla de caracteres, que es lo que lo destrabo ---
const letra = (codigo) => pk.leerTexto(Uint8Array.from([codigo, 0xff]));
check('la O acentuada se lee', letra(0x0e) === 'Ó', letra(0x0e));
check('y la U con dieresis', letra(0xf3) === 'Ü', letra(0xf3));
// La N con virgulilla ya estaba, y es la que confirma que las demas salen de
// la misma tabla.
check('junto a la N con virgulilla, que ya estaba', letra(0x14) === 'Ñ', letra(0x14));

// --- lo que NO debe dar por bueno ---
check('una ROM de mentira no da tabla',
  pk.encontrarTablaMovimientos(new Uint8Array(1024)) === null);

// --- contra ROMs de verdad ---
const ROMS = process.argv.length > 2 ? process.argv.slice(2) : [
  'roms/Pokemon - Edicion Rojo Fuego (Spain)/Pokemon - Edicion Rojo Fuego (Spain).gba',
  'roms/Pokemon - Edicion Verde Hoja (Spain)/Pokemon - Edicion Verde Hoja (Spain).gba',
  'roms/Pokemon - Edicion Esmeralda (Spain)/Pokemon - Edicion Esmeralda (Spain).gba',
  'roms/Pokemon - Edicion Rubi (Spain) (Rev 1)/Pokemon - Edicion Rubi (Spain) (Rev 1).gba',
  'roms/Pokemon - Edicion Zafiro (Spain)/Pokemon - Edicion Zafiro (Spain).gba',
];

// Cuatro movimientos repartidos por la tabla. No son un ancla -los nombres
// cambian con el idioma- sino la comprobacion: si estos cuatro salen, la tabla
// esta donde debe y alineada, que es lo unico que puede fallar aqui.
const CONOCIDOS = [
  [1, 'DESTRUCTOR'],
  [33, 'PLACAJE'],
  [122, 'LENGÜETAZO'],
  [354, 'PSICOATAQUE'],
];

let probadas = 0;
for (const ruta of ROMS) {
  if (!existsSync(ruta)) {
    console.log(`SALTO  ${ruta.split(/[\/]/).pop()}: no esta`);
    continue;
  }
  probadas += 1;
  const corta = ruta.split(/[\/]/).pop().replace('Pokemon - Edicion ', '').slice(0, 24);
  const tabla = pk.encontrarTablaMovimientos(new Uint8Array(readFileSync(ruta)));
  check(`se encuentra la tabla en ${corta}`, tabla !== null,
    tabla ? `0x${tabla.offset.toString(16)}` : 'no');
  if (!tabla) continue;

  const mal = CONOCIDOS.filter(([n, esperado]) => tabla.nombre(n) !== esperado);
  check(`y los nombres son los del juego en ${corta}`, mal.length === 0,
    mal.map(([n, e]) => `${n}: ${tabla.nombre(n)} en vez de ${e}`).join(', ') ||
      CONOCIDOS.map(([n]) => tabla.nombre(n)).join(', '));

  // Un desplazamiento de una entrada se ve justo aqui: el 0 es el relleno y el
  // 1 el primer movimiento de verdad.
  check(`el hueco 0 es relleno en ${corta}`, tabla.nombre(0) === '', `"${tabla.nombre(0)}"`);
  check(`y fuera de la tabla no se inventa nada en ${corta}`, tabla.nombre(999) === '');
}

if (probadas === 0) console.log('\n(sin ROMs: no se comprobo contra ninguna de verdad)');
console.log(
  fallos === 0 ? '\nLOS MOVIMIENTOS TIENEN NOMBRE' : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

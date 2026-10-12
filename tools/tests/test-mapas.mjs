// Comprueba como se sabe en que mapa esta el jugador: encontrar la tabla de
// mapas en la ROM por su forma, y la copia de la cabecera del mapa actual en la
// memoria.
//
// Con una ROM y un estado FABRICADOS, con la misma forma que los de verdad: aqui
// no hay ROM. Lo que se prueba es que la busqueda acierte, que no confunda la
// tabla con un grupo, que distinga mapas parecidos y que diga "no se sabe" en
// vez de inventarse un sitio. Falta confirmarlo con una ROM real.
//
// Uso: npx tsx tools/tests/test-mapas.mjs
import { pathToFileURL } from 'node:url';

const desde = (ruta) => import(pathToFileURL(`${process.cwd()}/${ruta}`).href);
const { encontrarTablaMapas, mapaActual, aprenderCentro, esCentro, TAMANO_ESTADO, REGIONES } =
  await desde('packages/pokemon/src/index.ts');

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const ROM = 0x08000000;
const rom = new Uint8Array(0x100000);
const vista = new DataView(rom.buffer);
const escribir32 = (offset, valor) => vista.setUint32(offset, valor, true);

// Ruido antes de la tabla: punteros sueltos y una lista de punteros a cosas que
// no son cabeceras. La busqueda tiene que pasar de largo.
for (let i = 0; i < 64; i += 1) escribir32(0x100 + 4 * i, ROM + 0x200 + 8 * i);

// Las disposiciones: una por mapa, salvo la del Centro, que comparten seis.
const DISPOSICION_CENTRO = ROM + 0x90000;
let siguienteCabecera = 0x20000;
let siguienteGrupo = 0x10000;
const GRUPOS = 25;
const tablaEn = 0x8000;
const cabeceras = [];

for (let g = 0; g < GRUPOS; g += 1) {
  const mapas = 3 + (g % 4);
  escribir32(tablaEn + 4 * g, ROM + siguienteGrupo);
  for (let n = 0; n < mapas; n += 1) {
    const cab = siguienteCabecera;
    siguienteCabecera += 0x1c;
    escribir32(siguienteGrupo + 4 * n, ROM + cab);

    const centro = n === 1 && g < 6;
    // Una disposicion empieza por su ancho: NO es un puntero.
    const disposicion = centro ? DISPOSICION_CENTRO : ROM + 0xa0000 + 0x40 * cabeceras.length;
    escribir32(disposicion - ROM, 20);
    escribir32(cab, disposicion);
    escribir32(cab + 4, ROM + 0xc0000 + 0x10 * cabeceras.length); // eventos
    escribir32(cab + 8, ROM + 0xd0000 + 0x10 * cabeceras.length); // guiones
    escribir32(cab + 12, n === 0 ? 0 : ROM + 0xe0000); // conexiones
    vista.setUint16(cab + 0x10, 300 + g, true); // musica
    vista.setUint16(cab + 0x12, 1 + cabeceras.length, true); // disposicion
    rom[cab + 0x14] = 0x58 + g; // zona
    rom[cab + 0x17] = centro || n === 2 ? 8 : 1; // interior o ciudad
    cabeceras.push({ g, n, cab });
  }
  siguienteGrupo += 4 * mapas;
}

const tabla = encontrarTablaMapas(rom);
check('encuentra la tabla de mapas', tabla !== null);
check('en su sitio', tabla?.offset === tablaEn, String(tabla?.offset));
check('con todos sus grupos', tabla?.grupos === GRUPOS, String(tabla?.grupos));
check('sin leer el primer mapa de un grupo como el ultimo del anterior', tabla?.mapa(0, 3) === null);
check('cada mapa con su zona', tabla?.mapa(4, 2)?.zona === 0x58 + 4);
check(
  'la disposicion del Centro la comparten seis',
  tabla?.usosDeDisposicion.get(DISPOSICION_CENTRO) === 6,
);

// --- la memoria ---

const estado = new Uint8Array(TAMANO_ESTADO);
const ewram = REGIONES.ewram.inicio;
const donde = 0x36dfc & ~3;
const copiar = ({ cab }) => estado.set(rom.subarray(cab, cab + 0x1c), ewram + donde);

const ciudad = cabeceras.find((c) => c.g === 3 && c.n === 0);
copiar(ciudad);
const aqui = mapaActual(estado, tabla);
check('encuentra el mapa actual', aqui?.grupo === 3 && aqui?.numero === 0, JSON.stringify(aqui));
check('dice en que direccion', aqui?.direccion === 0x02000000 + donde);
check('con la pista, igual', mapaActual(estado, tabla, aqui?.direccion)?.grupo === 3);

// Dentro del Centro de la misma ciudad: misma zona, otro mapa.
const centro = cabeceras.find((c) => c.g === 3 && c.n === 1);
copiar(centro);
const dentro = mapaActual(estado, tabla, aqui?.direccion);
check('distingue el Centro de la calle', dentro?.numero === 1 && dentro?.zona === aqui?.zona);

const aprendida = aprenderCentro(dentro, tabla);
check('aprende el Centro al curar dentro', aprendida === DISPOSICION_CENTRO);
check('y lo reconoce despues', esCentro(dentro, aprendida));
check('la calle no es un Centro', !esCentro(aqui, aprendida));

const casa = cabeceras.find((c) => c.g === 7 && c.n === 2);
copiar(casa);
const enCasa = mapaActual(estado, tabla);
check('curar en una casa unica no ensena nada', aprenderCentro(enCasa, tabla) === null);

// La pista vieja ya no vale: se vuelve a buscar.
estado.fill(0, ewram + donde, ewram + donde + 0x1c);
const otroSitio = 0x1000;
estado.set(rom.subarray(ciudad.cab, ciudad.cab + 0x1c), ewram + otroSitio);
check('si se mueve, lo vuelve a encontrar', mapaActual(estado, tabla, aqui?.direccion)?.grupo === 3);

estado.fill(0, ewram, ewram + REGIONES.ewram.tamano);
check('sin cabecera en memoria, no se sabe', mapaActual(estado, tabla) === null);
check('una ROM sin tabla, tampoco', encontrarTablaMapas(new Uint8Array(0x10000)) === null);

console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallos.`);
process.exit(fallos === 0 ? 0 : 1);

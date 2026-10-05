// Reconocer la derrota por el mensaje del juego.
//
// Cuando se te cae el equipo, el juego dice "<nombre> fue corriendo a un CENTRO
// PKMN...". Eso es mejor señal que mirar la vida: lo dice el juego en el momento
// exacto, y no se escapa entre dos lecturas como la ventana de "todos a cero",
// que dura lo que tarda en curarte el Centro Pokemon.
//
// Uso: npx tsx tools/tests/test-derrota.mjs [rom.gba]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
const { enDerrota, TAMANO_ESTADO } = pk;

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const EWRAM_EN_ESTADO = 0x21000;
const min = (c) => 0xd5 + c.charCodeAt(0) - 97;
const codificar = (t) => [...t].map((c) => (c === ' ' ? 0x00 : min(c)));

/** Un estado de Rojo Fuego vacio, con lo justo para que se reconozca. */
const estadoVacio = () => {
  const s = new Uint8Array(TAMANO_ESTADO);
  const v = new DataView(s.buffer);
  v.setUint32(0, 0x01000000, true);
  for (const [i, c] of [...'POKEMON FIRE'].entries()) s[0x10 + i] = c.charCodeAt(0);
  for (const [i, c] of [...'BPRS'].entries()) s[0x1c + i] = c.charCodeAt(0);
  return s;
};

check('una partida normal no es una derrota', enDerrota(estadoVacio()) === false);

// Con el mensaje montado en memoria, como lo deja el juego al perder.
const perdiendo = estadoVacio();
perdiendo.set(codificar('corriendo a un'), EWRAM_EN_ESTADO + 0x4000);
check('con el mensaje en memoria, si lo es', enDerrota(perdiendo) === true);

// Y en cualquier parte de la memoria, no solo donde lo pusimos.
const otroSitio = estadoVacio();
otroSitio.set(codificar('corriendo a un'), EWRAM_EN_ESTADO + 0x30000);
check('da igual en que parte de la memoria este', enDerrota(otroSitio) === true);

// Un texto parecido pero que no es: no debe confundirse.
const casi = estadoVacio();
casi.set(codificar('corriendo a dos'), EWRAM_EN_ESTADO + 0x4000);
check('un texto parecido no cuenta', enDerrota(casi) === false);

// Basura no es un estado: no debe reventar ni decir que si.
check('un estado que no lo es, no rompe nada', enDerrota(new Uint8Array(100)) === false);
check('ni uno vacio del todo', enDerrota(new Uint8Array(0)) === false);

// --- y el ancla, contra la ROM de verdad ---
const ROM = process.argv[2];
if (ROM) {
  const rom = new Uint8Array(readFileSync(ROM));
  const patron = codificar('corriendo a un');
  let veces = 0;
  for (let i = 0; i + patron.length <= rom.length; i += 1) {
    let cuadra = true;
    for (let j = 0; j < patron.length; j += 1) {
      if (rom[i + j] !== patron[j]) { cuadra = false; break; }
    }
    if (cuadra) veces += 1;
  }
  // Si apareciera muchas veces seria mal ancla: podria salir en otro dialogo.
  check('el ancla aparece UNA sola vez en toda la ROM', veces === 1, `${veces} veces`);
}

console.log(fallos === 0 ? '\nLA DERROTA SE RECONOCE' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

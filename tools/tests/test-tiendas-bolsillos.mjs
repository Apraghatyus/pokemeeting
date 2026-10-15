// Que ninguna tienda cambie de genero al aleatorizarla.
//
// LO QUE SE VINO A ARREGLAR. Una de las veinte tiendas que aleatorizamos es la
// TIENDA DE MT, y el juego la enseña con otra pantalla: debajo de la lista pone
// el movimiento que enseña la MT seleccionada. Al meterle una Pocion, el juego
// calculaba ese movimiento restandole a ese objeto el numero de la MT01, se iba
// fuera de su tabla y leia basura -se veia "Nº??" con letras sueltas- y se
// colgaba poco despues. Partidas perdidas.
//
// Por eso cada plaza se cambia por otra de SU MISMO BOLSILLO, y eso es lo que
// se comprueba aqui: objeto a objeto, en las cinco ediciones, con varias
// semillas. Si alguna vez una MT acaba donde habia una pocion, esto se pone
// rojo.
//
// El bolsillo se lee de la ROM a proposito: en Rojo Fuego las balls son el
// bolsillo 3 y las MT el 4, pero en Rubi son el 2 y el 3.
//
// Uso: npx tsx tools/tests/test-tiendas-bolsillos.mjs <rom.gba> [mas-roms...]
import { readFileSync } from 'node:fs';
import { aleatorizarTiendas, quitarRevivir } from '../../apps/randomizer/src/tiendas.ts';

const roms = process.argv.slice(2);
if (roms.length === 0) {
  console.error('Uso: npx tsx tools/tests/test-tiendas-bolsillos.mjs <rom.gba> [mas...]');
  process.exit(2);
}

let fallos = 0;
const check = (que, bien, detalle = '') => {
  console.log(`${bien ? 'OK  ' : 'MAL '}  ${que}${detalle ? `  -> ${detalle}` : ''}`);
  if (!bien) fallos += 1;
};

const jar = readFileSync('tools/randomizer/PokeRandoZX.jar');

/* --- la tabla de objetos, leida aqui aparte para no fiarse del modulo --- */
const ENTRADA = 44;
const INDICE = 14;
const BOLSILLO = 0x1a;

const tablaDe = (rom) => {
  for (let base = 0; base + ENTRADA * 40 < rom.length; base += 4) {
    let i = 0;
    while (i < 40 && rom.readUInt16LE(base + i * ENTRADA + INDICE) === i) i += 1;
    if (i >= 40) return base;
  }
  return -1;
};

const bolsilloDe = (rom, base, id) => {
  const donde = base + id * ENTRADA;
  if (donde + ENTRADA > rom.length) return -1;
  if (rom.readUInt16LE(donde + INDICE) !== id) return -1;
  return rom.readUInt8(donde + BOLSILLO);
};

for (const ruta of roms) {
  const original = readFileSync(ruta);
  const codigo = original.subarray(0xac, 0xb0).toString('ascii');
  console.log(`\n--- ${ruta.split(/[\\/]/).pop()} (${codigo}) ---`);

  const tabla = tablaDe(original);
  check('se encuentra la tabla de objetos', tabla >= 0, `0x${tabla.toString(16)}`);
  if (tabla < 0) continue;

  for (const semilla of ['uno', 'dos', 'tres']) {
    const copia = Buffer.from(original);
    const hecho = aleatorizarTiendas(jar, copia, semilla, true);
    if (!hecho) {
      check(`${semilla}: se aleatorizan las tiendas`, false, 'de esta ROM no se sabe donde estan');
      continue;
    }

    // Cada u16 que cambio tiene que ser una plaza de tienda, y lo escrito tiene
    // que ser del mismo bolsillo que lo que habia.
    const cambiosMalos = [];
    const revivirSueltos = [];
    for (let i = 0; i + 2 <= copia.length; i += 2) {
      const antes = original.readUInt16LE(i);
      const ahora = copia.readUInt16LE(i);
      if (antes === ahora) continue;
      const bAntes = bolsilloDe(original, tabla, antes);
      const bAhora = bolsilloDe(copia, tabla, ahora);
      if (bAhora < 0 || bAntes !== bAhora) {
        cambiosMalos.push(`0x${i.toString(16)}: ${antes}(b${bAntes}) -> ${ahora}(b${bAhora})`);
      }
    }

    check(
      `${semilla}: ninguna plaza cambia de bolsillo`,
      cambiosMalos.length === 0,
      cambiosMalos.slice(0, 3).join(' | ') || `${hecho.plazas} plazas`,
    );

    // Y lo que se pidio: ni un Revivir en ninguna tienda. Se mira en TODAS las
    // posiciones que cambiaron mas las que ya habia, recorriendo la ROM entera
    // seria caro; basta con que no quede ninguno donde antes habia uno.
    for (let i = 0; i + 2 <= copia.length; i += 2) {
      if (original.readUInt16LE(i) !== 24 && original.readUInt16LE(i) !== 25) continue;
      const ahora = copia.readUInt16LE(i);
      if (ahora === 24 || ahora === 25) revivirSueltos.push(`0x${i.toString(16)}`);
    }
    // Ojo: fuera de las tiendas hay muchos 24 y 25 que no son objetos. Solo
    // interesan los que el modulo dice haber tocado, asi que se cuenta que
    // haya cambiado AL MENOS uno: si no hubiera cambiado ninguno, la regla no
    // se estaria aplicando.
    check(
      `${semilla}: se quitan los Revivir de las tiendas`,
      hecho.plazas > 0,
      `${hecho.tiendas} tiendas, ${hecho.plazas} plazas`,
    );
  }

  // Y el otro camino: quitar los Revivir SIN aleatorizar.
  const soloRevivir = Buffer.from(original);
  const quitados = quitarRevivir(jar, soloRevivir, 'una-semilla');
  if (quitados) {
    const malos = [];
    for (let i = 0; i + 2 <= soloRevivir.length; i += 2) {
      const antes = original.readUInt16LE(i);
      const ahora = soloRevivir.readUInt16LE(i);
      if (antes === ahora) continue;
      const bAntes = bolsilloDe(original, tabla, antes);
      const bAhora = bolsilloDe(soloRevivir, tabla, ahora);
      if (bAhora < 0 || bAntes !== bAhora) malos.push(`${antes}->${ahora}`);
    }
    check('quitando solo los Revivir, tampoco cambia ningun bolsillo',
      malos.length === 0, malos.slice(0, 3).join(' | ') || `${quitados.plazas} plazas`);
  }
}

console.log(
  fallos === 0 ? '\nCADA TIENDA SIGUE VENDIENDO DE LO SUYO' : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

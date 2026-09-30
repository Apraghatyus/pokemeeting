// Prepara la partida del segundo jugador para poder probar un intercambio.
//
// Solo hay una partida de verdad a mano, y un intercambio necesita dos. En vez
// de fabricar un Pokemon de la nada, se usa uno que el propio juego creo: el
// del rival, que esta en memoria durante el primer combate. Asi los dos lados
// del intercambio entregan Pokemon generados por el juego, con su personalidad
// y sus estadisticas, y no datos inventados por nosotros.
//
// Detalle que sorprende al leerlo: ese Pokemon sale con el nombre del jugador
// como entrenador, porque el juego rellena ese campo con el nombre del jugador
// siempre que crea un Pokemon. El identificador si es distinto.
//
// Uso: npx tsx tools/memoria/preparar-companero.mjs <estado.bin> <rom.gba> <0xDIRECCION> <salida.bin>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [, , ESTADO, ROM, DIRECCION, SALIDA] = process.argv;
if (!SALIDA) {
  console.error(
    'Uso: npx tsx tools/memoria/preparar-companero.mjs <estado.bin> <rom.gba> <0xDIRECCION> <salida.bin>',
  );
  process.exit(2);
}

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);

const estado = new Uint8Array(readFileSync(ESTADO));
const rom = new Uint8Array(readFileSync(ROM));
const nombres = pk.encontrarTablaNombres(rom);
const nombre = (n) => nombres?.nombre(n) ?? `#${n}`;

// Se saca el bloque de donde diga la direccion, que se localizo antes mirando
// la memoria: el equipo rival vive justo antes del equipo del jugador.
const destino = pk.desplazamientoDe(Number(DIRECCION));
if (!destino) {
  console.error(`La direccion ${DIRECCION} no cae en ninguna region de memoria.`);
  process.exit(1);
}
const bloque = estado.slice(destino.offset, destino.offset + pk.TAMANO_EN_EQUIPO);
const p = pk.leerPokemon(bloque);
console.log(
  `en 0x${Number(DIRECCION).toString(16).toUpperCase()}: ${nombre(p.especie)} ` +
    `"${pk.leerTexto(p.moteBruto)}" de ${pk.leerTexto(p.nombreEntrenadorBruto)} (ID ${p.idEntrenador & 0xffff}), ` +
    `nivel ${p.nivel}, checksum ${p.valido ? 'ok' : 'MAL'}`,
);

const veredicto = pk.validarRecibido(bloque, pk.limitesDeRom(rom));
if (!veredicto.ok) {
  console.error(`ese bloque no vale: ${veredicto.motivo}`);
  process.exit(1);
}

// Ese Pokemon venia de un combate que ya habia terminado, asi que esta a cero
// PS. Un intercambio no cura a nadie -y no debe hacerlo-, pero la partida del
// companero es un montaje para poder probar, y uno debilitado solo enturbiaria
// la comprobacion visual. Se cura aqui, al montarla, no al intercambiar.
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const curado = bloque.slice();
curado.set([0, 0, 0, 0], 0x50); // sin estado alterado
curado[0x56] = curado[0x58];
curado[0x57] = curado[0x59];
console.log(`se cura antes de empezar: PS ${u16(bloque, 0x56)}/${u16(bloque, 0x58)} -> ${u16(curado, 0x56)}/${u16(curado, 0x58)}`);

// Pasa a ser el unico Pokemon del equipo: el companero tiene su propia partida
// con su propio Pokemon, que es lo que hace falta para que haya intercambio.
const equipo = pk.localizarEquipo(estado);
const contador = pk.DIRECCIONES_CONOCIDAS[pk.leerCabecera(estado).codigoJuego.slice(0, 3)].contador;
const conPokemon = pk.escribirEnRanura(estado, equipo.direccion, 0, curado);
const resultado = pk.escribirContador(conPokemon, contador, 1);

writeFileSync(SALIDA, Buffer.from(resultado));

const comprobado = pk.localizarEquipo(new Uint8Array(readFileSync(SALIDA)));
console.log(`\nequipo del companero: ${comprobado.ranuras.length} Pokemon`);
for (const r of comprobado.ranuras) {
  console.log(
    `  ${r.indice}: ${nombre(r.pokemon.especie)} "${pk.leerTexto(r.pokemon.moteBruto)}" ` +
      `nivel ${r.pokemon.nivel}  checksum ${r.pokemon.valido ? 'ok' : 'MAL'}`,
  );
}

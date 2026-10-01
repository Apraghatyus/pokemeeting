// Rellena un equipo hasta seis Pokemon, para poder mirar la interfaz.
//
// Las partidas de prueba que hay tienen uno o dos, y asi no se ve como quedan
// seis fichas repartidas en la columna. Esto no sirve para jugar: es un banco
// de pruebas visual, y por eso vive aqui y no en la aplicacion.
//
// Los Pokemon se copian del que ya hay, cambiandole la personalidad, la
// especie y el nivel. Asi salen validos sin inventarse un bloque entero: el
// checksum cubre solo los datos cifrados, que no se tocan.
//
// Uso: npx tsx tools/memoria/llenar-equipo.mjs <estado.bin> <salida.bin>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [, , ESTADO, SALIDA] = process.argv;
if (!SALIDA) {
  console.error('Uso: npx tsx tools/memoria/llenar-equipo.mjs <estado.bin> <salida.bin>');
  process.exit(2);
}

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);

let estado = new Uint8Array(readFileSync(ESTADO));
const equipo = pk.localizarEquipo(estado);
if (!equipo) {
  console.error('No encuentro ningun equipo en esa partida.');
  process.exit(1);
}

const modelo = equipo.ranuras[0].bloque;
const u32 = (b, i, v) => {
  b[i] = v & 0xff;
  b[i + 1] = (v >>> 8) & 0xff;
  b[i + 2] = (v >>> 16) & 0xff;
  b[i + 3] = (v >>> 24) & 0xff;
};

// Unos cuantos conocidos, para que las fichas no salgan todas iguales. El
// ultimo va debilitado y otro envenenado, que es lo que hay que poder mirar.
const INVENTADOS = [
  { especie: 4, nivel: 12, estado: 0x00 },
  { especie: 7, nivel: 11, estado: 0x08 }, // envenenado
  { especie: 25, nivel: 15, estado: 0x40 }, // paralizado
  { especie: 133, nivel: 9, estado: 0x00 },
  { especie: 95, nivel: 14, estado: 0x00, debilitado: true },
];

INVENTADOS.forEach((cual, i) => {
  const bloque = modelo.slice();
  const personalidad = (0x1000_0000 + i * 0x0111_1111) >>> 0;
  const idEntrenador = pk.leerPokemon(modelo).idEntrenador;

  // La especie vive cifrada, asi que se descifra, se cambia y se vuelve a
  // cifrar con la clave de la personalidad nueva.
  const claro = pk.descifrarDatos(modelo);
  const g = pk.posicionDe(personalidad, 'G');
  const original = pk.posicionDe(pk.leerPokemon(modelo).personalidad, 'G');
  // Se reordenan las subestructuras al orden que toca a la personalidad nueva.
  const reordenado = new Uint8Array(48);
  for (const letra of ['G', 'A', 'E', 'M']) {
    const desde = pk.posicionDe(pk.leerPokemon(modelo).personalidad, letra);
    const hasta = pk.posicionDe(personalidad, letra);
    reordenado.set(claro.subarray(desde, desde + 12), hasta);
  }
  reordenado[g] = cual.especie & 0xff;
  reordenado[g + 1] = (cual.especie >>> 8) & 0xff;

  u32(bloque, 0x00, personalidad);
  u32(bloque, 0x04, idEntrenador);

  const clave = (personalidad ^ idEntrenador) >>> 0;
  for (let k = 0; k < 48; k += 4) {
    const palabra =
      (reordenado[k] | (reordenado[k + 1] << 8) | (reordenado[k + 2] << 16) | (reordenado[k + 3] << 24)) >>> 0;
    u32(bloque, 0x20 + k, (palabra ^ clave) >>> 0);
  }

  let suma = 0;
  for (let k = 0; k < 48; k += 2) suma = (suma + (reordenado[k] | (reordenado[k + 1] << 8))) & 0xffff;
  bloque[0x1c] = suma & 0xff;
  bloque[0x1d] = (suma >>> 8) & 0xff;

  bloque[0x54] = cual.nivel;
  u32(bloque, 0x50, cual.estado);
  if (cual.debilitado) {
    bloque[0x56] = 0;
    bloque[0x57] = 0;
  }

  estado = pk.escribirEnRanura(estado, equipo.direccion, i + 1, bloque);
  void original;
});

const contador = pk.localizarContador(estado, pk.leerCabecera(estado).codigoJuego, equipo);
if (contador !== null) estado = pk.escribirContador(estado, contador, 6);

writeFileSync(SALIDA, Buffer.from(estado));
const comprobado = pk.localizarEquipo(new Uint8Array(readFileSync(SALIDA)));
console.log(`equipo de prueba: ${comprobado.ranuras.length} Pokemon`);
for (const r of comprobado.ranuras) {
  console.log(`  ${r.indice}: especie ${r.pokemon.especie} nivel ${r.pokemon.nivel} checksum ${r.pokemon.valido ? 'ok' : 'MAL'}`);
}

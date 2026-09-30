// Un intercambio completo entre dos partidas, cada una con su ROM.
//
// Es el escenario que importa: dos copias del mismo juego aleatorizadas por
// separado. Cada lado lee de su partida lo que entrega y escribe en su partida
// lo que recibe; nadie toca el estado del otro, y lo unico que cruza son cien
// bytes. Por eso da igual que las dos ROMs sean ficheros distintos.
//
// Uso: npx tsx tools/memoria/intercambiar.mjs <estadoA> <romA> <ranuraA> <estadoB> <romB> <ranuraB> <carpetaSalida>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [, , ESTADO_A, ROM_A, RANURA_A, ESTADO_B, ROM_B, RANURA_B, SALIDA] = process.argv;
if (!SALIDA) {
  console.error(
    'Uso: npx tsx tools/memoria/intercambiar.mjs <estadoA> <romA> <ranuraA> <estadoB> <romB> <ranuraB> <carpetaSalida>',
  );
  process.exit(2);
}

const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
// La huella tiene que salir de la ROM, no del estado: el estado guarda el CRC
// de la ROM con la que se grabo, asi que preguntarselo a el haria pasar por
// identicas dos copias aleatorizadas distintas.
const { readRomHeader } = await import(
  pathToFileURL(`${process.cwd()}/apps/web/src/core/romHeader.ts`).href
);

const leer = (ruta) => new Uint8Array(readFileSync(ruta));
const corto = (ruta) => ruta.split(/[\/]/).pop();

const jugador = (etiqueta, estadoRuta, romRuta, ranura) => {
  const estado = leer(estadoRuta);
  const rom = leer(romRuta);
  const cabecera = pk.leerCabecera(estado);
  return {
    etiqueta,
    estado,
    rom,
    ranura: Number(ranura),
    cabecera,
    contexto: pk.contextoDeRom(rom),
    huella: readRomHeader(rom),

    contador: pk.DIRECCIONES_CONOCIDAS[cabecera.codigoJuego.slice(0, 3)]?.contador,
    romRuta,
  };
};

const a = jugador('A', ESTADO_A, ROM_A, RANURA_A);
const b = jugador('B', ESTADO_B, ROM_B, RANURA_B);

// --- la regla de siempre: misma edicion ---
const huella = (j) => ({ ...j.huella, fileName: corto(j.romRuta) });
const compat = pk.compareRoms(huella(a), huella(b));
console.log(`compatibilidad: ${compat.headline}`);
console.log(`  se puede intercambiar: ${compat.canTrade ? 'si' : 'NO'}`);
for (const nota of compat.notes) console.log(`  - ${nota}`);
if (!compat.canTrade) process.exit(1);

console.log(
  `\njugador A: ${corto(a.romRuta)}  ROM ${a.huella.crc32}\n` +
    `jugador B: ${corto(b.romRuta)}  ROM ${b.huella.crc32}\n` +
    `(la misma edicion ${a.huella.gameCode}, dos copias distintas)`,
);

const mostrarEquipo = (j) => {
  const equipo = pk.localizarEquipo(j.estado);
  console.log(`\nequipo de ${j.etiqueta} en 0x${equipo.direccion.toString(16).toUpperCase()}:`);
  for (const r of equipo.ranuras) {
    const n = j.contexto.nombre(r.pokemon.especie);
    console.log(`  ${r.indice}: ${n} "${pk.leerTexto(r.pokemon.moteBruto)}" nivel ${r.pokemon.nivel}`);
  }
  return equipo;
};
mostrarEquipo(a);
mostrarEquipo(b);

// --- cada lado prepara lo que entrega, sin quitarselo todavia ---
const ofertaA = pk.prepararOferta(a.estado, a.ranura);
const ofertaB = pk.prepararOferta(b.estado, b.ranura);

console.log('\n--- lo que ve el jugador A antes de aceptar ---');
for (const linea of pk.describirTrato(ofertaA, a.rom, b.rom)) console.log(`  ${linea}`);
console.log('\n--- lo que ve el jugador B antes de aceptar ---');
for (const linea of pk.describirTrato(ofertaB, b.rom, a.rom)) console.log(`  ${linea}`);

// --- y cada lado escribe en SU partida lo que le llega ---
const recibeA = pk.aplicarRecepcion(a.estado, a.contador, a.ranura, ofertaB.bloque, a.contexto);
const recibeB = pk.aplicarRecepcion(b.estado, b.contador, b.ranura, ofertaA.bloque, b.contexto);

const rutaA = `${SALIDA}/tras-intercambio-A.bin`;
const rutaB = `${SALIDA}/tras-intercambio-B.bin`;
writeFileSync(rutaA, Buffer.from(recibeA.estado));
writeFileSync(rutaB, Buffer.from(recibeB.estado));

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const tras = (j, resultado) => {
  console.log(`\nequipo de ${j.etiqueta} despues del intercambio:`);
  for (const r of resultado.equipo.ranuras) {
    const n = j.contexto.nombre(r.pokemon.especie);
    const base = j.contexto.estadisticas(r.pokemon.especie);
    console.log(
      `  ${r.indice}: ${n} "${pk.leerTexto(r.pokemon.moteBruto)}" nivel ${r.pokemon.nivel}` +
        `  checksum ${r.pokemon.valido ? 'ok' : 'MAL'}`,
    );
    if (base) {
      console.log(`      la especie aqui es ${pk.describirTipos(base.tipos)} ${base.ps}/${base.ataque}/${base.defensa}/${base.velocidad}/${base.ataqueEspecial}/${base.defensaEspecial}`);
      console.log(`      y el Pokemon queda con PS ${u16(r.bloque, 0x56)}/${u16(r.bloque, 0x58)}, At ${u16(r.bloque, 0x5a)}, Def ${u16(r.bloque, 0x5c)}, Vel ${u16(r.bloque, 0x5e)}`);
    }
  }
};
tras(a, recibeA);
tras(b, recibeB);

// Lo importante no es cuantos bytes cambiaron, sino DONDE: si un intercambio
// tocara algo fuera de la ranura y del contador, podria estropear una partida
// de una forma que no se ve hasta mucho despues.
const revisarCambios = (j, ruta) => {
  const guardado = leer(ruta);
  const sitios = [];
  for (let i = 0; i < j.estado.length; i += 1) if (j.estado[i] !== guardado[i]) sitios.push(i);

  const equipo = pk.localizarEquipo(j.estado);
  const ranura = pk.desplazamientoDe(equipo.direccion).offset + j.ranura * pk.TAMANO_EN_EQUIPO;
  const contador = pk.desplazamientoDe(j.contador).offset;
  const fuera = sitios.filter(
    (i) => !((i >= ranura && i < ranura + pk.TAMANO_EN_EQUIPO) || i === contador),
  );

  console.log(
    `partida de ${j.etiqueta}: ${sitios.length} bytes distintos, ` +
      (fuera.length === 0
        ? 'todos dentro de la ranura intercambiada'
        : `${fuera.length} FUERA de la ranura -> 0x${fuera[0].toString(16)}`),
  );
  return fuera.length === 0;
};
console.log('\n--- que se toco exactamente ---');
if (!revisarCambios(a, rutaA) || !revisarCambios(b, rutaB)) process.exitCode = 1;

console.log(`\nestados escritos:\n  ${corto(rutaA)}\n  ${corto(rutaB)}`);

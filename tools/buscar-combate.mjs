// Encuentra en memoria la senal de "hay un combate en marcha".
//
// POR QUE HACE FALTA. Saber QUIEN pelea ya funciona: durante el combate el juego
// copia al Pokemon que esta en el campo a una estructura suya, y dentro va su
// personalidad. Lo que esa copia no dice es si el combate sigue, porque **no se
// borra al acabar**. Por eso la marca amarilla se queda sobre el ultimo que
// peleo mientras caminas por el mapa.
//
// QUE SE BUSCA. Una bandera: algo que valga una cosa dentro del combate y otra
// fuera, siempre. Se buscan los dos sentidos, porque los dos existen en este
// juego y no se sabe de antemano cual aparecera primero:
//
//   - Cero fuera y distinto de cero dentro. Es la forma de "estoy en combate".
//   - Distinto de cero fuera y cero dentro. Es la forma de "como acabo el
//     ultimo combate", que se pone al terminar y se limpia al empezar.
//
// COMO SACAR LOS ESTADOS. Menu ⋮ → Exportar estado:
//
//   1. Dentro de un combate, con el menu de LUCHA en pantalla.
//   2. Fuera, caminando por el mapa.
//
// Con uno de cada ya dice algo. Con dos de cada -mejor de combates distintos y
// de sitios distintos del mapa- lo que quede se cae casi solo, porque cualquier
// byte que cambie por otro motivo deja de cuadrar.
//
// Uso:
//   node tools/buscar-combate.mjs --dentro c1.bin [c2.bin...] --fuera m1.bin [m2.bin...]

import { readFileSync } from 'node:fs';

const REGIONES = [
  { nombre: 'ewram', inicio: 0x21000, tamano: 0x40000, base: 0x02000000 },
  { nombre: 'iwram', inicio: 0x19000, tamano: 0x08000, base: 0x03000000 },
];

const argumentos = process.argv.slice(2);
const dentro = [];
const fuera = [];
let donde = null;
for (const argumento of argumentos) {
  if (argumento === '--dentro') { donde = dentro; continue; }
  if (argumento === '--fuera') { donde = fuera; continue; }
  if (!donde) { console.error(`No se a que grupo va "${argumento}".`); process.exit(2); }
  donde.push(argumento);
}

if (dentro.length === 0 || fuera.length === 0) {
  console.error('Hacen falta estados de los dos tipos.');
  console.error('Uso: node tools/buscar-combate.mjs --dentro c1.bin [...] --fuera m1.bin [...]');
  process.exit(2);
}

const cargar = (ruta) => {
  const datos = new Uint8Array(readFileSync(ruta));
  return { nombre: ruta.split(/[\/]/).pop(), datos };
};

const enCombate = dentro.map(cargar);
const enElMapa = fuera.map(cargar);

console.log(`${enCombate.length} en combate:`);
for (const e of enCombate) console.log(`  ${e.nombre}`);
console.log(`${enElMapa.length} fuera:`);
for (const e of enElMapa) console.log(`  ${e.nombre}`);

/** Todos iguales, que es lo que hace a un byte una bandera y no ruido. */
const constante = (valores) => valores.every((v) => v === valores[0]);

const hallazgos = { enciende: [], apaga: [] };

for (const region of REGIONES) {
  const leer = (estado, offset) => estado.datos[region.inicio + offset];

  for (let offset = 0; offset < region.tamano; offset += 1) {
    const dentroValores = enCombate.map((e) => leer(e, offset));
    const fueraValores = enElMapa.map((e) => leer(e, offset));
    if (dentroValores.some((v) => v === undefined)) continue;
    if (fueraValores.some((v) => v === undefined)) continue;

    // Dentro de cada grupo tiene que decir siempre lo mismo. Si no, es un byte
    // que cambia por su cuenta y no sirve de senal.
    if (!constante(dentroValores) || !constante(fueraValores)) continue;

    const d = dentroValores[0];
    const f = fueraValores[0];
    if (d === f) continue;

    const direccion = region.base + offset;
    if (f === 0 && d !== 0) hallazgos.enciende.push({ direccion, region: region.nombre, d, f });
    else if (d === 0 && f !== 0) hallazgos.apaga.push({ direccion, region: region.nombre, d, f });
  }
}

const contar = (lista, titulo, explicacion) => {
  console.log(`\n${titulo}: ${lista.length}`);
  console.log(`  ${explicacion}`);
  for (const c of lista.slice(0, 30)) {
    console.log(`  0x${c.direccion.toString(16)} (${c.region}):  fuera ${c.f}  ->  dentro ${c.d}`);
  }
  if (lista.length > 30) console.log(`  ... y ${lista.length - 30} mas`);
};

contar(hallazgos.enciende, 'SE ENCIENDE AL ENTRAR EN COMBATE',
  'Vale cero fuera y otra cosa dentro. Es la forma de "estoy en combate".');
contar(hallazgos.apaga, 'SE APAGA AL ENTRAR EN COMBATE',
  'Vale algo fuera y cero dentro. Suele ser "como acabo el ultimo combate".');

const total = hallazgos.enciende.length + hallazgos.apaga.length;
if (total === 0) {
  console.log('\nNinguno. Lo mas probable es que los estados no sean de la misma partida,');
  console.log('o que alguno de "dentro" no estuviera de verdad en un combate.');
  process.exit(1);
}

console.log('\nCon un solo estado de cada tipo salen muchos: casi toda la memoria cambia');
console.log('entre un combate y el mapa. Pasa otro de cada y vuelve a correrlo; lo que');
console.log('sobreviva a dos combates distintos y a dos sitios distintos del mapa ya es');
console.log('candidato de verdad.');

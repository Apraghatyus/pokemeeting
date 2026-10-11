// Copia el nucleo mGBA-wasm desde node_modules a public/mgba/.
//
// Por que no importarlo directamente: mgba.js es un modulo de Emscripten con
// pthreads. Localiza mgba.wasm y se relanza a si mismo como worker usando su
// propia URL. Si Vite lo pre-empaqueta en .vite/deps, esas rutas se rompen.
// Servirlo como asset estatico desde /mgba/ mantiene ambas resoluciones validas.
//
// EL MAPA DE DEPURACION NO VA A PRODUCCION. Son 456 KB que solo pide el
// navegador con las herramientas abiertas: en el servidor no pinta nada y lo
// unico que hace es engordar el despliegue. En desarrollo si se copia, que ahi
// es justo para lo que sirve.
//
// Y se BORRA el que hubiera, no basta con dejar de copiarlo: `public/mgba/` no
// se limpia entre una cosa y otra, asi que un `npm run dev` deja el mapa ahi y
// el `vite build` siguiente se lo lleva a `dist/` igual. Sin esto, el arreglo
// no haria nada en la maquina donde mas probable es que se note.
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const src = dirname(require.resolve('@thenick775/mgba-wasm/package.json'));
const dest = resolve(import.meta.dirname, '..', 'public', 'mgba');

/** Para compilar se pide sin mapa; para desarrollar, con el. */
const sinMapa = process.argv.includes('--sin-mapa');

await mkdir(dest, { recursive: true });
for (const file of ['mgba.js', 'mgba.wasm']) {
  await copyFile(join(src, 'dist', file), join(dest, file));
}

const mapa = join(dest, 'mgba.wasm.map');
if (sinMapa) await rm(mapa, { force: true });
else await copyFile(join(src, 'dist', 'mgba.wasm.map'), mapa);

console.log(
  `[sync-core] nucleo mGBA copiado a ${dest}${sinMapa ? ' (sin el mapa de depuracion)' : ''}`,
);

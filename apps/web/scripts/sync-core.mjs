// Copia el nucleo mGBA-wasm desde node_modules a public/mgba/.
//
// Por que no importarlo directamente: mgba.js es un modulo de Emscripten con
// pthreads. Localiza mgba.wasm y se relanza a si mismo como worker usando su
// propia URL. Si Vite lo pre-empaqueta en .vite/deps, esas rutas se rompen.
// Servirlo como asset estatico desde /mgba/ mantiene ambas resoluciones validas.
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const src = dirname(require.resolve('@thenick775/mgba-wasm/package.json'));
const dest = resolve(import.meta.dirname, '..', 'public', 'mgba');

await mkdir(dest, { recursive: true });
for (const file of ['mgba.js', 'mgba.wasm', 'mgba.wasm.map']) {
  await copyFile(join(src, 'dist', file), join(dest, file));
}
console.log(`[sync-core] nucleo mGBA copiado a ${dest}`);

// Trae el nucleo de Nintendo DS, y solo el nucleo.
//
// Instalarlo con `npm i @emulatorjs/emulatorjs` arrastra **todos** sus
// emuladores como dependencias: Atari, Amstrad, Virtual Boy, cincuenta
// paquetes y 139 MB, de los que usamos uno. Comprobado instalandolo.
//
// Asi que se bajan los dos paquetes sueltos, sin resolver dependencias, y se
// dejan en una carpeta que no se versiona. Son unos 7 MB.
//
// Igual que con el jar del randomizer, el nucleo no vive en el repositorio: es
// software de otra gente, con licencia GPL, y lo descarga quien lo vaya a usar.
//
// Uso: node tools/nds/preparar.mjs
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DESTINO = 'tools/nds/nucleo';
const PAQUETES = ['@emulatorjs/emulatorjs', '@emulatorjs/core-desmume'];

const temporal = join(DESTINO, '.descarga');
rmSync(temporal, { recursive: true, force: true });
mkdirSync(temporal, { recursive: true });

const correr = (orden, args, cwd) =>
  execFileSync(orden, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: true })
    .toString()
    .trim();

for (const paquete of PAQUETES) {
  process.stdout.write(`bajando ${paquete}... `);
  // npm pack baja solo ese paquete: no resuelve ni instala dependencias.
  const tgz = correr('npm', ['pack', paquete, '--silent'], temporal).split('\n').pop();
  correr('tar', ['-xzf', tgz], temporal);
  // Cada tarball se descomprime en "package/", asi que hay que vaciarlo antes
  // de bajar el siguiente o el segundo pisaria al primero.
  const salido = join(temporal, 'package');

  if (paquete.endsWith('emulatorjs')) {
    cpSync(join(salido, 'data'), join(DESTINO, 'data'), { recursive: true });
  } else {
    const cores = join(DESTINO, 'data', 'cores');
    mkdirSync(join(cores, 'reports'), { recursive: true });
    for (const fichero of readdirSync(salido)) {
      if (fichero.endsWith('.data')) cpSync(join(salido, fichero), join(cores, fichero));
    }
    cpSync(join(salido, 'reports'), join(cores, 'reports'), { recursive: true });
  }

  rmSync(salido, { recursive: true, force: true });
  console.log('listo');
}

rmSync(temporal, { recursive: true, force: true });

// Comprobar que esta lo que la prueba va a buscar, y no solo que no hubo error.
const imprescindibles = [
  'data/loader.js',
  'data/src/emulator.js',
  'data/cores/desmume-thread-wasm.data',
  'data/cores/reports/desmume.json',
];
const faltan = imprescindibles.filter((f) => !existsSync(join(DESTINO, f)));

if (faltan.length > 0) {
  console.error(`\nFaltan ficheros en ${DESTINO}:`);
  for (const f of faltan) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`\nnucleo de DS listo en ${DESTINO}/`);
console.log('ahora: node tools/nds/probar-nds.mjs <tu-rom.nds>');

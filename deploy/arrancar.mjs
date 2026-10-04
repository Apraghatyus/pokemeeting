// Arranca las dos piezas de servidor en el mismo contenedor y, si una cae,
// para el contenedor entero para que Docker lo reinicie.
import { spawn } from 'node:child_process';

const piezas = [
  { nombre: 'salas', dir: 'apps/signaling', env: { PORT: '8787' } },
  { nombre: 'randomizer', dir: 'apps/randomizer', env: { PORT: '8788' } },
];

const hijos = piezas.map(({ nombre, dir, env }) => {
  const hijo = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: new URL(`../${dir}/`, import.meta.url),
    env: { ...process.env, ...env },
    stdio: 'inherit',
  });
  hijo.on('exit', (code, signal) => {
    console.error(`[${nombre}] termino (code=${code} signal=${signal}); paro el contenedor`);
    for (const otro of hijos) if (otro !== hijo) otro.kill('SIGTERM');
    process.exit(code ?? 1);
  });
  return hijo;
});

for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => {
    for (const hijo of hijos) hijo.kill(senal);
  });
}

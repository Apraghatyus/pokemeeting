// Arranca Vite en modo tunel: acepta hosts externos y retira la pasarela del
// servicio de aleatorizacion.
//
// Existe como script de Node y no como "TUNNEL=1 vite" en package.json porque
// esa sintaxis de variable en linea no funciona en PowerShell.
import { spawn } from 'node:child_process';

const vite = spawn('npm exec -- vite', {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, TUNNEL: '1' },
});
vite.on('exit', (code) => process.exit(code ?? 0));

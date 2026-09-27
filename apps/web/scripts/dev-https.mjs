// Arranca Vite con certificado autofirmado.
//
// Existe como script de Node y no como "HTTPS=1 vite" en package.json porque
// esa sintaxis de variable en linea no funciona en PowerShell, que es donde se
// desarrolla este proyecto.
import { spawn } from 'node:child_process';

const vite = spawn('npm exec -- vite', {
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, HTTPS: '1' },
});
vite.on('exit', (code) => process.exit(code ?? 0));

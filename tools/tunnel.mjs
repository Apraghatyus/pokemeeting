// Abre un enlace publico temporal hacia el servidor de desarrollo.
//
// Uso: npm run tunnel
//
// Antes de abrirlo comprueba dos cosas que, si fallan, dejan al visitante
// mirando un error sin saber por que:
//
//   - Que la web este levantada.
//   - Que este en modo tunel. Vite responde 403 a cualquier Host que no
//     reconozca, asi que con `npm run dev` normal el enlace no funciona por
//     mucho que el tunel se abra bien.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PUERTO = Number(process.env.PORT ?? 5173);
const LOCAL = `http://localhost:${PUERTO}`;
const CLOUDFLARED = join(import.meta.dirname, 'cloudflared.exe');

/** Ruta al ejecutable, o null si no esta por ninguna parte. */
const buscarCloudflared = () => {
  if (existsSync(CLOUDFLARED)) return CLOUDFLARED;
  // Puede estar instalado en el sistema.
  return 'cloudflared';
};

const comprobarWeb = async () => {
  try {
    const normal = await fetch(LOCAL);
    if (!normal.ok) return { viva: false, enModoTunel: false };
  } catch {
    return { viva: false, enModoTunel: false };
  }

  // Un Host cualquiera: si lo acepta, `allowedHosts` esta abierto.
  const conHostAjeno = await fetch(LOCAL, { headers: { Host: 'prueba.trycloudflare.com' } })
    .then((r) => r.status)
    .catch(() => 0);

  return { viva: true, enModoTunel: conHostAjeno === 200 };
};

const estado = await comprobarWeb();

if (!estado.viva) {
  console.error(`No hay nada escuchando en ${LOCAL}.`);
  console.error('Arranca primero:  npm run dev:tunnel   (y en otra terminal  npm run dev:signaling)');
  process.exit(1);
}

if (!estado.enModoTunel) {
  console.error('La web esta levantada, pero NO en modo tunel.');
  console.error('Vite rechaza los hosts que no conoce, asi que el enlace daria "Blocked request".');
  console.error('Parala y arrancala con:  npm run dev:tunnel');
  process.exit(1);
}

const ejecutable = buscarCloudflared();
console.log('Abriendo el enlace publico...\n');

// Entrecomillado si lleva espacios: la carpeta del proyecto tiene uno y sin
// comillas el interprete de ordenes parte la ruta por la mitad.
const orden = ejecutable.includes(' ') ? `"${ejecutable}"` : ejecutable;
const tunel = spawn(`${orden} tunnel --url ${LOCAL}`, {
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let anunciado = false;
const mirar = (texto) => {
  const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(texto)?.[0];
  if (!url || anunciado) return;
  anunciado = true;

  const marco = '='.repeat(url.length + 6);
  console.log(`\n${marco}`);
  console.log(`   ${url}`);
  console.log(`${marco}\n`);
  console.log('Pasale ese enlace a quien quieras. Muere al cerrar esta ventana.');
  console.log('Recuerda: es publico, cualquiera con el enlace entra al emulador.');
  console.log('Tu sigue usando http://localhost:5173 para ti.\n');
};

for (const flujo of [tunel.stdout, tunel.stderr]) {
  flujo.setEncoding('utf8');
  flujo.on('data', (trozo) => {
    mirar(trozo);
    // El resto del ruido de cloudflared solo se muestra si se pide.
    if (process.env.VERBOSE === '1') process.stdout.write(trozo);
  });
}

tunel.on('error', () => {
  console.error('No encuentro cloudflared.');
  console.error('Instalalo con:  winget install cloudflare.cloudflared');
  console.error(`O deja el ejecutable en:  ${CLOUDFLARED}`);
  process.exit(1);
});

tunel.on('exit', (code) => {
  console.log(`\nEl tunel se ha cerrado (codigo ${code}). El enlace ya no funciona.`);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  tunel.kill();
  process.exit(0);
});

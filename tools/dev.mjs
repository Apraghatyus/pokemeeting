// Arranca de una vez el servidor de salas y la web.
//
// Son dos procesos porque son dos cosas distintas: uno empareja jugadores y el
// otro sirve la pagina. En produccion viviran en sitios separados; en desarrollo
// es mas comodo lanzarlos juntos.
import { spawn } from 'node:child_process';

const services = [
  { name: 'salas', args: ['run', 'dev:signaling'], color: '\u001b[36m' },
  { name: 'web  ', args: ['run', 'dev'], color: '\u001b[35m' },
];

const children = services.map(({ name, args, color }) => {
  const child = spawn('npm', args, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (line) => `${color}[${name}]\u001b[0m ${line}`;
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      for (const line of chunk.split('\n')) {
        if (line.trim()) console.log(prefix(line));
      }
    });
  }
  child.on('exit', (code) => {
    console.log(prefix(`ha terminado (codigo ${code})`));
    stopAll();
  });
  return child;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});

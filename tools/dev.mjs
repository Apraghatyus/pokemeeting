// Arranca de una vez todo lo que hace falta para jugar.
//
// Son tres procesos porque son tres cosas distintas: uno empareja jugadores,
// otro sirve la pagina y otro aleatoriza ROMs. En produccion viven en sitios
// separados; en desarrollo es mas comodo lanzarlos juntos.
//
// Antes aqui faltaba el de aleatorizacion, y el sintoma era desconcertante: la
// aplicacion decia "el servicio de aleatorizacion no esta corriendo, arrancalo
// con npm run dev:all"... que es exactamente lo que acababas de hacer.
//
// Antes de arrancar nada se mira que los puertos esten libres. Un servicio de
// una sesion anterior que se quedo vivo hace que el nuevo muera al segundo con
// un EADDRINUSE entre el ruido de los otros dos, y lo unico que se nota es que
// una parte del programa "no va".
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const SERVICIOS = [
  {
    nombre: 'salas',
    comando: ['run', 'dev:signaling'],
    puerto: 8787,
    color: '\u001b[36m',
    salud: 'http://127.0.0.1:8787/health',
  },
  {
    nombre: 'random',
    comando: ['run', 'dev:randomizer'],
    puerto: 8788,
    color: '\u001b[33m',
    salud: 'http://127.0.0.1:8788/health',
    // Sin esto se juega igual; solo se pierde el menu de aleatorizar.
    opcional: true,
  },
  {
    nombre: 'web   ',
    comando: ['run', 'dev'],
    puerto: 5173,
    color: '\u001b[35m',
    salud: 'http://localhost:5173/',
  },
];

/**
 * Si hay alguien escuchando ya en ese puerto.
 *
 * Se comprueba intentando conectarse, no intentando enlazar. Enlazar no sirve:
 * en Windows, si un proceso escucha en todas las interfaces, otro puede
 * enlazar 127.0.0.1 del mismo puerto sin error, y el aviso se perdia justo
 * para los dos servicios que escuchan asi.
 */
const ocupado = (puerto) =>
  new Promise((listo) => {
    const sonda = connect({ port: puerto, host: '127.0.0.1' });
    const responder = (ocupadoEsta) => {
      sonda.destroy();
      listo(ocupadoEsta);
    };
    sonda.setTimeout(800);
    sonda.once('connect', () => responder(true));
    sonda.once('timeout', () => responder(false));
    sonda.once('error', () => responder(false));
  });

// --- antes de arrancar: que los puertos esten libres ---
const ocupados = [];
for (const servicio of SERVICIOS) {
  if (await ocupado(servicio.puerto)) ocupados.push(servicio);
}

if (ocupados.length > 0) {
  console.error('\nHay puertos ocupados, seguramente por una sesion anterior:\n');
  for (const { nombre, puerto } of ocupados) {
    console.error(`  ${puerto}  (${nombre.trim()})`);
  }
  console.error('\nCierra esa ventana, o mata lo que haya ahi:\n');
  const lista = ocupados.map((s) => s.puerto).join(' ');
  console.error(`  Windows:  for %p in (${lista}) do npx kill-port %p`);
  console.error(`  Linux:    npx kill-port ${lista}\n`);
  process.exit(1);
}

// --- aviso temprano si falta algo para aleatorizar ---
const jar = process.env['UPR_JAR'] ?? resolve('tools/randomizer/PokeRandoZX.jar');
if (!existsSync(jar)) {
  console.log(
    '\u001b[33mAviso:\u001b[0m no esta el jar del randomizer, asi que no se podra ' +
      'aleatorizar.\n       Lee tools/randomizer/LEEME.md. Lo demas funciona igual.\n',
  );
}

// --- arrancar ---
let parando = false;
const hijos = SERVICIOS.map(({ nombre, comando, color }) => {
  const hijo = spawn('npm', comando, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const marcar = (linea) => `${color}[${nombre}]\u001b[0m ${linea}`;

  for (const flujo of [hijo.stdout, hijo.stderr]) {
    flujo.setEncoding('utf8');
    flujo.on('data', (trozo) => {
      for (const linea of trozo.split('\n')) {
        if (linea.trim()) console.log(marcar(linea));
      }
    });
  }

  hijo.on('exit', (codigo) => {
    console.log(marcar(`ha terminado (codigo ${codigo})`));
    pararTodo();
  });

  return hijo;
});

function pararTodo() {
  if (parando) return;
  parando = true;
  for (const hijo of hijos) hijo.kill();
}

process.on('SIGINT', () => {
  pararTodo();
  process.exit(0);
});

// --- esperar a que respondan, y decirlo ---
const responde = async (url) => {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
};

const esperar = async (servicio) => {
  // Arrancar la web compila; el randomizer pregunta a Java. Un minuto sobra.
  for (let intento = 0; intento < 60; intento += 1) {
    if (parando) return false;
    if (await responde(servicio.salud)) return true;
    await new Promise((sigue) => setTimeout(sigue, 1000));
  }
  return false;
};

const resultados = await Promise.all(
  SERVICIOS.map(async (servicio) => ({ servicio, vivo: await esperar(servicio) })),
);

if (parando) process.exit(1);

console.log('');
for (const { servicio, vivo } of resultados) {
  const marca = vivo ? '\u001b[32mlisto \u001b[0m' : '\u001b[31mno va \u001b[0m';
  console.log(`  ${marca} ${servicio.nombre.trim().padEnd(7)} ${servicio.salud}`);
}

const fallo = resultados.find(({ servicio, vivo }) => !vivo && !servicio.opcional);
if (fallo) {
  console.error('\nAlgo imprescindible no ha arrancado. Mira los mensajes de arriba.\n');
} else {
  const sinRandom = resultados.find(({ servicio, vivo }) => !vivo && servicio.opcional);
  if (sinRandom) {
    console.log(
      '\n\u001b[33mSin aleatorizacion:\u001b[0m lo demas funciona. ' +
        'Suele ser que falta Java 8 o el jar; lee tools/randomizer/LEEME.md.',
    );
  }
  console.log('\n  Abre \u001b[4mhttp://localhost:5173\u001b[0m y a jugar.');
  console.log('  Para parar todo: Ctrl+C\n');
}

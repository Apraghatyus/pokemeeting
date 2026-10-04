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
import { request } from 'node:http';
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

/**
 * Pide la pagina fingiendo venir de otro dominio.
 *
 * Se usa `http.request` y no `fetch` a proposito: `Host` es una cabecera
 * prohibida en la especificacion de fetch, asi que Node la descarta **en
 * silencio** y la peticion sale con el Host de siempre. Eso hacia que esta
 * comprobacion devolviera 200 tambien en modo normal, o sea que daba por bueno
 * justo el caso que existe para detectar: el tunel se abria igual y el
 * visitante se encontraba "Blocked request" sin que nadie hubiera avisado.
 */
const pedirConHostAjeno = (host) =>
  new Promise((responder) => {
    const peticion = request(
      { host: 'localhost', port: PUERTO, path: '/', method: 'GET', headers: { Host: host } },
      (respuesta) => {
        respuesta.resume();
        responder(respuesta.statusCode ?? 0);
      },
    );
    peticion.on('error', () => responder(0));
    peticion.end();
  });

const comprobarWeb = async () => {
  try {
    const normal = await fetch(LOCAL);
    if (!normal.ok) return { viva: false, enModoTunel: false };
  } catch {
    return { viva: false, enModoTunel: false };
  }

  // Un Host cualquiera: si lo acepta, `allowedHosts` esta abierto.
  const conHostAjeno = await pedirConHostAjeno('prueba.trycloudflare.com');

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

/**
 * El enlace asignado, y solo ese.
 *
 * No vale buscar cualquier `*.trycloudflare.com`: cloudflared menciona en su
 * salida su **propio** endpoint, `api.trycloudflare.com`, y con un patron
 * generico es cuestion de suerte cual aparece primero. Ya paso: anuncio
 * `https://api.trycloudflare.com` como si fuera el enlace, que es el peor fallo
 * posible aqui, porque no se nota hasta que la otra persona dice que no carga.
 *
 * Los nombres que reparte son tres o cuatro palabras unidas por guiones, asi
 * que se exige al menos un guion y se descarta `api` explicitamente.
 */
const buscarEnlace = (texto) => {
  for (const [, host] of texto.matchAll(/https:\/\/([a-z0-9-]+)\.trycloudflare\.com/g)) {
    if (host !== 'api' && host.includes('-')) return `https://${host}.trycloudflare.com`;
  }
  return null;
};

/** Lo ultimo que dijo cloudflared, para poder explicar un fallo. */
let ultimoError = '';

let anunciado = false;
const mirar = (texto) => {
  const url = buscarEnlace(texto);
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
    // Se guarda la queja para poder explicarla si acaba muriendo.
    const queja = /(?:failed to|unable to|error)[^\n]*/i.exec(trozo)?.[0];
    if (queja) ultimoError = queja.trim();
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
  // Morir sin haber anunciado nada no es "se cerro el tunel": es que no llego a
  // abrirse. Decirlo distinto importa, porque lo que hay que hacer es otra cosa.
  if (!anunciado) {
    console.error('\nNo se pudo abrir el enlace.');
    if (ultimoError) console.error(`\n  ${ultimoError}\n`);

    if (/api\.trycloudflare\.com|deadline exceeded|timeout|429/i.test(ultimoError)) {
      console.error('Eso viene del lado de Cloudflare, no de tu maquina: su servicio de');
      console.error('tuneles rapidos esta tardando o rechazando peticiones. Opciones:\n');
      console.error('  1. Reintentar en unos minutos; suele ser pasajero.');
      console.error('  2. Tailscale Funnel, que no depende de esto. Hay que habilitar');
      console.error('     HTTPS una vez en https://login.tailscale.com/admin/dns y luego:');
      console.error('       tailscale funnel 5173\n');
      console.error('Lee docs/jugar-con-alguien-de-fuera.md para el detalle.');
    } else {
      console.error('Prueba con VERBOSE=1 npm run tunnel para ver que dice cloudflared.');
    }
    process.exit(1);
  }

  console.log(`\nEl tunel se ha cerrado (codigo ${code}). El enlace ya no funciona.`);
  process.exit(code ?? 0);
});

process.on('SIGINT', () => {
  tunel.kill();
  process.exit(0);
});

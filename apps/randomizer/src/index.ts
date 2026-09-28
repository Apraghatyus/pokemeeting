// Servicio local que ejecuta el Universal Pokemon Randomizer ZX.
//
// El randomizer es una aplicacion Java de escritorio: no puede correr dentro
// del navegador. Este servicio es el puente, y vive en la maquina del propio
// jugador.
//
// Tres reglas que definen el diseno y no son negociables:
//
//   1. Escucha SOLO en 127.0.0.1. No se publica a la red. Si tu companero
//      quiere randomizar, ejecuta el suyo.
//   2. No guarda nada. Fichero temporal, devolver, borrar en un finally.
//   3. Nunca entrega a una persona un fichero originado por otra. Cada quien
//      randomiza su propia copia.
//
// Esa tercera regla es la linea legal del proyecto entero: procesar tu propia
// ROM no es distribuirla; mandarsela a otro si lo seria.

import { spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PORT = Number(process.env['PORT'] ?? 8788);

/** Donde buscamos el jar si no se indica otra cosa con UPR_JAR. */
const DEFAULT_JAR = resolve(import.meta.dirname, '../../../tools/randomizer/PokeRandoZX.jar');
const jarPath = (): string => process.env['UPR_JAR'] ?? DEFAULT_JAR;

/** Solo Rojo Fuego y Verde Hoja, que es el alcance acordado. */
const SUPPORTED_GAMES = new Set(['BPR', 'BPG']);

/** Tamano maximo aceptado, con holgura sobre los 32 MB de la ROM mas grande. */
const MAX_BODY_BYTES = 48 * 1024 * 1024;

/** Una ejecucion que tarde mas que esto es que se ha colgado. */
const JAVA_TIMEOUT_MS = 5 * 60 * 1000;

type JsonBody = Record<string, unknown>;

const sendJson = (res: ServerResponse, status: number, body: JsonBody): void => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
};

/** Lee el cuerpo completo de la peticion, con tope de tamano. */
const readBody = (req: IncomingMessage): Promise<Buffer> =>
  new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('El fichero enviado es demasiado grande.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });

/**
 * Formato del cuerpo: [4 bytes: longitud de los ajustes][ajustes][ROM].
 *
 * Es un marco propio y no multipart porque los dos extremos son nuestros: se
 * lee en tres lineas, no necesita dependencias y no impone limites de cabecera
 * a un fichero de ajustes de tamano desconocido.
 */
const unpack = (body: Buffer): { settings: Buffer; rom: Buffer } => {
  if (body.length < 4) throw new Error('Peticion incompleta.');
  const settingsLength = body.readUInt32BE(0);
  if (settingsLength === 0) throw new Error('Faltan los ajustes de aleatorizacion.');
  if (body.length < 4 + settingsLength) throw new Error('Peticion incompleta.');
  return {
    settings: body.subarray(4, 4 + settingsLength),
    rom: body.subarray(4 + settingsLength),
  };
};

/** Codigo de juego de la cabecera de GBA (posicion 0xAC, 4 bytes). */
const gameCodeOf = (rom: Buffer): string =>
  rom.length > 0xb0 ? rom.subarray(0xac, 0xb0).toString('ascii') : '';

type JavaInfo = { available: boolean; version: string | null; bits64: boolean };

/** Pregunta a Java su version. Lo usa /health para poder avisar antes de fallar. */
const probeJava = (): Promise<JavaInfo> =>
  new Promise((resolveProbe) => {
    const child = spawn('java', ['-version'], { shell: true });
    let output = '';
    // java -version escribe en stderr, no en stdout.
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', () => resolveProbe({ available: false, version: null, bits64: false }));
    child.on('close', (code) => {
      if (code !== 0 && !output) {
        resolveProbe({ available: false, version: null, bits64: false });
        return;
      }
      const version = /version "([^"]+)"/.exec(output)?.[1] ?? null;
      resolveProbe({
        available: true,
        version,
        // El randomizer no arranca con Java de 32 bits, asi que conviene mirarlo.
        bits64: /64-Bit/i.test(output),
      });
    });
  });

type JavaRun = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

const runRandomizer = (args: string[]): Promise<JavaRun> =>
  new Promise((resolveRun) => {
    const child = spawn('java', args, { shell: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, JAVA_TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolveRun({ code: null, stdout, stderr: stderr + String(error), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolveRun({ code, stdout, stderr, timedOut });
    });
  });

/**
 * Busca la semilla en el registro que deja el randomizer.
 *
 * No se puede *elegir* la semilla desde la linea de ordenes, pero si leer cual
 * uso. Sirve para que el jugador pueda anotarla y para explicar por que dos
 * aleatorizaciones no salen iguales.
 */
const extractSeed = (log: string): string | null =>
  /random\s+seed[:\s]+(\d+)/i.exec(log)?.[1] ?? null;

const handleRandomize = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const jar = jarPath();
  if (!existsSync(jar)) {
    sendJson(res, 503, {
      error: 'jar-no-encontrado',
      message: `No encuentro el randomizer en ${jar}. Lee tools/randomizer/LEEME.md.`,
    });
    return;
  }

  let settings: Buffer;
  let rom: Buffer;
  try {
    ({ settings, rom } = unpack(await readBody(req)));
  } catch (error) {
    sendJson(res, 400, {
      error: 'peticion-invalida',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const gameCode = gameCodeOf(rom);
  if (!SUPPORTED_GAMES.has(gameCode.slice(0, 3))) {
    sendJson(res, 400, {
      error: 'juego-no-soportado',
      message: `De momento solo Rojo Fuego y Verde Hoja. Esa ROM es "${gameCode}".`,
    });
    return;
  }

  // Todo ocurre dentro de una carpeta temporal que se borra pase lo que pase.
  const workdir = await mkdtemp(join(tmpdir(), 'emupoke-rnd-'));
  try {
    const input = join(workdir, 'entrada.gba');
    const output = join(workdir, 'salida.gba');
    const settingsFile = join(workdir, 'ajustes.rnqs');

    await writeFile(input, rom);
    await writeFile(settingsFile, settings);

    const run = await runRandomizer([
      '-Xmx4096M',
      '-jar',
      `"${jar}"`,
      'cli',
      '-s',
      `"${settingsFile}"`,
      '-i',
      `"${input}"`,
      '-o',
      `"${output}"`,
      '-l',
    ]);

    if (run.timedOut) {
      sendJson(res, 504, {
        error: 'tiempo-agotado',
        message: 'El randomizer tardo demasiado y se cancelo.',
      });
      return;
    }
    if (!existsSync(output)) {
      sendJson(res, 500, {
        error: 'fallo-del-randomizer',
        message: 'El randomizer termino sin generar la ROM.',
        detalle: (run.stderr || run.stdout).slice(-1500),
      });
      return;
    }

    // El registro queda junto a la salida; de ahi sacamos la semilla usada.
    let seed: string | null = null;
    for (const name of await readdir(workdir)) {
      if (!name.endsWith('.log')) continue;
      seed = extractSeed(await readFile(join(workdir, name), 'utf8'));
      if (seed) break;
    }

    const randomized = await readFile(output);
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': randomized.length,
      ...(seed ? { 'x-seed': seed } : {}),
      // La cabecera de semilla debe ser legible desde el navegador.
      'access-control-expose-headers': 'x-seed',
    });
    res.end(randomized);
    console.log(`randomizada una ROM ${gameCode}${seed ? ` (semilla ${seed})` : ''}`);
  } catch (error) {
    sendJson(res, 500, {
      error: 'fallo-interno',
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Pase lo que pase, no queda ni rastro de la ROM en el disco.
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
};

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    void probeJava().then((java) => {
      const jar = jarPath();
      sendJson(res, 200, {
        ok: true,
        java,
        jar: { path: jar, found: existsSync(jar) },
        games: [...SUPPORTED_GAMES],
      });
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/randomize') {
    void handleRandomize(req, res);
    return;
  }

  sendJson(res, 404, { error: 'no-encontrado' });
});

// Solo 127.0.0.1: este servicio maneja la ROM del jugador y no tiene por que
// ser alcanzable desde la red.
server.listen(PORT, '127.0.0.1', () => {
  console.log(`servicio de aleatorizacion escuchando en 127.0.0.1:${PORT}`);
  void probeJava().then((java) => {
    if (!java.available) console.log('AVISO: no encuentro Java. El randomizer lo necesita.');
    else if (!java.bits64) console.log('AVISO: tu Java es de 32 bits y el randomizer no arrancara.');
    else console.log(`Java ${java.version ?? '?'} de 64 bits: correcto.`);
    if (!existsSync(jarPath())) {
      console.log(`AVISO: falta ${jarPath()}. Lee tools/randomizer/LEEME.md.`);
    }
  });
});

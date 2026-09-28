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
import { buildSettingsScript, optionById, publicOptions, type RandomizerOption } from './options.ts';

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
 * Peticion de aleatorizacion.
 *
 * Se elige entre dos formas de decir que aleatorizar: marcando opciones en el
 * menu, o trayendo un fichero .rnqs exportado del randomizer de escritorio,
 * que permite ajustes mas finos de los que cabe ofrecer aqui.
 */
type RandomizeRequest = {
  /** Identificadores del catalogo de opciones. */
  options?: string[];
  /** Fichero .rnqs en base64, como alternativa al menu. */
  settingsBase64?: string;
};

/**
 * Formato del cuerpo: [4 bytes: longitud del JSON][JSON][ROM].
 *
 * Marco propio y no multipart porque los dos extremos son nuestros: se lee en
 * tres lineas, no necesita dependencias y no impone limites de cabecera.
 */
const unpack = (body: Buffer): { request: RandomizeRequest; rom: Buffer } => {
  if (body.length < 4) throw new Error('Peticion incompleta.');
  const headerLength = body.readUInt32BE(0);
  if (headerLength === 0) throw new Error('Falta indicar que aleatorizar.');
  if (body.length < 4 + headerLength) throw new Error('Peticion incompleta.');
  return {
    request: JSON.parse(body.subarray(4, 4 + headerLength).toString('utf8')) as RandomizeRequest,
    rom: body.subarray(4 + headerLength),
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

/**
 * Ruta de jjs, el motor de scripts que trae la JRE de Java 8.
 *
 * Hace falta para construir el fichero de ajustes desde el menu: el formato lo
 * escribe la propia clase Settings del randomizer, y reimplementarlo por
 * nuestra cuenta seria fragil. Se deduce de java.home y no se asume que este
 * en el PATH, porque normalmente no lo esta.
 *
 * Aviso para el futuro: Nashorn se elimino en Java 15. Con una JRE moderna
 * esto no existira y habra que volver a pedir un fichero .rnqs.
 */
let jjsCache: string | null | undefined;

const findJjs = (): Promise<string | null> =>
  new Promise((resolveJjs) => {
    if (jjsCache !== undefined) {
      resolveJjs(jjsCache);
      return;
    }
    const child = spawn('java', ['-XshowSettings:properties', '-version'], { shell: true });
    let output = '';
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', () => {
      jjsCache = null;
      resolveJjs(null);
    });
    child.on('close', () => {
      const home = /java\.home\s*=\s*(.+)/.exec(output)?.[1]?.trim();
      const candidates = home
        ? [join(home, 'bin', 'jjs.exe'), join(home, 'bin', 'jjs')]
        : [];
      jjsCache = candidates.find((path) => existsSync(path)) ?? null;
      resolveJjs(jjsCache);
    });
  });

type JavaRun = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

const run = (command: string, args: string[]): Promise<JavaRun> =>
  new Promise((resolveRun) => {
    // El comando va entrecomillado si lleva espacios: jjs vive en
    // "C:\Program Files\Java\..." y sin comillas el interprete de ordenes
    // lo parte en "C:\Program" y se queja de que no existe.
    const executable = command.includes(' ') ? `"${command}"` : command;
    const child = spawn(executable, args, { shell: true });
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

/** Titulos que el randomizer escribe en su registro, traducidos. */
const SECTION_LABELS: Array<[pattern: RegExp, label: string]> = [
  [/^--(Random|Custom) Starters--/i, 'Iniciales'],
  [/^--Pokemon Base Stats & Types--/i, 'Estadisticas y tipos'],
  [/^--Pokemon Movesets--/i, 'Movimientos'],
  [/^--Move Data--/i, 'Datos de movimientos'],
  [/^--Trainers Pokemon--/i, 'Entrenadores'],
  [/^--Wild Pokemon--/i, 'Pokemon salvajes'],
  [/^--Static Pokemon--/i, 'Pokemon fijos'],
  [/^--Shops--/i, 'Objetos de tienda'],
  [/^--TM Moves--/i, 'MTs'],
  [/^--Move Tutor Moves--/i, 'Tutores de movimientos'],
];

export type RandomizeSummary = {
  /** Que apartados cambiaron de verdad. */
  changed: string[];
  /** Los tres iniciales resultantes, si se aleatorizaron. */
  starters: string[];
};

/**
 * Resume que ha cambiado y cuales son los iniciales.
 *
 * Merece la pena porque unos ajustes mal hechos producen una ROM que parece
 * normal, y sin esto el jugador no lo nota hasta llevar media hora jugando.
 *
 * Cuando las opciones vienen del menu, la lista fiable es la que pidio el
 * jugador: el registro **no sirve** para eso porque hay apartados, como los
 * objetos del mapa o las habilidades, que el randomizer cambia sin escribir
 * ningun titulo. Solo se recurre al registro con un fichero .rnqs traido de
 * fuera, donde no sabemos que se pidio.
 */
const summarize = (log: string, requested: readonly RandomizerOption[]): RandomizeSummary => {
  const changed: string[] = requested.map((option) => option.label);
  const starters: string[] = [];

  // Solo se lee el registro cuando no sabemos que se pidio, es decir, con un
  // fichero .rnqs traido de fuera. Con el menu, mezclar ambas fuentes duplica
  // apartados ("Iniciales" del registro junto a "Pokemon iniciales" del menu).
  const deduceFromLog = requested.length === 0;

  for (const line of log.split(/\r?\n/)) {
    if (deduceFromLog) {
      for (const [pattern, label] of SECTION_LABELS) {
        if (pattern.test(line) && !changed.includes(label)) changed.push(label);
      }
    }
    const starter = /^Set starter \d+ to (.+)$/i.exec(line.trim());
    if (starter?.[1]) starters.push(starter[1].trim());
  }

  return { changed, starters };
};

const handleRandomize = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const jar = jarPath();
  if (!existsSync(jar)) {
    sendJson(res, 503, {
      error: 'jar-no-encontrado',
      message: `No encuentro el randomizer en ${jar}. Lee tools/randomizer/LEEME.md.`,
    });
    return;
  }

  let request: RandomizeRequest;
  let rom: Buffer;
  try {
    ({ request, rom } = unpack(await readBody(req)));
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

  // Resolver que opciones se piden, antes de tocar el disco.
  let chosen: RandomizerOption[] = [];
  if (!request.settingsBase64) {
    const ids = request.options ?? [];
    if (ids.length === 0) {
      sendJson(res, 400, {
        error: 'sin-opciones',
        message: 'No has marcado nada que aleatorizar.',
      });
      return;
    }
    const unknown = ids.filter((id) => !optionById(id));
    if (unknown.length > 0) {
      sendJson(res, 400, {
        error: 'opcion-desconocida',
        message: `No conozco estas opciones: ${unknown.join(', ')}.`,
      });
      return;
    }
    chosen = ids.map((id) => optionById(id)!);
  }

  // Todo ocurre dentro de una carpeta temporal que se borra pase lo que pase.
  const workdir = await mkdtemp(join(tmpdir(), 'emupoke-rnd-'));
  try {
    const input = join(workdir, 'entrada.gba');
    const output = join(workdir, 'salida.gba');
    const settingsFile = join(workdir, 'ajustes.rnqs');

    await writeFile(input, rom);

    if (request.settingsBase64) {
      await writeFile(settingsFile, Buffer.from(request.settingsBase64, 'base64'));
    } else {
      // El fichero de ajustes lo escribe la propia clase Settings del
      // randomizer a traves de jjs: su formato lleva version y suma de
      // comprobacion, y reproducirlo por nuestra cuenta seria fragil.
      const jjs = await findJjs();
      if (!jjs) {
        sendJson(res, 503, {
          error: 'sin-jjs',
          message:
            'No encuentro jjs junto a tu Java, asi que no puedo construir los ajustes desde el menu. Exporta un fichero .rnqs del randomizer de escritorio.',
        });
        return;
      }
      const scriptPath = join(workdir, 'ajustes.js');
      await writeFile(scriptPath, buildSettingsScript(chosen), 'utf8');
      const built = await run(jjs, [
        '-cp',
        `"${jar}"`,
        `"${scriptPath}"`,
        '--',
        `"${settingsFile}"`,
      ]);
      if (!existsSync(settingsFile)) {
        sendJson(res, 500, {
          error: 'ajustes-no-generados',
          message: 'No se pudieron construir los ajustes.',
          detalle: (built.stderr || built.stdout).slice(-1500),
        });
        return;
      }
    }

    const execution = await run('java', [
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

    if (execution.timedOut) {
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
        detalle: (execution.stderr || execution.stdout).slice(-1500),
      });
      return;
    }

    // El registro queda junto a la salida: de ahi sacamos la semilla y el
    // resumen de lo que ha cambiado.
    let seed: string | null = null;
    let summary: RandomizeSummary = { changed: [], starters: [] };
    for (const name of await readdir(workdir)) {
      if (!name.endsWith('.log')) continue;
      const log = await readFile(join(workdir, name), 'utf8');
      seed = extractSeed(log);
      summary = summarize(log, chosen);
      break;
    }

    const randomized = await readFile(output);
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': randomized.length,
      ...(seed ? { 'x-seed': seed } : {}),
      // En base64 porque lleva acentos y las cabeceras HTTP son ASCII.
      'x-summary': Buffer.from(JSON.stringify(summary), 'utf8').toString('base64'),
      // Estas cabeceras deben ser legibles desde el navegador.
      'access-control-expose-headers': 'x-seed, x-summary',
    });
    res.end(randomized);
    console.log(
      `randomizada una ROM ${gameCode}${seed ? ` (semilla ${seed})` : ''}` +
        (summary.changed.length ? ` -> ${summary.changed.join(', ')}` : ' -> sin cambios'),
    );
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
    void Promise.all([probeJava(), findJjs()]).then(([java, jjs]) => {
      const jar = jarPath();
      sendJson(res, 200, {
        ok: true,
        java,
        jar: { path: jar, found: existsSync(jar) },
        games: [...SUPPORTED_GAMES],
        // Sin jjs el menu no puede construir ajustes y hay que traer un .rnqs.
        menu: { available: jjs !== null, jjs },
        options: publicOptions(),
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

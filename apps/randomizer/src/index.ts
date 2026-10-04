// Servicio local que ejecuta el Universal Pokemon Randomizer ZX.
//
// El randomizer es una aplicacion Java de escritorio: no puede correr dentro
// del navegador. Este servicio es el puente, y vive en la maquina del propio
// jugador.
//
// Tres reglas que definen el diseno:
//
//   1. Escucha solo en 127.0.0.1. Llegar hasta el desde fuera exige pasar por
//      el servidor de desarrollo, que es quien decide a quien atiende.
//   2. No guarda nada. Fichero temporal, devolver, borrar en un finally.
//   3. Devuelve la ROM a quien la mando, y a nadie mas.
//
// La tercera es la linea legal del proyecto entero: procesar la ROM de alguien
// y devolversela no es distribuirla; entregarsela a un tercero si lo seria.
// Por eso alguien que entra por un enlace compartido SI puede aleatorizar su
// propia copia, y la interfaz le dice adonde viaja su fichero antes de que
// decida.

import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { spawn } from 'node:child_process';
import { gunzip as gunzipCallback, gzip as gzipCallback } from 'node:zlib';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildSettingsScript,
  optionById,
  publicOptions,
  type Generacion,
  type RandomizerOption,
} from './options.ts';
import { buildFromStringScript, buildRandomizeScript } from './semilla.ts';
import { Abandonada, Cola, ColaLlena } from './cola.ts';

const PORT = Number(process.env['PORT'] ?? 8788);
// Solo local por defecto. En Docker se abre a la red interna con HOST=0.0.0.0.
const HOST = process.env['HOST'] ?? '127.0.0.1';

/** Donde buscamos el jar si no se indica otra cosa con UPR_JAR. */
const DEFAULT_JAR = resolve(import.meta.dirname, '../../../tools/randomizer/PokeRandoZX.jar');
const jarPath = (): string => process.env['UPR_JAR'] ?? DEFAULT_JAR;

/**
 * Los juegos que sabemos aleatorizar, con su generacion.
 *
 * No es una lista elegida a ojo: el jar trae dentro sus ficheros de posiciones
 * por generacion, con una entrada por ROM, y de ahi salen estos codigos. La
 * prueba test-juegos-soportados.mjs lo comprueba contra el jar que haya
 * instalado, en vez de fiarse de esta lista.
 *
 * La generacion hace falta para no ofrecer opciones que ese juego no tiene: en
 * segunda generacion no existen las habilidades, por ejemplo.
 */
const SUPPORTED_GAMES: Readonly<Record<string, Generacion>> = {
  // Segunda generacion, Game Boy Color. Cristal japones usa otro codigo.
  AAU: 2,
  AAX: 2,
  BYT: 2,
  BXT: 2,
  // Tercera generacion, Game Boy Advance.
  BPR: 3,
  BPG: 3,
  AXV: 3,
  AXP: 3,
  BPE: 3,
};

const generacionDe = (gameCode: string): Generacion | null =>
  SUPPORTED_GAMES[gameCode.slice(0, 3).toUpperCase()] ?? null;

/**
 * Cuantas aleatorizaciones a la vez, y cuantos pueden esperar.
 *
 * El limite por defecto es cuatro porque es donde deja de haber ganancia:
 * medido en doce nucleos, cuatro a la vez dan 0,54 por segundo y ocho dan 0,59,
 * mientras que la espera de cada uno pasa de 7 a 13 segundos. En una maquina mas
 * pequena interesa bajarlo; de ahi que sea una variable de entorno.
 *
 * El maximo en cola existe para poder decir "ahora no" en vez de aceptar a
 * cualquiera y mentirle: cien esperando a cuatro por vez ya son varios minutos.
 */
const CONCURRENCIA = Math.max(
  1,
  Number(process.env['RANDOMIZER_CONCURRENCIA'] ?? Math.min(4, cpus().length)),
);
const MAX_EN_COLA = Math.max(1, Number(process.env['RANDOMIZER_MAX_COLA'] ?? 100));

const cola = new Cola(CONCURRENCIA, MAX_EN_COLA);

/**
 * Techo de memoria de cada JVM.
 *
 * Antes era 4096 MB y no se usaban: medido, el pico real de una aleatorizacion
 * de GBA son 143 MB. El problema de un techo que no se usa es que sigue siendo
 * un permiso: con varias copias a la vez, son varios procesos autorizados a
 * pedir 4 GB cada uno en una maquina que no los tiene.
 *
 * 1024 es siete veces el pico medido, que es holgura de sobra para una ROM mas
 * grande, y acota el peor caso a algo que cabe.
 */
const JVM_MEMORIA = process.env['RANDOMIZER_XMX'] ?? '1024M';

/** Para soltar la ROM de la memoria en cuanto esta en disco. */
const VACIO = Buffer.alloc(0);

/** Tamano maximo aceptado, con holgura sobre los 32 MB de la ROM mas grande. */
const MAX_BODY_BYTES = 48 * 1024 * 1024;

/**
 * Cabecera con la que el cliente avisa de que el cuerpo viene comprimido.
 *
 * Se usa una propia en vez de `Content-Encoding` a proposito: esa es estandar
 * y cualquier intermediario (el proxy de desarrollo, Cloudflare) puede
 * decidir descomprimirla o recomprimirla por su cuenta. Con una cabecera
 * nuestra, lo que se empaqueta aqui es exactamente lo que se desempaqueta
 * alli.
 */
const ENCODING_HEADER = 'x-body-encoding';

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
  /** Cadena de ajustes del propio randomizer, para rehacer una partida. */
  settingsString?: string;
  /**
   * Semilla concreta, para rehacer una copia que ya existio.
   *
   * Sin ella se escoge una y se devuelve: toda copia nace con su semilla
   * anotada, porque es lo que permite reconstruirla sin guardar el fichero.
   */
  seed?: string;
  /**
   * Un identificador que se inventa el cliente para poder preguntar por su
   * puesto en la cola.
   *
   * Lo elige el cliente y no el servidor por un motivo practico: la respuesta de
   * `/randomize` no llega hasta que todo ha terminado, asi que si el servidor lo
   * repartiera, quien espera no tendria con que preguntar justo cuando le hace
   * falta.
   */
  ticket?: string;
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

/**
 * Donde esta el ejecutable de Java.
 *
 * Normalmente basta con "java", porque esta en el PATH. Pero el PATH depende de
 * desde donde se arranque el servicio: una terminal distinta, un servicio del
 * sistema o un editor pueden traer otro, y entonces el randomizer decia que no
 * habia Java estando instalado.
 *
 * Asi que si no esta en el PATH se busca donde suele estar. Se resuelve una
 * vez y se reutiliza, porque de aqui sale tambien jjs.
 */
let javaCache: string | undefined;

const candidatosDeJava = (): string[] => {
  const rutas: string[] = [];
  const home = process.env['JAVA_HOME'];
  if (home) rutas.push(join(home, 'bin', 'java'));

  // Windows: cada version se instala en su carpeta y no siempre toca el PATH.
  for (const base of ['C:/Program Files/Java', 'C:/Program Files (x86)/Java']) {
    try {
      for (const version of readdirSync(base)) {
        rutas.push(join(base, version, 'bin', 'java.exe'));
      }
    } catch {
      // Esa carpeta no existe en este sistema; se prueba la siguiente.
    }
  }

  // Linux y Mac, por si algun dia corre ahi.
  for (const base of ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines']) {
    try {
      for (const version of readdirSync(base)) {
        rutas.push(join(base, version, 'bin', 'java'));
        rutas.push(join(base, version, 'Contents', 'Home', 'bin', 'java'));
      }
    } catch {
      // Igual que arriba.
    }
  }

  return rutas;
};

/** Prueba un ejecutable concreto preguntandole su version. */
const responde = (ejecutable: string): Promise<string | null> =>
  new Promise((listo) => {
    const comando = ejecutable.includes(' ') ? `"${ejecutable}"` : ejecutable;
    const child = spawn(comando, ['-version'], { shell: true });
    let salida = '';
    child.stderr.on('data', (chunk: Buffer) => (salida += chunk.toString()));
    child.on('error', () => listo(null));
    child.on('close', () => listo(/version "([^"]+)"/.test(salida) ? salida : null));
  });

const buscarJava = async (): Promise<string | null> => {
  if (javaCache !== undefined) return javaCache === '' ? null : javaCache;

  for (const candidato of ['java', ...candidatosDeJava()]) {
    if (candidato !== 'java' && !existsSync(candidato)) continue;
    if (await responde(candidato)) {
      javaCache = candidato;
      if (candidato !== 'java') {
        console.log(`java no estaba en el PATH; se usara ${candidato}`);
      }
      return candidato;
    }
  }

  javaCache = '';
  return null;
};

type JavaInfo = { available: boolean; version: string | null; bits64: boolean };

/** Pregunta a Java su version. Lo usa /health para poder avisar antes de fallar. */
const probeJava = async (): Promise<JavaInfo> => {
  const ejecutable = await buscarJava();
  if (!ejecutable) return { available: false, version: null, bits64: false };

  const salida = (await responde(ejecutable)) ?? '';
  return {
    available: true,
    version: /version "([^"]+)"/.exec(salida)?.[1] ?? null,
    bits64: /64-Bit/i.test(salida),
  };
};

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

const findJjs = async (): Promise<string | null> => {
  if (jjsCache !== undefined) return jjsCache;

  // jjs vive junto al Java que se este usando, que no tiene por que ser el del
  // PATH: puede haberlo encontrado buscarJava en otro sitio.
  const java = await buscarJava();
  if (!java) {
    jjsCache = null;
    return null;
  }

  return new Promise((resolveJjs) => {
    const comando = java.includes(' ') ? `"${java}"` : java;
    const child = spawn(comando, ['-XshowSettings:properties', '-version'], { shell: true });
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
};

/**
 * Los ficheros de ajustes ya construidos, por conjunto de opciones.
 *
 * Construirlos cuesta **una JVM entera**: medido, 1,0 s de los 3,5 que tardaba
 * una peticion, solo para escribir 88 bytes. Y es trabajo repetido, porque el
 * resultado depende unicamente de que opciones se marcaron.
 *
 * La clave va ordenada porque el orden no influye en el resultado. Eso no se
 * supuso, se comprobo: con las cinco opciones en un orden y en el inverso salen
 * los mismos 88 bytes. Importaba asegurarlo antes de cachear, porque la cadena
 * de ajustes es media semilla y una semilla que dejara de rehacer la misma copia
 * seria el peor fallo posible de este proyecto.
 *
 * Cabe en memoria de sobra: son 88 bytes por combinacion y las combinaciones
 * posibles del menu son unas pocas docenas.
 */
const ajustesEnCache = new Map<string, Buffer>();

const claveDeAjustes = (chosen: readonly RandomizerOption[]): string =>
  chosen
    .map((option) => option.id)
    .sort()
    .join('|');

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
 * Escoge una semilla nueva.
 *
 * Seis bytes, que son mas de doscientos billones de mundos posibles y caben
 * exactos en un numero de JavaScript, asi que ni el navegador ni el registro
 * la redondean por el camino.
 */
const pickSeed = (): string => String(Number(BigInt('0x' + randomBytes(6).toString('hex'))));

/**
 * Busca la semilla en el registro que deja el randomizer.
 *
 * Solo hace falta en la via sin jjs, que es la unica donde la semilla la
 * escoge el randomizer y no nosotros. Ahi la copia no se podra rehacer, pero
 * al menos se sabe con que se hizo.
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
  /** Lo que se pidio pero ese juego no tiene, como habilidades en Gen 2. */
  omitidas: string[];
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
  const omitidas: string[] = [];

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

  return { changed, starters, omitidas };
};

/**
 * Comprimir merece la pena de verdad: una ROM de GBA baja de 16 MB a algo mas
 * de 5, y comprimir cuesta medio segundo. En una conexion domestica de subida
 * lenta eso es la diferencia entre cuatro minutos y poco mas de uno.
 *
 * Lo que no puede ser es comprimir en el hilo principal. Medido: 389 ms para
 * comprimir los 16 MB y 66 ms para descomprimirlos, y con las versiones
 * sincronas ese casi medio segundo es tiempo en el que el servicio ENTERO esta
 * congelado, no solo esa peticion. Las asincronas hacen el mismo trabajo en el
 * grupo de hilos de Node, asi que las demas peticiones siguen avanzando.
 */
const gzip = promisify(gzipCallback);
const gunzip = promisify(gunzipCallback);

const maybeDecompress = async (body: Buffer, req: IncomingMessage): Promise<Buffer> =>
  req.headers[ENCODING_HEADER] === 'gzip'
    ? await gunzip(body, { maxOutputLength: MAX_BODY_BYTES })
    : body;

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
    ({ request, rom } = unpack(await maybeDecompress(await readBody(req), req)));
  } catch (error) {
    sendJson(res, 400, {
      error: 'peticion-invalida',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const gameCode = gameCodeOf(rom);
  const generacion = generacionDe(gameCode);
  if (generacion === null) {
    sendJson(res, 400, {
      error: 'juego-no-soportado',
      message: `Se pueden aleatorizar Oro, Plata, Cristal, Rubi, Zafiro, Esmeralda, Rojo Fuego y Verde Hoja. Esa ROM es "${gameCode}".`,
    });
    return;
  }

  // Resolver que opciones se piden, antes de tocar el disco. Rehaciendo una
  // partida desde su semilla no hay menu que validar: los ajustes vienen ya
  // resueltos dentro de la propia semilla.
  let chosen: RandomizerOption[] = [];
  if (!request.settingsBase64 && !request.settingsString) {
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

  // Se apartan las opciones que ese juego no tiene. Aplicarlas no romperia
  // nada -el randomizer las ignora-, pero luego le diriamos al jugador que ha
  // cambiado algo que no ha cambiado, que es peor que no ofrecerlo.
  const omitidas = chosen.filter((option) => !option.generaciones.includes(generacion));
  chosen = chosen.filter((option) => option.generaciones.includes(generacion));

  if (!request.settingsBase64 && !request.settingsString && chosen.length === 0) {
    sendJson(res, 400, {
      error: 'sin-opciones-validas',
      message:
        omitidas.length > 0
          ? `Nada de lo que marcaste existe en este juego: ${omitidas.map((o) => o.label).join(', ')}.`
          : 'No has marcado nada que aleatorizar.',
    });
    return;
  }

  // Todo ocurre dentro de una carpeta temporal que se borra pase lo que pase.
  const workdir = await mkdtemp(join(tmpdir(), 'emupoke-rnd-'));
  // Se declara aqui, fuera del try, para poder soltarlo en el finally que ya
  // existe: si un turno se quedara cogido, la cola se iria estrechando con cada
  // fallo hasta atascarse del todo.
  let soltarTurno: (() => void) | null = null;
  try {
    const input = join(workdir, 'entrada.gba');
    const output = join(workdir, 'salida.gba');
    const settingsFile = join(workdir, 'ajustes.rnqs');

    await writeFile(input, rom);
    // La ROM se suelta de la memoria ANTES de ponerse a esperar, y por eso se
    // escribe al disco antes de pedir turno: cien peticiones en cola agarrando
    // 16 MB cada una serian 1,6 GB de memoria esperando a no hacer nada. En
    // disco son 1,6 GB de un sitio que sobra y que se borra solo.
    rom = VACIO;

    // Si quien espera cierra la pestana, su turno se cancela: nadie va a
    // recoger esa copia, y hacerla seria quitarle el sitio a alguien que si
    // sigue ahi.
    const abandono = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) abandono.abort();
    });

    try {
      soltarTurno = await cola.turno(request.ticket ?? null, abandono.signal);
    } catch (error) {
      if (error instanceof ColaLlena) {
        sendJson(res, 503, {
          error: 'cola-llena',
          message: 'Ahora mismo hay demasiada gente aleatorizando. Prueba en unos minutos.',
          cola: cola.estado(),
        });
      } else if (!(error instanceof Abandonada)) {
        throw error;
      }
      // Si se fue, no hay a quien responder.
      return;
    }

    // Los ajustes pueden venir de tres sitios: un fichero .rnqs del randomizer
    // de escritorio, la cadena de ajustes de una partida que se esta
    // rehaciendo, o el menu de la interfaz.
    const jjs = await findJjs();
    if (request.settingsBase64) {
      await writeFile(settingsFile, Buffer.from(request.settingsBase64, 'base64'));
    } else if (request.settingsString) {
      if (!jjs) {
        sendJson(res, 503, {
          error: 'sin-jjs',
          message: 'Sin jjs no puedo reconstruir unos ajustes guardados.',
        });
        return;
      }
      const scriptPath = join(workdir, 'desde-cadena.js');
      await writeFile(scriptPath, buildFromStringScript(), 'utf8');
      const rehecho = await run(jjs, [
        '-cp',
        `"${jar}"`,
        `"${scriptPath}"`,
        '--',
        `"${request.settingsString}"`,
        `"${settingsFile}"`,
      ]);
      if (!existsSync(settingsFile)) {
        sendJson(res, 400, {
          error: 'ajustes-invalidos',
          message:
            'Esa semilla no la entiende tu version del randomizer, asi que no puedo rehacer la partida.',
          detalle: (rehecho.stderr || rehecho.stdout).slice(-1500),
        });
        return;
      }
    } else {
      // El fichero de ajustes lo escribe la propia clase Settings del
      // randomizer a traves de jjs: su formato lleva version y suma de
      // comprobacion, y reproducirlo por nuestra cuenta seria fragil.
      if (!jjs) {
        sendJson(res, 503, {
          error: 'sin-jjs',
          message:
            'No encuentro jjs junto a tu Java, asi que no puedo construir los ajustes desde el menu. Exporta un fichero .rnqs del randomizer de escritorio.',
        });
        return;
      }
      // Si ya se construyeron estos mismos ajustes antes, se reusan y nos
      // ahorramos arrancar una JVM solo para esto.
      const clave = claveDeAjustes(chosen);
      const guardados = ajustesEnCache.get(clave);

      if (guardados) {
        await writeFile(settingsFile, guardados);
      } else {
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
        ajustesEnCache.set(clave, await readFile(settingsFile));
      }
    }

    // Con jjs se aleatoriza con una semilla que elegimos nosotros, y esa copia
    // se puede rehacer mas tarde sin guardarla. Sin jjs solo queda su linea de
    // ordenes, que escoge la semilla ella y no deja repetirla: esa partida
    // nace sin semilla, y la interfaz lo dice.
    const semilla = request.seed ?? pickSeed();
    let ajustesUsados: string | null = null;
    let execution: Awaited<ReturnType<typeof run>>;

    if (jjs) {
      const scriptPath = join(workdir, 'aleatorizar.js');
      await writeFile(scriptPath, buildRandomizeScript(), 'utf8');
      execution = await run(jjs, [
        `-J-Xmx${JVM_MEMORIA}`,
        '-cp',
        `"${jar}"`,
        `"${scriptPath}"`,
        '--',
        `"${input}"`,
        `"${settingsFile}"`,
        `"${output}"`,
        semilla,
      ]);
      ajustesUsados = /^AJUSTES:(.+)$/m.exec(execution.stdout)?.[1]?.trim() ?? null;
    } else {
      // Sin jjs tampoco hay busqueda previa que valga: se usa lo que haya.
      execution = await run((await buscarJava()) ?? 'java', [
        `-Xmx${JVM_MEMORIA}`,
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
    }

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

    // El registro queda junto a la salida: de ahi sale el resumen de lo que ha
    // cambiado. La semilla ya la sabemos cuando la elegimos nosotros; solo hay
    // que leerla del registro en la via sin jjs, donde la escoge el randomizer.
    let seed: string | null = jjs ? semilla : null;
    let summary: RandomizeSummary = { changed: [], starters: [], omitidas: [] };
    for (const name of await readdir(workdir)) {
      if (!name.endsWith('.log')) continue;
      const log = await readFile(join(workdir, name), 'utf8');
      seed = seed ?? extractSeed(log);
      summary = { ...summarize(log, chosen), omitidas: omitidas.map((o) => o.label) };
      break;
    }

    const randomized = await readFile(output);
    // Se devuelve comprimida por el mismo motivo: la vuelta gasta la subida de
    // esta maquina, que suele ser lo mas escaso de las dos.
    const payload = await gzip(randomized, { level: 6 });
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'content-length': payload.length,
      [ENCODING_HEADER]: 'gzip',
      ...(seed ? { 'x-seed': seed } : {}),
      // La cadena de ajustes viaja en base64 porque lleva caracteres que una
      // cabecera HTTP no admite tal cual.
      ...(ajustesUsados
        ? { 'x-settings': Buffer.from(ajustesUsados, 'utf8').toString('base64') }
        : {}),
      // Solo se puede rehacer lo que se hizo con semilla elegida.
      'x-reproducible': jjs ? '1' : '0',
      // En base64 porque lleva acentos y las cabeceras HTTP son ASCII.
      'x-summary': Buffer.from(JSON.stringify(summary), 'utf8').toString('base64'),
      // Estas cabeceras deben ser legibles desde el navegador.
      'access-control-expose-headers': `x-seed, x-settings, x-reproducible, x-summary, ${ENCODING_HEADER}`,
    });
    res.end(payload);
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
    soltarTurno?.();
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
        games: Object.keys(SUPPORTED_GAMES),
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

  // Por donde va quien espera. Existe porque la respuesta de /randomize no
  // llega hasta el final: sin esto, esperar veintiocho minutos es
  // indistinguible de estar roto.
  if (req.method === 'GET' && req.url?.startsWith('/cola')) {
    const ticket = new URL(req.url, 'http://localhost').searchParams.get('ticket');
    const puesto = ticket ? cola.puestoDe(ticket) : null;
    sendJson(res, 200, {
      // null cuando ese ticket ya no espera: o le toco, o nunca estuvo.
      puesto,
      ...cola.estado(),
      limite: cola.limite,
    });
    return;
  }

  sendJson(res, 404, { error: 'no-encontrado' });
});

// Solo 127.0.0.1: este servicio maneja la ROM del jugador y no tiene por que
// ser alcanzable desde la red.
server.listen(PORT, HOST, () => {
  console.log(`servicio de aleatorizacion escuchando en ${HOST}:${PORT}`);
  console.log(
    `hasta ${CONCURRENCIA} a la vez, ${MAX_EN_COLA} en cola, ${JVM_MEMORIA} por JVM`,
  );
  void probeJava().then((java) => {
    if (!java.available) console.log('AVISO: no encuentro Java. El randomizer lo necesita.');
    else if (!java.bits64) console.log('AVISO: tu Java es de 32 bits y el randomizer no arrancara.');
    else console.log(`Java ${java.version ?? '?'} de 64 bits: correcto.`);
    if (!existsSync(jarPath())) {
      console.log(`AVISO: falta ${jarPath()}. Lee tools/randomizer/LEEME.md.`);
    }
  });
});

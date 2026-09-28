// Cliente del servicio local de aleatorizacion.
//
// El servicio corre en la maquina del propio jugador y la ROM no sale de ella:
// va del navegador al proceso de al lado, y vuelve. Nunca pasa por internet ni
// llega al companero.

/** Una casilla del menu de aleatorizacion. */
export type RandomizerOption = {
  id: string;
  label: string;
  description: string;
};

export type RandomizerHealth = {
  ok: boolean;
  java: { available: boolean; version: string | null; bits64: boolean };
  jar: { path: string; found: boolean };
  games: string[];
  /** Si se pueden construir los ajustes desde el menu, sin fichero .rnqs. */
  menu: { available: boolean; jjs: string | null };
  options: RandomizerOption[];
};

export type RandomizerStatus =
  | { estado: 'comprobando' }
  /** El servicio no responde: seguramente no esta arrancado. */
  | { estado: 'apagado' }
  /** Responde pero le falta algo para poder trabajar. */
  | { estado: 'incompleto'; motivo: string }
  | { estado: 'listo'; health: RandomizerHealth };

const BASE = '/randomizer';

/**
 * Si el servicio de aleatorizacion corre en OTRO ordenador.
 *
 * Se deduce de donde viene la pagina, que es suficiente y no necesita que el
 * servidor lo cuente: si la sirve localhost, el servicio esta en esta misma
 * maquina; si la sirve el dominio de un tunel, esta en la de quien lo abrio.
 *
 * Importa porque cambia lo que hay que decirle al jugador. En local la ROM no
 * se mueve; a traves de un tunel viaja al ordenador del anfitrion y vuelve, y
 * eso hay que decirlo antes, no despues.
 */
export const randomizerIsRemote = (): boolean =>
  !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(globalThis.location.hostname);

/**
 * Pregunta al servicio si puede trabajar.
 *
 * Distingue entre "no esta arrancado" y "esta arrancado pero le falta Java o el
 * jar", porque lo que tiene que hacer el jugador es distinto en cada caso.
 */
export const checkRandomizer = async (): Promise<RandomizerStatus> => {
  let health: RandomizerHealth;
  try {
    const response = await fetch(`${BASE}/health`);
    if (!response.ok) return { estado: 'apagado' };
    health = (await response.json()) as RandomizerHealth;
  } catch {
    return { estado: 'apagado' };
  }

  if (!health.java.available) {
    return { estado: 'incompleto', motivo: 'No encuentro Java, y el randomizer lo necesita.' };
  }
  if (!health.java.bits64) {
    return {
      estado: 'incompleto',
      motivo: `Tu Java (${health.java.version ?? '?'}) es de 32 bits y el randomizer necesita 64.`,
    };
  }
  if (!health.jar.found) {
    return {
      estado: 'incompleto',
      motivo: `Falta el fichero PokeRandoZX.jar en ${health.jar.path}.`,
    };
  }
  return { estado: 'listo', health };
};

export type RandomizeSummary = {
  /** Apartados que cambiaron de verdad. */
  changed: string[];
  /** Los tres iniciales resultantes, si se aleatorizaron. */
  starters: string[];
};

export type RandomizeResult = {
  rom: Uint8Array;
  /** Semilla que uso el randomizer, si aparecio en su registro. */
  seed: string | null;
  /** Que ha cambiado. Vacio significa que los ajustes no tocaron nada. */
  summary: RandomizeSummary;
};

/**
 * Empaqueta la peticion y la ROM en un solo cuerpo:
 * [4 bytes: longitud del JSON][JSON][ROM].
 *
 * Marco propio en vez de multipart porque los dos extremos son nuestros: se
 * construye en tres lineas y no impone limites de tamano.
 */
const pack = (request: RandomizeRequest, rom: Uint8Array): Uint8Array => {
  const header = new TextEncoder().encode(JSON.stringify(request));
  const body = new Uint8Array(4 + header.length + rom.length);
  new DataView(body.buffer).setUint32(0, header.length, false);
  body.set(header, 4);
  body.set(rom, 4 + header.length);
  return body;
};

export type RandomizeRequest = {
  /** Identificadores marcados en el menu. */
  options?: string[];
  /** Alternativa: un .rnqs exportado del randomizer de escritorio. */
  settingsBase64?: string;
};

export class RandomizerError extends Error {}

/**
 * Cabecera propia, no `Content-Encoding`.
 *
 * La estandar la pueden tocar los intermediarios: el proxy de desarrollo o
 * Cloudflare podrian descomprimir o recomprimir por su cuenta. Con una nuestra,
 * lo que se empaqueta aqui es exactamente lo que se desempaqueta alli.
 */
const ENCODING_HEADER = 'x-body-encoding';

/**
 * Comprimir antes de enviar no es un adorno.
 *
 * Una ROM de GBA baja de 16 MB a algo mas de 5. Por una conexion domestica de
 * subida lenta, eso es la diferencia entre cuatro minutos y poco mas de uno, y
 * comprimir cuesta medio segundo.
 */
const gzip = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const gunzip = async (data: ArrayBuffer): Promise<Uint8Array> => {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

export const randomizeRom = async (
  request: RandomizeRequest,
  rom: Uint8Array,
): Promise<RandomizeResult> => {
  const response = await fetch(`${BASE}/randomize`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      [ENCODING_HEADER]: 'gzip',
    },
    body: (await gzip(pack(request, rom))) as BodyInit,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new RandomizerError(detail?.message ?? `El servicio respondio ${response.status}.`);
  }

  const encoded = response.headers.get('x-summary');
  const payload = await response.arrayBuffer();
  return {
    rom:
      response.headers.get(ENCODING_HEADER) === 'gzip'
        ? await gunzip(payload)
        : new Uint8Array(payload),
    seed: response.headers.get('x-seed'),
    summary: encoded
      ? (JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)))) as RandomizeSummary)
      : { changed: [], starters: [] },
  };
};

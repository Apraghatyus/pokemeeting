// Cliente del servicio local de aleatorizacion.
//
// El servicio corre en la maquina del propio jugador y la ROM no sale de ella:
// va del navegador al proceso de al lado, y vuelve. Nunca pasa por internet ni
// llega al companero.

export type RandomizerHealth = {
  ok: boolean;
  java: { available: boolean; version: string | null; bits64: boolean };
  jar: { path: string; found: boolean };
  games: string[];
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

export type RandomizeResult = {
  rom: Uint8Array;
  /** Semilla que uso el randomizer, si aparecio en su registro. */
  seed: string | null;
};

/**
 * Empaqueta ajustes y ROM en un solo cuerpo:
 * [4 bytes: longitud de los ajustes][ajustes][ROM].
 *
 * Marco propio en vez de multipart porque los dos extremos son nuestros: se
 * construye en tres lineas y no impone limites de tamano a los ajustes.
 */
const pack = (settings: Uint8Array, rom: Uint8Array): Uint8Array => {
  const body = new Uint8Array(4 + settings.length + rom.length);
  new DataView(body.buffer).setUint32(0, settings.length, false);
  body.set(settings, 4);
  body.set(rom, 4 + settings.length);
  return body;
};

export class RandomizerError extends Error {}

export const randomizeRom = async (
  settings: Uint8Array,
  rom: Uint8Array,
): Promise<RandomizeResult> => {
  const response = await fetch(`${BASE}/randomize`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: pack(settings, rom) as BodyInit,
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new RandomizerError(detail?.message ?? `El servicio respondio ${response.status}.`);
  }

  return {
    rom: new Uint8Array(await response.arrayBuffer()),
    seed: response.headers.get('x-seed'),
  };
};

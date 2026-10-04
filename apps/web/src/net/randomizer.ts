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
  /** En que generaciones existe lo que cambia. Gen 2 no tiene habilidades. */
  generaciones: number[];
  /**
   * Opciones con las que esta no puede ir a la vez.
   *
   * Son las que escriben en el mismo ajuste del randomizer: marcarlas juntas no
   * da error, solo hace que gane una sin que nadie sepa cual.
   */
  chocaCon?: string[];
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
  /** Lo que se pidio pero ese juego no tiene. */
  omitidas: string[];
  /** Apartados que cambiaron de verdad. */
  changed: string[];
  /** Los tres iniciales resultantes, si se aleatorizaron. */
  starters: string[];
};

export type RandomizeResult = {
  rom: Uint8Array;
  /** Semilla con la que se genero. Es media receta para rehacerla. */
  seed: string | null;
  /** La otra media: los ajustes exactos, en el formato del randomizer. */
  ajustes: string | null;
  /**
   * Si esta copia se podra rehacer mas adelante.
   *
   * Es false cuando el servicio tuvo que tirar de la linea de ordenes del
   * randomizer, que escoge la semilla ella sola. Entonces la copia existe pero
   * no hay forma de volver a generarla, y eso hay que decirlo.
   */
  reproducible: boolean;
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
  /** Ajustes guardados de una partida que se esta rehaciendo. */
  settingsString?: string;
  /** Semilla concreta: con ella sale la misma copia de siempre. */
  seed?: string;
  /** Con que preguntar por el puesto en la cola. Lo pone `randomizeRom`. */
  ticket?: string;
};

export class RandomizerError extends Error {}

/** Las cabeceras HTTP son ASCII, asi que lo que lleva acentos viaja en base64. */
const desdeBase64 = (texto: string): Uint8Array =>
  Uint8Array.from(atob(texto), (c) => c.charCodeAt(0));

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

/** Por donde va la peticion mientras espera su turno. */
export type PuestoEnCola = {
  /** Cuantos tiene por delante. */
  delante: number;
  /** Cuantas se estan haciendo ahora mismo. */
  atendiendo: number;
  /** Lo que se tarda por copia ultimamente, o null si no se sabe aun. */
  segundosPorCopia: number | null;
};

/**
 * Pregunta por el puesto de un ticket.
 *
 * Devuelve null cuando ese ticket ya no espera, que es lo que pasa en cuanto le
 * toca: a partir de ahi lo que queda es trabajo, no cola.
 */
export const consultarCola = async (ticket: string): Promise<PuestoEnCola | null> => {
  try {
    const r = await fetch(`${BASE}/cola?ticket=${encodeURIComponent(ticket)}`);
    if (!r.ok) return null;
    const datos = (await r.json()) as { puesto: PuestoEnCola | null };
    return datos.puesto;
  } catch {
    // Que falle preguntar no es motivo para romper nada: solo dejamos de contar.
    return null;
  }
};

export const randomizeRom = async (
  request: RandomizeRequest,
  rom: Uint8Array,
  /**
   * Se llama mientras se espera turno, para poder decir cuanta cola hay.
   *
   * Hace falta porque con varios jugadores aleatorizando a la vez la espera deja
   * de ser "un rato" y pasa a ser minutos, y minutos sin noticias son
   * indistinguibles de estar roto: el jugador recarga, vuelve al final de la
   * cola y encima deja trabajo huerfano.
   */
  alEsperar?: (puesto: PuestoEnCola | null) => void,
): Promise<RandomizeResult> => {
  // El ticket lo pone el cliente porque la respuesta no llega hasta el final:
  // si lo repartiera el servidor, no habria con que preguntar justo mientras
  // hace falta.
  const ticket = crypto.randomUUID();

  const peticion = fetch(`${BASE}/randomize`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      [ENCODING_HEADER]: 'gzip',
    },
    body: (await gzip(pack({ ...request, ticket }, rom))) as BodyInit,
  });

  let esperando = true;
  if (alEsperar) {
    void (async () => {
      while (esperando) {
        await new Promise((sigue) => setTimeout(sigue, 1500));
        if (!esperando) break;
        const puesto = await consultarCola(ticket);
        if (!esperando) break;
        // Se pregunta hasta el final y no se para en el primer hueco: un ticket
        // desconocido no significa "ya te toca", tambien significa "todavia no
        // has entrado en la cola". El servidor no te apunta hasta haber recibido
        // los cinco megas de la ROM, asi que las primeras consultas no te
        // encuentran y rendirse ahi deja al jugador sin noticias justo cuando
        // empieza a esperar de verdad.
        alEsperar(puesto);
      }
    })();
  }

  const response = await peticion.finally(() => {
    esperando = false;
  });

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new RandomizerError(detail?.message ?? `El servicio respondio ${response.status}.`);
  }

  const encoded = response.headers.get('x-summary');
  const ajustes = response.headers.get('x-settings');
  const payload = await response.arrayBuffer();
  return {
    rom:
      response.headers.get(ENCODING_HEADER) === 'gzip'
        ? await gunzip(payload)
        : new Uint8Array(payload),
    seed: response.headers.get('x-seed'),
    ajustes: ajustes ? new TextDecoder().decode(desdeBase64(ajustes)) : null,
    reproducible: response.headers.get('x-reproducible') === '1',
    summary: encoded
      ? (JSON.parse(new TextDecoder().decode(desdeBase64(encoded))) as RandomizeSummary)
      : { changed: [], starters: [], omitidas: [] },
  };
};

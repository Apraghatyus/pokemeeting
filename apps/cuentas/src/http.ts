// Las cuatro cosas que hacen falta para atender peticiones a mano.
//
// Sin Express ni nada parecido, igual que las otras dos piezas del servidor.
// Son seis rutas: un marco web entero para esto seria mas codigo que el que
// hay aqui, y una dependencia mas que vigilar en una maquina que esta sola.

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Lo mas grande que se acepta en una peticion.
 *
 * La subida del historial es lo mayor que llega -cincuenta finales con sus
 * equipos-, y eso son unos pocos kilobytes. Un megabyte deja muchisimo margen
 * y a la vez impide que alguien tenga al servidor leyendo para siempre.
 */
const MAX_CUERPO = 1024 * 1024;

export class CuerpoEnorme extends Error {}

/** Lee el cuerpo de la peticion como JSON. */
export const leerJson = async (req: IncomingMessage): Promise<unknown> => {
  const trozos: Buffer[] = [];
  let tamano = 0;

  for await (const trozo of req) {
    tamano += (trozo as Buffer).length;
    if (tamano > MAX_CUERPO) throw new CuerpoEnorme('El cuerpo de la peticion es demasiado grande.');
    trozos.push(trozo as Buffer);
  }

  if (trozos.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(trozos).toString('utf8'));
  } catch {
    throw new SyntaxError('El cuerpo de la peticion no es JSON valido.');
  }
};

/** Contesta con JSON. `galleta` pone o quita la de sesion. */
export const responder = (
  res: ServerResponse,
  codigo: number,
  cuerpo: unknown,
  galleta?: string,
): void => {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
    // Nada de lo que sale de aqui debe quedarse en ninguna cache: todo
    // depende de quien pregunta.
    'Cache-Control': 'no-store',
    ...(galleta ? { 'Set-Cookie': galleta } : {}),
  });
  res.end(texto);
};

/** Un error con su mensaje, que la interfaz ensena tal cual. */
export const fallar = (res: ServerResponse, codigo: number, mensaje: string): void =>
  responder(res, codigo, { error: mensaje });

/**
 * Un texto que viene de la red, o null si no es un texto.
 *
 * Se recorta y se normaliza: dos textos que se ven iguales en pantalla pueden
 * estar escritos con distintos puntos de codigo, y entonces el usuario que
 * alguien cree no es el que escribe luego al entrar.
 */
export const texto = (valor: unknown): string | null =>
  typeof valor === 'string' ? valor.normalize('NFKC').trim() : null;

/**
 * Quien pregunta, para contar intentos.
 *
 * Detras del proxy la direccion del socket es siempre la del proxy, asi que se
 * mira primero X-Forwarded-For. Es una cabecera que puede mentir, y por eso
 * NO se usa para dar permisos: solo para repartir el cupo de intentos.
 */
export const deDondeViene = (req: IncomingMessage): string => {
  const reenviada = req.headers['x-forwarded-for'];
  const primera = Array.isArray(reenviada) ? reenviada[0] : reenviada?.split(',')[0];
  return primera?.trim() || req.socket.remoteAddress || 'desconocido';
};

/**
 * Cuenta intentos por clave y dice si se paso del cupo.
 *
 * En memoria y no en la base: si el servidor se reinicia se perdona todo, y
 * eso es aceptable para lo que vigila. Lo que de verdad detiene es a quien
 * prueba contrasenas en bucle, y ese no reinicia el servidor.
 */
export class Cupo {
  private readonly intentos = new Map<string, { cuantos: number; desde: number }>();

  constructor(
    private readonly maximo: number,
    private readonly ventanaMs: number,
  ) {}

  /** Apunta un intento. Devuelve true si ya se paso. */
  pasado(clave: string): boolean {
    const ahora = Date.now();
    const visto = this.intentos.get(clave);

    if (!visto || ahora - visto.desde > this.ventanaMs) {
      this.intentos.set(clave, { cuantos: 1, desde: ahora });
      return false;
    }

    visto.cuantos += 1;
    return visto.cuantos > this.maximo;
  }

  /** Al acertar se perdona: quien entra bien no arrastra sus fallos. */
  olvidar(clave: string): void {
    this.intentos.delete(clave);
  }

  /** Tira lo viejo, para que el mapa no crezca sin fin. */
  barrer(): void {
    const ahora = Date.now();
    for (const [clave, visto] of this.intentos) {
      if (ahora - visto.desde > this.ventanaMs) this.intentos.delete(clave);
    }
  }
}

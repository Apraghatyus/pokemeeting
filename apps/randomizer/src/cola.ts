// Una cola para las aleatorizaciones.
//
// Cada aleatorizacion arranca una JVM, y hasta ahora nada impedia que hubiera
// doscientas a la vez. Con mil jugadores entrando el mismo dia eso no es una
// hipotesis, y el final no es "va lento": es que la maquina se queda sin
// memoria y caen todas, incluidas las que ya iban por la mitad.
//
// Aceptar de mas tampoco las hace mas rapidas. Medido en una maquina de doce
// nucleos: una a la vez da 0,29 por segundo, cuatro dan 0,54 y ocho dan 0,59.
// Pasado ese punto lo unico que crece es lo que espera cada uno, de 3,5 s a
// 13,5 s. Asi que limitar no es renunciar a rendimiento, es dejar de repartir
// el mismo rendimiento en esperas mas largas.
//
// Lo que si cambia de verdad para quien espera es saber cuanto falta. Veintiocho
// minutos sin noticias es indistinguible de estar roto, asi que la cola sabe
// decir por donde va cada uno.

/** La cola esta tan larga que aceptar otro seria mentirle. */
export class ColaLlena extends Error {
  constructor(enCola: number) {
    super(`Hay ${enCola} esperando ya.`);
    this.name = 'ColaLlena';
  }
}

/** Quien esperaba se fue antes de que llegara su turno. */
export class Abandonada extends Error {
  constructor() {
    super('Se fue antes de su turno.');
    this.name = 'Abandonada';
  }
}

export type Puesto = {
  /** Cuantos tiene por delante. Cero si ya se le esta atendiendo. */
  delante: number;
  /** Cuantas se estan haciendo ahora mismo. */
  atendiendo: number;
  /** Cuantos esperan en total. */
  enCola: number;
  /**
   * Lo que se tarda por copia ultimamente, en segundos, o null si todavia no
   * se ha terminado ninguna. De aqui sale el "faltan unos X minutos".
   */
  segundosPorCopia: number | null;
};

type Espera = {
  ticket: string | null;
  sigue: () => void;
  falla: (error: Error) => void;
};

export class Cola {
  readonly #limite: number;
  readonly #maximo: number;

  /** Cuantos huecos estan ocupados. */
  #atendiendo = 0;

  /** En orden de llegada, que es de donde sale el puesto de cada uno. */
  readonly #esperando: Espera[] = [];

  /** Las ultimas duraciones, para estimar la espera sin guardar un historial. */
  readonly #ultimas: number[] = [];

  /**
   * @param limite Cuantas a la vez. Mas no va mas rapido.
   * @param maximo Cuantos pueden esperar antes de empezar a rechazar.
   */
  constructor(limite: number, maximo: number) {
    this.#limite = Math.max(1, limite);
    this.#maximo = Math.max(1, maximo);
  }

  get limite(): number {
    return this.#limite;
  }

  /**
   * Pide el turno y devuelve la funcion con la que se suelta al terminar.
   *
   * La senal sirve para soltar a quien cierra la pestana mientras espera: su
   * aleatorizacion no debe llegar a arrancar, porque nadie va a recogerla.
   */
  async turno(ticket: string | null, senal?: AbortSignal): Promise<() => void> {
    if (senal?.aborted) throw new Abandonada();

    // Hay hueco: se coge y se entra directo.
    if (this.#atendiendo < this.#limite) {
      this.#atendiendo += 1;
      return this.#soltar();
    }

    if (this.#esperando.length >= this.#maximo) throw new ColaLlena(this.#esperando.length);

    await new Promise<void>((sigue, falla) => {
      const espera: Espera = { ticket, sigue, falla };
      this.#esperando.push(espera);

      senal?.addEventListener(
        'abort',
        () => {
          const donde = this.#esperando.indexOf(espera);
          // Si ya le habian dado el turno, no hay nada que cancelar: de eso se
          // encarga quien lo suelte.
          if (donde >= 0) {
            this.#esperando.splice(donde, 1);
            falla(new Abandonada());
          }
        },
        { once: true },
      );
    });

    // El hueco no se cuenta aqui: viene ya contado de quien lo cedio.
    return this.#soltar();
  }

  /**
   * Suelta el hueco, una sola vez aunque se llame dos.
   *
   * El hueco se le pasa **directamente** al siguiente en vez de liberarse y
   * dejar que lo pida: entre liberar y que el otro lo pidiera hay un salto de
   * microtarea, y una peticion que llegara justo ahi se colaria por encima del
   * limite.
   */
  #soltar(): () => void {
    const empezo = Date.now();
    let soltado = false;

    return () => {
      if (soltado) return;
      soltado = true;
      this.#apuntarDuracion((Date.now() - empezo) / 1000);

      const siguiente = this.#esperando.shift();
      if (siguiente) siguiente.sigue();
      else this.#atendiendo -= 1;
    };
  }

  /** Media movil corta: lo de hace media hora ya no dice nada de ahora. */
  #apuntarDuracion(segundos: number): void {
    this.#ultimas.push(segundos);
    if (this.#ultimas.length > 20) this.#ultimas.shift();
  }

  #segundosPorCopia(): number | null {
    if (this.#ultimas.length === 0) return null;
    const suma = this.#ultimas.reduce((a, b) => a + b, 0);
    return Math.round((suma / this.#ultimas.length) * 10) / 10;
  }

  /** Por donde va este ticket, o null si no lo conocemos. */
  puestoDe(ticket: string): Puesto | null {
    const donde = this.#esperando.findIndex((e) => e.ticket === ticket);
    if (donde < 0) return null;
    return {
      delante: donde,
      atendiendo: this.#atendiendo,
      enCola: this.#esperando.length,
      segundosPorCopia: this.#segundosPorCopia(),
    };
  }

  /** Como va la cola en general. */
  estado(): Puesto {
    return {
      delante: 0,
      atendiendo: this.#atendiendo,
      enCola: this.#esperando.length,
      segundosPorCopia: this.#segundosPorCopia(),
    };
  }
}

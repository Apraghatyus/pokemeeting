// Las cuentas: lo que el navegador y el servidor tienen que entender igual.
//
// Vive en el protocolo y no en el servidor porque las reglas de un usuario y
// de una contrasena hay que aplicarlas DOS veces: en el formulario, para poder
// decirlo antes de enviar nada, y en el servidor, porque lo que llega por la
// red no se cree. Escritas dos veces acaban siendo dos reglas distintas, y el
// dia que se separan el formulario acepta algo que el servidor rechaza.
//
// QUE NO HAY AQUI: nada del juego. Una cuenta es un nombre, una contrasena y
// un apodo. Las ROMs siguen sin salir del ordenador de nadie, y eso no cambia
// porque ahora haya donde iniciar sesion.

/** Lo maximo que puede medir un nombre de usuario. */
export const MAX_USUARIO = 20;

/** Y lo minimo, para que no haya usuarios de una letra. */
export const MIN_USUARIO = 3;

/**
 * Lo minimo que puede medir una contrasena.
 *
 * Ocho es lo que recomienda el NIST como minimo absoluto. No se exige mezcla
 * de mayusculas, numeros y simbolos a proposito: esas reglas no hacen las
 * contrasenas mejores, hacen que la gente escriba "Password1!" y la apunte en
 * un papel.
 */
export const MIN_CLAVE = 8;

/**
 * Y lo maximo.
 *
 * No es por falta de sitio -se guarda el resumen, que mide siempre igual- sino
 * porque descifrar una contrasena cuesta trabajo a proposito: aceptar una de
 * diez megas seria regalarle a cualquiera una forma de tumbar el servidor
 * escribiendo mucho.
 */
export const MAX_CLAVE = 200;

/**
 * Como puede ser un nombre de usuario.
 *
 * Letras sin acentos, numeros, punto, guion y guion bajo. Sin espacios, que
 * hacen imposible distinguir "Juan Cardona" de "Juan  Cardona", y sin acentos,
 * que harian que la misma persona pudiera escribir su nombre de dos formas.
 * El apodo, que es lo que se ensena, si los admite: ese no identifica a nadie.
 */
const FORMA_USUARIO = /^[a-zA-Z0-9._-]+$/;

/**
 * El nombre con el que se busca una cuenta.
 *
 * "JuanCardona" y "juancardona" son la misma persona, asi que se comparan en
 * minusculas. Lo que se ensena es como lo escribio su dueno; lo que se compara
 * es esto.
 */
export const normalizarUsuario = (usuario: string): string =>
  usuario.trim().toLowerCase();

/** Que le pasa a un nombre de usuario, o null si esta bien. */
export const problemaDelUsuario = (usuario: string): string | null => {
  const limpio = usuario.trim();
  if (limpio.length < MIN_USUARIO) return `El usuario necesita al menos ${MIN_USUARIO} letras.`;
  if (limpio.length > MAX_USUARIO) return `El usuario no puede pasar de ${MAX_USUARIO} letras.`;
  if (!FORMA_USUARIO.test(limpio)) {
    return 'El usuario solo admite letras sin acentos, numeros, punto, guion y guion bajo.';
  }
  return null;
};

/** Que le pasa a una contrasena, o null si esta bien. */
export const problemaDeLaClave = (clave: string): string | null => {
  if (clave.length < MIN_CLAVE) return `La contrasena necesita al menos ${MIN_CLAVE} caracteres.`;
  if (clave.length > MAX_CLAVE) return `La contrasena no puede pasar de ${MAX_CLAVE} caracteres.`;
  return null;
};

/** Quien eres, tal y como lo cuenta el servidor. */
export type Cuenta = {
  id: string;
  /** Como lo escribio su dueno, que es lo que se ensena. */
  usuario: string;
  /** El nombre con el que sale en la sala y en el ranking. */
  apodo: string;
  /** Cuando se creo la cuenta. */
  creada: string;
};

/** Lo que se sube de una partida guardada al iniciar sesion. */
export type PartidaParaSubir = {
  fichero: string;
  nombre: string | null;
  juego: string | null;
  generacion: number | null;
  baseCrc32: string;
  crc32: string | null;
  semilla: string | null;
  ajustes: string | null;
  cambiado: string[];
  creada: number;
  jugada: number;
};

/** Y lo que se sube de una partida terminada. */
export type FinalParaSubir = {
  id: string;
  partida: string;
  cuando: number;
  resultado: 'victoria' | 'derrota' | 'descartada';
  porElEnlace: boolean;
  medallas: number | null;
  equipo: {
    especie: number;
    mote: string;
    nivel: number;
    movimientos: number[];
    caido: boolean;
  }[];
};

/**
 * Cuanto se admite de una vez.
 *
 * El navegador guarda como mucho tres partidas y cincuenta finales, asi que
 * esto no aprieta a nadie: esta para que una peticion inventada no pueda pedir
 * que se escriban cien mil filas.
 */
export const MAX_SUBIDA_PARTIDAS = 50;
export const MAX_SUBIDA_FINALES = 200;

/** Lo que contesta el servidor despues de subir. */
export type ResultadoDeSubida = {
  partidas: { nuevas: number; actualizadas: number };
  finales: { nuevos: number; repetidos: number };
};

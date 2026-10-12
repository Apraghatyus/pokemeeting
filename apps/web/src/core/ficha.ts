// Hablar con el servidor sobre tu ficha y tus amigos.
//
// Todo lo de aqui necesita sesion iniciada, menos pedir la foto de alguien:
// esa es publica, como el ranking, porque es la cara que enseña en la tabla.

export type Estado = 'en-partida' | 'disponible' | 'desconectado';

export type Amigo = {
  apodo: string;
  tag: string;
  estado: Estado;
  juego: string | null;
  conFoto: boolean;
};

export type Solicitud = {
  id: string;
  apodo: string;
  tag: string;
  conFoto: boolean;
};

export type Perfil = {
  usuario: string;
  apodo: string;
  tag: string;
  lema: string | null;
  favorito: number | null;
  conFoto: boolean;
  creada: string;
  partidas: number;
  victorias: number;
  derrotas: number;
  descartadas: number;
  porcentaje: number | null;
  masJugado: { juego: string; partidas: number } | null;
};

const RAIZ = '/cuentas';

export class FalloDeFicha extends Error {}

const pedir = async <T>(ruta: string, opciones: RequestInit = {}): Promise<T> => {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${RAIZ}${ruta}`, {
      ...opciones,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-Emupoke': '1', ...opciones.headers },
    });
  } catch {
    throw new FalloDeFicha('No se puede hablar con el servidor.');
  }
  const datos: unknown = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new FalloDeFicha((datos as { error?: string }).error ?? 'Algo fallo.');
  }
  return datos as T;
};

export const miPerfil = async (): Promise<Perfil | null> => {
  try {
    const { perfil } = await pedir<{ perfil: Perfil | null }>('/perfil');
    return perfil;
  } catch {
    return null;
  }
};

export const guardarPerfil = async (cambios: {
  apodo?: string;
  lema?: string | null;
  favorito?: number | null;
}): Promise<Perfil> => {
  const { perfil } = await pedir<{ perfil: Perfil }>('/perfil', {
    method: 'POST',
    body: JSON.stringify(cambios),
  });
  return perfil;
};

export const cambiarClave = async (actual: string, nueva: string): Promise<void> => {
  await pedir('/clave', { method: 'POST', body: JSON.stringify({ actual, nueva }) });
};

export const subirAvatar = async (imagen: string): Promise<void> => {
  await pedir('/avatar', { method: 'POST', body: JSON.stringify({ imagen }) });
};

export const misAmigos = async (): Promise<{ amigos: Amigo[]; solicitudes: Solicitud[] }> =>
  pedir('/amigos');

export const solicitarAmigo = async (apodo: string, tag: string) =>
  pedir<{ amigos: Amigo[]; solicitudes: Solicitud[] }>('/amigos/solicitar', {
    method: 'POST',
    body: JSON.stringify({ apodo, tag }),
  });

export const responderSolicitud = async (id: string, aceptar: boolean) =>
  pedir<{ amigos: Amigo[]; solicitudes: Solicitud[] }>('/amigos/responder', {
    method: 'POST',
    body: JSON.stringify({ id, aceptar }),
  });

export const quitarAmigo = async (apodo: string, tag: string) =>
  pedir<{ amigos: Amigo[]; solicitudes: Solicitud[] }>('/amigos/quitar', {
    method: 'POST',
    body: JSON.stringify({ apodo, tag }),
  });

/** Avisa de que sigues aqui, y de a que juegas. */
export const latir = async (juego: string | null, enSala: boolean): Promise<void> => {
  try {
    await pedir('/presencia', { method: 'POST', body: JSON.stringify({ juego, enSala }) });
  } catch {
    // Un latido perdido no es nada: el siguiente lo arregla.
  }
};

/** La direccion de la foto de alguien. */
export const fotoDe = (apodo: string, tag: string, desde?: string | null): string =>
  `${RAIZ}/avatar/${encodeURIComponent(`${apodo}#${tag}`)}${desde ? `?v=${desde}` : ''}`;

/**
 * Deja una imagen lista para subir: cuadrada, de 256 px y en JPEG.
 *
 * Se recorta AQUI y no en el servidor por dos razones. La primera es el peso:
 * una foto del movil son cuatro megas y lo que se va a ver es un circulo de
 * cuarenta pixeles. La segunda es que asi lo que viaja es una imagen que ya
 * hemos dibujado nosotros, no el fichero que eligio el usuario: lo que llegue
 * al servidor es un JPEG y nada mas.
 */
export const prepararFoto = (fichero: File): Promise<string> =>
  new Promise((listo, fallo) => {
    const lector = new FileReader();
    lector.onerror = () => fallo(new FalloDeFicha('No he podido leer esa imagen.'));
    lector.onload = () => {
      const imagen = new Image();
      imagen.onerror = () => fallo(new FalloDeFicha('Eso no parece una imagen.'));
      imagen.onload = () => {
        const LADO = 256;
        const lienzo = document.createElement('canvas');
        lienzo.width = LADO;
        lienzo.height = LADO;
        const pincel = lienzo.getContext('2d');
        if (!pincel) {
          fallo(new FalloDeFicha('Este navegador no me deja recortar la imagen.'));
          return;
        }
        // Recorte cuadrado por el centro: es lo que se ve en un circulo, y
        // deformar la foto para que quepa entera queda peor que recortarla.
        const lado = Math.min(imagen.width, imagen.height);
        pincel.drawImage(
          imagen,
          (imagen.width - lado) / 2,
          (imagen.height - lado) / 2,
          lado,
          lado,
          0,
          0,
          LADO,
          LADO,
        );
        listo(lienzo.toDataURL('image/jpeg', 0.85));
      };
      imagen.src = String(lector.result);
    };
    lector.readAsDataURL(fichero);
  });

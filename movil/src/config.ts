// Donde viven los servicios: los mismos que usa la web en produccion.

export const ORIGEN = 'https://emupoke.aguaquim.com';

/** El enlace de una invitacion: lo mismo que arma la web. */
export const enlaceDeInvitacion = (sala: string, clave: string) =>
  `${ORIGEN}/#${sala}:${encodeURIComponent(clave)}`;

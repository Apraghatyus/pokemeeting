// Las invitaciones: el mismo enlace que la web (emupoke.aguaquim.com/#SALA:clave)
// abre la app si esta instalada, y desde la app se comparte uno igual.
//
// La semilla no viaja en el enlace: la guarda la sala y se pide con el codigo
// (`ask-room`), igual que hace la web.

import type {ClientMessage, DatosDeSala, ServerMessage} from '@emupoke/protocol';
import {leerInvitacion, type Invitacion} from '../../apps/web/src/core/invitacion';
import {URL_SALAS} from './sala';

/** La invitacion de un enlace, o null si no es uno. */
export const invitacionDeEnlace = (url: string | null): Invitacion | null => {
  if (!url) return null;
  const almohadilla = url.indexOf('#');
  return almohadilla < 0 ? null : leerInvitacion(url.slice(almohadilla));
};

/** Lo que hay en una sala: a que se juega, quien la monto y su semilla. */
export const preguntarSala = (codigo: string): Promise<DatosDeSala | null> =>
  new Promise(resolver => {
    const ws = new WebSocket(URL_SALAS);
    const terminar = (datos: DatosDeSala | null) => {
      clearTimeout(reloj);
      ws.onmessage = null;
      ws.close();
      resolver(datos);
    };
    const reloj = setTimeout(() => terminar(null), 8000);
    ws.onopen = () => ws.send(JSON.stringify({type: 'ask-room', roomCode: codigo} satisfies ClientMessage));
    ws.onerror = () => terminar(null);
    ws.onmessage = evento => {
      try {
        const m = JSON.parse(String(evento.data)) as ServerMessage;
        if (m.type === 'room-info') terminar(m.datos);
        else if (m.type === 'error') terminar(null);
      } catch {
        terminar(null);
      }
    };
  });

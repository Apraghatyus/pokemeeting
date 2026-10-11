// Entrar, o crear una cuenta.
//
// Lo primero que dice esta pantalla, y por eso esta arriba del todo: tener
// cuenta NO hace falta para jugar. Sirve para que el historial deje de vivir
// en un solo navegador y para que algun dia haya un ranking. Quien no la
// quiera no pierde nada de lo que ya tenia.
//
// Las reglas del usuario y de la contrasena salen de @emupoke/protocol, que es
// el mismo sitio del que las saca el servidor. Escritas aqui a mano acabarian
// separandose, y entonces el formulario aceptaria cosas que el servidor
// rechaza.

import { useState } from 'react';
import {
  MAX_APODO,
  MAX_USUARIO,
  MIN_CLAVE,
  problemaDeLaClave,
  problemaDelUsuario,
} from '@emupoke/protocol';
import { apodoGuardado } from '../core/apodo';
import type { EstadoDeCuenta } from '../core/useCuenta';
import { Modal } from './Modal';

type Props = {
  open: boolean;
  onClose: () => void;
  cuenta: EstadoDeCuenta;
};

export const CuentaModal = ({ open, onClose, cuenta }: Props) => {
  const [modo, setModo] = useState<'entrar' | 'crear'>('entrar');
  const [usuario, setUsuario] = useState('');
  const [clave, setClave] = useState('');
  // Con el apodo que ya usaba en las salas: si lleva meses siendo "Juan" para
  // su companero, no tiene sentido pedirle que se invente otro nombre.
  const [apodo, setApodo] = useState(() => apodoGuardado() ?? '');
  const [problema, setProblema] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const limpiar = () => {
    setClave('');
    setProblema(null);
  };

  const enviar = async (evento: React.FormEvent) => {
    evento.preventDefault();
    if (trabajando) return;

    // Lo que se puede decir sin preguntar al servidor, se dice sin preguntar.
    const mal = problemaDelUsuario(usuario) ?? problemaDeLaClave(clave);
    if (modo === 'crear' && mal) {
      setProblema(mal);
      return;
    }

    setTrabajando(true);
    setProblema(null);
    try {
      if (modo === 'crear') await cuenta.registrar(usuario, clave, apodo || null);
      else await cuenta.entrar(usuario, clave);
      limpiar();
      onClose();
    } catch (error) {
      setProblema((error as Error).message);
    } finally {
      setTrabajando(false);
    }
  };

  const dentro = cuenta.cuenta;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="◈"
      title={dentro ? 'Tu cuenta' : 'Entrar'}
      subtitle={dentro ? dentro.usuario : 'Para llevarte tu historial'}
    >
      {dentro ? (
        <div className="cuenta">
          <p className="cuenta__quien">
            Has entrado como <strong>{dentro.apodo}</strong>
          </p>

          {cuenta.subido && (
            <p className="hint">
              {cuenta.subido.partidas === 0 && cuenta.subido.finales === 0
                ? 'No habia nada nuevo que subir: tu historial ya estaba al dia.'
                : `Se subieron ${cuenta.subido.finales} partidas terminadas y ` +
                  `${cuenta.subido.partidas} partidas guardadas.`}
            </p>
          )}

          <p className="hint">
            Lo que se sube son tus partidas terminadas y la semilla de las guardadas. Ni la ROM
            ni el guardado salen de este ordenador.
          </p>

          <button
            type="button"
            className="button--wide"
            disabled={trabajando}
            onClick={() => {
              setTrabajando(true);
              void cuenta.salir().finally(() => setTrabajando(false));
            }}
          >
            Cerrar sesion
          </button>
        </div>
      ) : (
        <>
          <div className="tabs">
            <button
              type="button"
              className={modo === 'entrar' ? 'is-active' : undefined}
              onClick={() => {
                setModo('entrar');
                limpiar();
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              className={modo === 'crear' ? 'is-active' : undefined}
              onClick={() => {
                setModo('crear');
                limpiar();
              }}
            >
              Crear cuenta
            </button>
          </div>

          <form className="form" onSubmit={(evento) => void enviar(evento)}>
            <label>
              Usuario
              <input
                value={usuario}
                onChange={(evento) => setUsuario(evento.target.value)}
                placeholder="Como vas a entrar"
                maxLength={MAX_USUARIO}
                autoComplete="username"
                spellCheck={false}
              />
            </label>

            {modo === 'crear' && (
              <label>
                Tu nombre <span className="hint hint--linea">como te veran</span>
                <input
                  value={apodo}
                  onChange={(evento) => setApodo(evento.target.value)}
                  placeholder="Como quieres que te llamen"
                  maxLength={MAX_APODO}
                  autoComplete="nickname"
                />
              </label>
            )}

            <label>
              Contrasena
              <input
                type="password"
                value={clave}
                onChange={(evento) => setClave(evento.target.value)}
                placeholder={modo === 'crear' ? `Al menos ${MIN_CLAVE} caracteres` : 'La tuya'}
                autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
              />
            </label>

            <button
              type="submit"
              className="button--primary"
              disabled={trabajando || !usuario || !clave}
            >
              {trabajando ? '···' : modo === 'crear' ? 'Crear cuenta' : 'Entrar'}
            </button>
          </form>

          {/* Lo que de verdad hay que saber antes de crear una cuenta, y no
              despues: que no hace falta, y que no se sube el juego. */}
          <p className="hint">
            No hace falta cuenta para jugar. Sirve para que tu historial no viva solo en este
            navegador. Ni las ROMs ni los guardados se suben nunca.
          </p>

          {/* Sin correo no hay forma de recuperarla, y eso se dice antes de
              elegirla, no el dia que se olvida. */}
          {modo === 'crear' && (
            <p className="hint">
              No se pide correo, asi que no hay forma de recuperar la contrasena si se te olvida.
              Apuntala en algun sitio.
            </p>
          )}

          {problema && (
            <p className="alert" role="alert">
              {problema}
            </p>
          )}
        </>
      )}
    </Modal>
  );
};

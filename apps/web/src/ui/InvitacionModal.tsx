// Lo que ve quien abre un enlace de invitacion.
//
// Es la primera pantalla que va a ver gente que no ha usado esto nunca: le han
// mandado un enlace por WhatsApp y lo ha pulsado. Asi que no se le pide un
// codigo, ni una contrasena, ni una semilla -todo eso viene en el enlace- y lo
// unico que se le pide es lo unico que NO puede venir en el enlace: su propia
// copia del juego.
//
// Y despues un solo boton. Detras de ese boton pasan tres cosas que antes habia
// que hacer a mano y en orden: se rehace el mundo que juega quien invita a
// partir de su semilla, se carga, y se entra en la sala. Hacerlas por separado
// era lo que hacia que la gente acabara en dos mundos distintos sin entender
// por que.

import { useEffect, useState, type RefObject } from 'react';
import { parseGameCode } from '@emupoke/pokemon';
import type { Invitacion } from '../core/invitacion';
import { partidasDe, type PartidaGuardada } from '../core/partidas';
import { rehacerDesdeSemilla, type BaseRom } from '../core/rehacer';
import type { PuestoEnCola } from '../net/randomizer';
import { Modal } from './Modal';
import { RomDropZone } from './RomDropZone';
import { textoDeEspera } from './RandomizerModal';

type Props = {
  /** La invitacion que traia la direccion, o null si no habia ninguna. */
  invitacion: Invitacion | null;
  onClose: () => void;
  /** La ROM original que haya puesto el jugador. */
  baseRom: RefObject<BaseRom | null>;
  /** Codigo del juego que esta cargado, para saber de que juego es la partida. */
  gameCode: string | null;
  /** CRC de la copia que corre ahora mismo, si hay alguna. */
  romCrc32: string | null;
  /** Si el nucleo ya puede recibir una ROM. */
  nucleoListo: boolean;
  /** Que decir mientras el nucleo arranca. */
  hint: string;
  onRom: (file: File) => void;
  /** Carga una copia recien generada. */
  onRandomized: (bytes: Uint8Array, fileName: string) => Promise<void>;
  /** Abre una copia que ya estaba en este navegador. */
  onContinuar: (fichero: string) => Promise<void>;
  /** Si la copia de una partida sigue estando. */
  existeGuardada: (fichero: string) => boolean;
  /** Entra en la sala. Lo hace quien tiene la sesion, no este modal. */
  onUnirse: (sala: string, clave: string) => Promise<void>;
};

type Fase =
  | { nombre: 'esperando' }
  | { nombre: 'rehaciendo'; cola?: PuestoEnCola | null }
  | { nombre: 'entrando' }
  | { nombre: 'error'; mensaje: string };

export const InvitacionModal = ({
  invitacion,
  onClose,
  baseRom,
  gameCode,
  romCrc32,
  nucleoListo,
  hint,
  onRom,
  onRandomized,
  onContinuar,
  existeGuardada,
  onUnirse,
}: Props) => {
  const [fase, setFase] = useState<Fase>({ nombre: 'esperando' });

  // Poner una ROM despues de un error limpia el error: si no, el aviso de "esa
  // semilla es de otra copia" se quedaba en pantalla sobre la ROM nueva, que es
  // justo cuando deja de ser verdad.
  useEffect(() => {
    if (romCrc32) setFase((actual) => (actual.nombre === 'error' ? { nombre: 'esperando' } : actual));
  }, [romCrc32]);

  if (!invitacion) return null;

  const base = baseRom.current;
  const semilla = invitacion.semilla;
  const juego = gameCode !== null ? parseGameCode(gameCode).game : null;

  // La semilla trae el CRC de la ROM original con la que se creo. Si no es la
  // misma, el mundo saldria distinto, asi que se dice ANTES de dejar pulsar el
  // boton y no despues de un minuto generando.
  const otraRom = base !== null && semilla !== null && semilla.baseCrc32 !== base.crc32;

  /**
   * La copia que pide la semilla, si ya esta en este navegador.
   *
   * Vale la pena mirarlo: rehacer un mundo son minutos, y quien vuelve a abrir
   * el enlace al dia siguiente -o se recarga la pagina- ya lo tiene hecho.
   */
  const yaHecha: PartidaGuardada | null =
    semilla === null
      ? null
      : (partidasDe(semilla.baseCrc32).find(
          (p) => p.crc32 === semilla.crc32 && existeGuardada(p.fichero),
        ) ?? null);

  /** Si lo que corre ahora ya es el mundo del enlace, no hay nada que generar. */
  const yaPuesta = semilla !== null && romCrc32 === semilla.crc32;

  const trabajando = fase.nombre === 'rehaciendo' || fase.nombre === 'entrando';
  const sePuede = base !== null && !otraRom && !trabajando;

  const entrar = async () => {
    try {
      // 1. El mismo mundo que juega quien invita. Sin semilla no hay nada que
      //    rehacer: quien invita juega su ROM tal cual.
      if (semilla && !yaPuesta) {
        if (yaHecha) {
          setFase({ nombre: 'rehaciendo' });
          await onContinuar(yaHecha.fichero);
        } else if (base) {
          setFase({ nombre: 'rehaciendo' });
          await rehacerDesdeSemilla({
            base,
            semilla,
            juego: { label: juego?.label ?? null, generacion: juego?.generacion ?? null },
            cargar: onRandomized,
            alEsperar: (cola) =>
              setFase((actual) => (actual.nombre === 'rehaciendo' ? { nombre: 'rehaciendo', cola } : actual)),
          });
        }
      }

      // 2. Y a la sala. El codigo y la contrasena venian en el enlace, asi que
      //    aqui no hay nada que escribir.
      setFase({ nombre: 'entrando' });
      await onUnirse(invitacion.sala, invitacion.clave);
      onClose();
    } catch (error) {
      setFase({
        nombre: 'error',
        mensaje: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Modal
      open
      onClose={trabajando ? () => {} : onClose}
      icon="((•))"
      title="Te han invitado a jugar"
      subtitle={`Sala ${invitacion.sala}`}
    >
      {/* Lo primero, porque es lo unico que se le pide y lo unico que el enlace
          no puede traer. La ley es la ley: aqui no se reparten juegos. */}
      {base && (
        <div className="invite">
          <span className="invite__label">Tu copia</span>
          <strong className="invite__file" title={base.fileName}>
            {base.fileName}
          </strong>
        </div>
      )}

      {otraRom && (
        <p className="alert" role="alert">
          Tu copia del juego no es la misma con la que se creo este mundo, asi que la semilla
          daria algo distinto. Hace falta exactamente la misma ROM original.
        </p>
      )}

      {/* La zona de carga vuelve a salir si la copia puesta no sirve. Sin esto
          quedaba un callejon sin salida: el aviso decia que hacia falta otra ROM
          y no habia por donde ponerla. */}
      {!base || otraRom ? (
        <>
          <p className="hint">
            {otraRom
              ? 'Prueba con otra copia del juego.'
              : semilla
                ? 'Pon tu propia copia del juego. Con ella se rehace exactamente el mismo mundo que esta jugando quien te invita.'
                : 'Pon tu propia copia del juego para entrar en la sala.'}
          </p>
          <RomDropZone onRom={onRom} disabled={!nucleoListo} hint={hint} />
        </>
      ) : (
        <>
          <p className="hint">
              {!semilla
                ? 'Quien te invita juega su ROM tal cual, asi que no hay nada que generar.'
                : yaPuesta
                  ? 'Ya tienes puesto ese mundo: se entra directamente.'
                  : yaHecha
                    ? 'Ese mundo ya esta en este navegador, asi que no hay que volver a generarlo.'
                    : 'Se va a generar el mismo mundo que juega quien te invita. Tarda un rato y puedes dejar la pestana abierta.'}
          </p>

          <button
            type="button"
            className="button--primary button--wide"
            disabled={!sePuede}
            onClick={() => void entrar()}
          >
            {fase.nombre === 'rehaciendo'
              ? 'Preparando el mundo...'
              : fase.nombre === 'entrando'
                ? 'Entrando...'
                : 'Unirme a la sala'}
          </button>

          {fase.nombre === 'rehaciendo' && fase.cola && (
            <p className="hint" role="status">
              {textoDeEspera(fase.cola)}
            </p>
          )}

          {fase.nombre === 'error' && (
            <p className="alert" role="alert">
              {fase.mensaje}
            </p>
          )}
        </>
      )}

      {/* Quien llega por un enlace no sabe que es esto. Una linea basta. */}
      <p className="hint">
        Cada uno juega su propia copia en su ordenador: lo que se comparte es la pantalla, la voz y
        los intercambios, nunca el juego.
      </p>
    </Modal>
  );
};

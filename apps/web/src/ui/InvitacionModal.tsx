// Lo que ve quien abre un enlace de invitacion.
//
// Es la primera pantalla que va a ver gente que no ha usado esto nunca: le han
// mandado un enlace por WhatsApp y lo ha pulsado. Asi que no se le pide un
// codigo, ni una contrasena, ni una semilla -todo eso lo trae el enlace o lo
// dice la sala- y lo unico que se le pide es lo unico que no puede venir de
// ninguna de las dos: su propia copia del juego.
//
// Y SE LE DICE CUAL. Antes se le pedia "tu ROM" a secas, y quien ponia otra
// edicion se enteraba despues de haberla buscado. Ahora se le pregunta a la sala
// a que se juega y se le dice el nombre antes de que vaya a por el fichero.
//
// LA SEGUNDA VEZ NO ES COMO LA PRIMERA. El mismo enlace se reenvia dias despues
// para seguir la partida de siempre: el lunes se quedaron en el segundo gimnasio
// y el jueves vuelven. Entonces el mundo ya esta aqui, con su guardado dentro, y
// lo que hace falta es ELEGIR: seguir esa partida o empezar otra en el mismo
// mundo. Se elige como en el aleatorizador, con la misma lista de siempre,
// porque es la misma decision.
//
// POR QUE "EMPEZAR UNA NUEVA" NO ABRE LAS OPCIONES DEL ALEATORIZADOR. Porque
// elegir opciones aqui seria generar OTRO mundo, y entonces los dos amigos
// volverian a estar en sitios distintos: justo lo que el enlace vino a resolver.
// El mundo de una invitacion lo decide quien invita, y lo que se elige aqui es
// solo si se empieza de cero en el o se sigue lo que habia.

import { useEffect, useState, type RefObject } from 'react';
import { describeGame, parseGameCode } from '@emupoke/pokemon';
import type { Invitacion } from '../core/invitacion';
import { cuando, nombreDePartida, partidasDe, tocar, type PartidaGuardada } from '../core/partidas';
import { rehacerDesdeSemilla, type BaseRom } from '../core/rehacer';
import { descodificarSemilla, type Semilla } from '../core/semilla';
import { consultarSala } from '../net/signalingClient';
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
  /** Nombre del fichero que corre ahora mismo, si hay alguno. */
  romName: string | null;
  /** Si el nucleo ya puede recibir una ROM. */
  nucleoListo: boolean;
  /** Que decir mientras el nucleo arranca. */
  hint: string;
  onRom: (file: File) => void;
  /** Carga una copia recien generada. */
  onRandomized: (bytes: Uint8Array, fileName: string) => Promise<void>;
  /** Abre una partida que ya estaba en este navegador, con su guardado. */
  onContinuar: (fichero: string) => Promise<void>;
  /** Si la copia de una partida sigue estando. */
  existeGuardada: (fichero: string) => boolean;
  /** Entra en la sala. Lo hace quien tiene la sesion, no este modal. */
  onUnirse: (sala: string, clave: string) => Promise<void>;
};

type Fase =
  | { nombre: 'esperando' }
  | { nombre: 'preparando'; cola?: PuestoEnCola | null }
  | { nombre: 'entrando' }
  | { nombre: 'error'; mensaje: string };

/** Lo que dice la sala de si misma, o null mientras no ha contestado. */
type DeLaSala = { gameCode: string; title: string; semilla: Semilla | null } | null;

export const InvitacionModal = ({
  invitacion,
  onClose,
  baseRom,
  gameCode,
  romName,
  nucleoListo,
  hint,
  onRom,
  onRandomized,
  onContinuar,
  existeGuardada,
  onUnirse,
}: Props) => {
  const [fase, setFase] = useState<Fase>({ nombre: 'esperando' });
  const [sala, setSala] = useState<DeLaSala>(null);

  // Se le pregunta a la sala a que se juega y con que mundo. Es lo que permite
  // que el enlace sea corto -la semilla ya no va dentro- y lo que permite decir
  // que ROM hace falta antes de que nadie busque un fichero.
  const codigo = invitacion?.sala ?? null;
  useEffect(() => {
    if (!codigo) return;
    let sigueInteresando = true;
    void consultarSala(codigo).then((datos) => {
      if (!sigueInteresando || !datos) return;
      setSala({
        gameCode: datos.gameCode,
        title: datos.title,
        semilla: datos.semilla ? descodificarSemilla(datos.semilla) : null,
      });
    });
    return () => {
      sigueInteresando = false;
    };
  }, [codigo]);

  if (!invitacion) return null;

  const base = baseRom.current;
  // Del enlace si lo trae -los de antes la llevaban dentro- y si no, de la sala.
  const semilla = invitacion.semilla ?? sala?.semilla ?? null;
  const juego = gameCode !== null ? parseGameCode(gameCode).game : null;

  /** Como se llama el juego al que se juega ahi, para poder pedirlo por su nombre. */
  const juegoPedido = sala ? describeGame(sala.gameCode) : null;

  // Dos formas distintas de traer la copia equivocada, y conviene separarlas
  // porque se arreglan distinto:
  //
  //   - Otra EDICION. Se sabe en cuanto contesta la sala, sin esperar a la
  //     semilla, y se dice con su nombre: "hace falta Rojo Fuego".
  //   - La misma edicion pero otro volcado. Dos copias del mismo juego pueden
  //     diferir byte a byte, y entonces la misma semilla da otro mundo. Esto
  //     solo lo distingue el CRC.
  const otraEdicion =
    base !== null &&
    sala !== null &&
    parseGameCode(gameCode ?? '').gameId !== parseGameCode(sala.gameCode).gameId;
  const otroVolcado =
    base !== null && !otraEdicion && semilla !== null && semilla.baseCrc32 !== base.crc32;
  const copiaMala = otraEdicion || otroVolcado;

  /**
   * Las partidas que ya hay de ESE mundo, de la mas reciente a la mas vieja.
   *
   * Se exige que su copia siga estando. Si el navegador tiro sus datos, la copia
   * se puede rehacer pero el guardado no: ofrecer "seguir" ahi seria prometer una
   * partida que ya no existe. Ese caso cae solo en empezar otra.
   *
   * Y solo de ese mundo. Seguir una partida de otro seria volver justo al
   * problema que el enlace vino a resolver: dos amigos en dos mundos distintos.
   */
  const guardadas: PartidaGuardada[] =
    semilla === null
      ? []
      : partidasDe(semilla.baseCrc32).filter(
          (p) => p.crc32 === semilla.crc32 && existeGuardada(p.fichero),
        );

  const trabajando = fase.nombre === 'preparando' || fase.nombre === 'entrando';

  /** Entra en la sala. `seguir` es la partida que se abre, o null para una nueva. */
  const entrar = async (seguir: PartidaGuardada | null) => {
    try {
      if (seguir) {
        // Si ya esta puesta, no se recarga: le costaria a quien juega todo lo
        // que no haya guardado dentro del juego desde la ultima vez.
        if (romName !== seguir.fichero) {
          setFase({ nombre: 'preparando' });
          await onContinuar(seguir.fichero);
        }
        tocar(seguir.id);
      } else if (semilla && base) {
        setFase({ nombre: 'preparando' });
        await rehacerDesdeSemilla({
          base,
          semilla,
          juego: { label: juego?.label ?? null, generacion: juego?.generacion ?? null },
          cargar: onRandomized,
          alEsperar: (cola) =>
            setFase((actual) =>
              actual.nombre === 'preparando' ? { nombre: 'preparando', cola } : actual,
            ),
        });
      }

      // Y a la sala. El codigo y la contrasena venian en el enlace, asi que aqui
      // no hay nada que escribir.
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
      subtitle={
        juegoPedido ? `Sala ${invitacion.sala} · ${juegoPedido}` : `Sala ${invitacion.sala}`
      }
    >
      {base && (
        <div className="invite">
          <span className="invite__label">Tu copia</span>
          <strong className="invite__file" title={base.fileName}>
            {base.fileName}
          </strong>
        </div>
      )}

      {otraEdicion && (
        <p className="alert" role="alert">
          Ahí se juega a <strong>{juegoPedido}</strong> y lo que has puesto es otra edición. Hace
          falta la misma, o estaríais jugando a juegos distintos.
        </p>
      )}

      {otroVolcado && (
        <p className="alert" role="alert">
          Es el mismo juego, pero no la misma copia con la que se creó este mundo, así que la
          semilla daría algo distinto. Hace falta exactamente la misma ROM original.
        </p>
      )}

      {/* Lo primero, porque es lo unico que se le pide y lo unico que no puede
          traer ni el enlace ni la sala. La ley es la ley: aqui no se reparten
          juegos, cada uno pone la suya.

          La zona de carga vuelve a salir si la copia puesta no sirve. Sin esto
          quedaba un callejon sin salida: el aviso decia que hacia falta otra ROM
          y no habia por donde ponerla. */}
      {!base || copiaMala ? (
        <>
          <p className="hint">
            {copiaMala
              ? 'Prueba con otra copia del juego.'
              : juegoPedido
                ? `Pon tu copia de ${juegoPedido}. Con ella se prepara exactamente el mismo mundo que está jugando quien te invita.`
                : 'Pon tu propia copia del juego. Con ella se prepara exactamente el mismo mundo que está jugando quien te invita.'}
          </p>
          <RomDropZone onRom={onRom} disabled={!nucleoListo} hint={hint} />
        </>
      ) : (
        <>
          {/* Se elige como en el aleatorizador, con la misma lista: es la misma
              decision, asi que no hay motivo para que se vea de otra manera. */}
          <div className="tarjeta__titulo tarjeta__titulo--suelto">
            <span className="tarjeta__marca" />
            <h3>{guardadas.length > 0 ? 'Ya tienes ese mundo' : 'Su mundo'}</h3>
          </div>

          <div className="huecos">
            {guardadas.map((partida) => (
              <div className="hueco hueco--partida" key={partida.id}>
                <button
                  type="button"
                  className="hueco__abrir"
                  disabled={trabajando}
                  title="Se abre donde la dejaste y se entra en la sala"
                  onClick={() => void entrar(partida)}
                >
                  <span className="hueco__nombre">{nombreDePartida(partida)}</span>
                  <span className="hueco__datos">
                    <span className="hueco__juego">donde la dejaste</span>
                    <span>jugada {cuando(partida.jugada)}</span>
                  </span>
                </button>
              </div>
            ))}

            {/* Y empezar de cero en ESE mundo, no en otro: las opciones las
                eligio quien invita. Ver la cabecera. */}
            <button
              type="button"
              className="hueco hueco--libre"
              disabled={trabajando}
              title={
                guardadas.length > 0
                  ? 'Empieza de cero en el mismo mundo. Lo que ya tienes se queda donde está.'
                  : 'Prepara el mundo de quien te invita y entra en la sala'
              }
              onClick={() => void entrar(null)}
            >
              {guardadas.length > 0 ? '+ Empezar una partida nueva' : '+ Entrar y empezar'}
            </button>
          </div>

          <p className="hint">
            {!semilla
              ? 'Quien te invita juega su ROM tal cual, así que no hay nada que preparar.'
              : guardadas.length > 0
                ? 'Empezar una nueva no toca lo que ya tienes. El mundo es el mismo: lo eligió quien te invita.'
                : 'Se va a generar el mismo mundo que juega quien te invita. Tarda un rato y puedes dejar la pestaña abierta.'}
          </p>

          {trabajando && (
            <p className="hint" role="status">
              {fase.nombre === 'entrando'
                ? 'Entrando en la sala...'
                : fase.cola
                  ? textoDeEspera(fase.cola)
                  : 'Preparando la partida...'}
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

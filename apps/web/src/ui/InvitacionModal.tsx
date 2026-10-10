// Lo que ve quien abre un enlace de invitacion.
//
// Es la primera pantalla que va a ver gente que no ha usado esto nunca: le han
// mandado un enlace por WhatsApp y lo ha pulsado. Asi que no se le pide un
// codigo, ni una contrasena, ni una semilla -todo eso viene en el enlace- y lo
// unico que se le pide es lo unico que NO puede venir en el enlace: su propia
// copia del juego.
//
// Y despues un solo boton. Detras de ese boton pasan tres cosas que antes habia
// que hacer a mano y en orden: se prepara el mundo que juega quien invita, se
// carga, y se entra en la sala. Hacerlas por separado era lo que hacia que la
// gente acabara en dos mundos distintos sin entender por que.
//
// LA SEGUNDA VEZ NO ES COMO LA PRIMERA, y esto se paso por alto al principio.
// El mismo enlace se reenvia dias despues para seguir la partida de siempre: el
// lunes se quedaron en el segundo gimnasio y el jueves vuelven. Entonces el
// mundo ya esta aqui, con su guardado dentro, y lo que hace falta es ELEGIR:
// seguir esa partida o empezar otra en el mismo mundo. Las dos cosas son
// normales -se vuelve a quedar, o cayo el equipo y se repite- y adivinarla por
// el jugador es meterle en la que no era.

import { useState, type RefObject } from 'react';
import { parseGameCode } from '@emupoke/pokemon';
import type { Invitacion } from '../core/invitacion';
import { cuando, nombreDePartida, partidasDe, tocar, type PartidaGuardada } from '../core/partidas';
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

/** Lo que se elige hacer cuando ese mundo ya esta aqui: empezar otra partida. */
const NUEVA = 'nueva';

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
  const [elegido, setElegido] = useState<string | null>(null);

  if (!invitacion) return null;

  const base = baseRom.current;
  const semilla = invitacion.semilla;
  const juego = gameCode !== null ? parseGameCode(gameCode).game : null;

  // La semilla trae el CRC de la ROM original con la que se creo. Si no es la
  // misma, el mundo saldria distinto, asi que se dice ANTES de dejar pulsar el
  // boton y no despues de un minuto generando.
  const otraRom = base !== null && semilla !== null && semilla.baseCrc32 !== base.crc32;

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

  // Por defecto, la ultima que se jugo: quien vuelve a abrir el enlace dias
  // despues viene a seguir donde lo dejo, no a empezar de cero.
  const eleccion = elegido ?? guardadas[0]?.id ?? NUEVA;
  const seguir = guardadas.find((p) => p.id === eleccion) ?? null;

  const trabajando = fase.nombre === 'preparando' || fase.nombre === 'entrando';
  const sePuede = base !== null && !otraRom && !trabajando;

  const entrar = async () => {
    try {
      // 1. El mundo. Sin semilla no hay nada que preparar: quien invita juega su
      //    ROM tal cual, y entonces basta con que este la suya.
      if (semilla && seguir) {
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
          Tu copia del juego no es la misma con la que se creó este mundo, así que la semilla daría
          algo distinto. Hace falta exactamente la misma ROM original.
        </p>
      )}

      {/* Lo primero, porque es lo unico que se le pide y lo unico que el enlace
          no puede traer. La ley es la ley: aqui no se reparten juegos.

          La zona de carga vuelve a salir si la copia puesta no sirve. Sin esto
          quedaba un callejon sin salida: el aviso decia que hacia falta otra ROM
          y no habia por donde ponerla. */}
      {!base || otraRom ? (
        <>
          <p className="hint">
            {otraRom
              ? 'Prueba con otra copia del juego.'
              : semilla
                ? 'Pon tu propia copia del juego. Con ella se prepara exactamente el mismo mundo que está jugando quien te invita.'
                : 'Pon tu propia copia del juego para entrar en la sala.'}
          </p>
          <RomDropZone onRom={onRom} disabled={!nucleoListo} hint={hint} />
        </>
      ) : (
        <>
          {/* El caso de volver dias despues: ese mundo ya esta aqui, con lo que
              se jugo dentro. Se elige, no se adivina. */}
          {guardadas.length > 0 ? (
            <fieldset className="elegir">
              <legend className="elegir__titulo">Ya tienes ese mundo. ¿Qué hacemos?</legend>

              {guardadas.map((partida) => (
                <label key={partida.id} className="elegir__opcion">
                  <input
                    type="radio"
                    name="que-partida"
                    checked={eleccion === partida.id}
                    onChange={() => setElegido(partida.id)}
                    disabled={trabajando}
                  />
                  <span className="elegir__texto">
                    <strong>Seguir «{nombreDePartida(partida)}»</strong>
                    <span className="elegir__nota">
                      donde la dejaste · jugada {cuando(partida.jugada)}
                    </span>
                  </span>
                </label>
              ))}

              <label className="elegir__opcion">
                <input
                  type="radio"
                  name="que-partida"
                  checked={eleccion === NUEVA}
                  onChange={() => setElegido(NUEVA)}
                  disabled={trabajando}
                />
                <span className="elegir__texto">
                  <strong>Empezar una partida nueva</strong>
                  {/* Que no se pierde nada es justo lo que hay que decir: esta
                      es la opcion que da miedo pulsar. */}
                  <span className="elegir__nota">
                    el mismo mundo desde el principio, sin tocar lo que ya tienes
                  </span>
                </span>
              </label>
            </fieldset>
          ) : (
            <p className="hint">
              {!semilla
                ? 'Quien te invita juega su ROM tal cual, así que no hay nada que preparar.'
                : 'Se va a generar el mismo mundo que juega quien te invita. Tarda un rato y puedes dejar la pestaña abierta.'}
            </p>
          )}

          <button
            type="button"
            className="button--primary button--wide"
            disabled={!sePuede}
            onClick={() => void entrar()}
          >
            {fase.nombre === 'preparando'
              ? seguir
                ? 'Abriendo tu partida...'
                : 'Preparando el mundo...'
              : fase.nombre === 'entrando'
                ? 'Entrando...'
                : seguir
                  ? 'Seguir y unirme a la sala'
                  : 'Unirme a la sala'}
          </button>

          {fase.nombre === 'preparando' && fase.cola && (
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

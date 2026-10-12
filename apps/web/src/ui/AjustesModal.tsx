// El menu de ajustes.
//
// Vive en su propio fichero porque dejo de ser una lista de botones: son dos
// columnas de tarjetas, y mezclarlo con App.tsx hacia ilegibles las dos cosas.
//
// La forma viene de un diseno que trajo quien lo juega; los colores NO. Se usan
// los tokens de siempre a proposito: el diseno venia con su propia paleta y
// adoptarla habria dejado esta pantalla hablando un idioma distinto al del
// resto de la aplicacion.
//
// Lo que se reparte en dos columnas es "lo que haces" a la izquierda -tocar el
// emulador, cambiar las teclas- y "con que estas jugando" a la derecha -que ROM
// es, como se aleatorizo-. Es la division que hace que no haya que leerlo todo
// para encontrar una cosa.

import type { MandoFisico } from '../core/useMandoFisico';
import { nombreDeBoton } from '../core/mandoFisico';
import { useCallback, useEffect, useState, type ReactNode, type RefObject } from 'react';
import {
  MAX_PARTIDAS,
  partidasDe,
  todasLasPartidas,
  type PartidaGuardada,
} from '../core/partidas';
import { PartidasGuardadas } from './PartidasGuardadas';
import { exportarPartida } from '../core/exportar';
import type { EmulatorState } from '../core/useEmulator';
import type { MandoTactil, ModoMando } from '../core/useMandoTactil';
import { BOTONES, nombreVisible, type Teclas } from '../core/useTeclas';
import { Modal } from './Modal';
import { Toolbar } from './Toolbar';

type Props = {
  open: boolean;
  onClose: () => void;
  state: EmulatorState;
  emulator: {
    togglePause: () => void;
    reset: () => void;
    saveState: (slot: number) => void;
    loadState: (slot: number) => void;
    downloadSave: () => void;
    exportState: () => void;
    importSave: (file: File) => void;
    closeRom: () => void;
  };
  teclas: Teclas;
  mando: MandoTactil;
  /** El mando fisico, si hay uno, y sus botones. */
  mandoFisico: MandoFisico;
  /** Si este aparato manda su pantalla al companero. */
  video: { enviando: boolean; cambiar: (enviar: boolean) => void };
  hasRom: boolean;
  conCompanero: boolean;
  /**
   * Abre el menu del aleatorizador.
   *
   * Desde aqui se llega por dos sitios: pulsando un hueco libre -crear una
   * partida es elegir que se cambia, y eso se hace alli- o pulsando una cuya
   * copia ya no esta, que hay que rehacer desde su semilla.
   */
  onAleatorizar: () => void;
  /** Si la copia de una partida sigue en este navegador. */
  existeGuardada: (fichero: string) => boolean;
  /** Abrir una partida guardada. */
  onContinuar: (fichero: string) => Promise<void> | void;
  /** Quitar su copia del sistema de ficheros. */
  onBorrarPartida: (fichero: string) => void;
  /** Para poder llevarse una partida: lee su guardado. */
  leerGuardado: (fichero: string) => Uint8Array | null;
  /** Si hay sesion iniciada. Sin cuenta no hay partidas guardadas. */
  conCuenta: boolean;
  /**
   * La ROM ORIGINAL, no la que se esta jugando.
   *
   * Es lo que decide que partidas son de este juego. Jugando una copia
   * aleatorizada, el CRC de lo cargado es el de la copia, y comparando con ese
   * ninguna partida se reconoceria como tuya: ni se podrian abrir ni
   * descargar.
   */
  baseRom: RefObject<{ bytes: Uint8Array; fileName: string; crc32: string } | null>;
};

const MODOS: { valor: ModoMando; etiqueta: string }[] = [
  { valor: 'auto', etiqueta: 'Auto' },
  { valor: 'siempre', etiqueta: 'Siempre' },
  { valor: 'nunca', etiqueta: 'Nunca' },
];

export const AjustesModal = ({
  open,
  onClose,
  state,
  emulator,
  teclas,
  mando,
  mandoFisico,
  video,
  hasRom,
  conCompanero,
  onAleatorizar,
  existeGuardada,
  onContinuar,
  onBorrarPartida,
  leerGuardado,
  baseRom,
  conCuenta,
}: Props) => {
  // La lista se relee al abrir el menu: puede haber cambiado desde la vez
  // anterior -se creo una, se borro otra- y una lista vieja aqui dentro
  // enseñaria partidas que ya no estan.
  const crc = baseRom.current?.crc32 ?? null;
  const [partidas, setPartidas] = useState<PartidaGuardada[]>([]);
  // Lo unico que puede fallar aqui es llevarse una partida sin guardado, y se
  // dice en el sitio en vez de en una ventana aparte.
  const [problema, setProblema] = useState<string | null>(null);

  const releer = useCallback(() => {
    const mias = partidasDe(crc ?? '');
    const otras = todasLasPartidas().filter((p) => p.baseCrc32 !== (crc ?? ''));
    // Las de esta ROM primero: son las que se pueden abrir ahora mismo.
    setPartidas([...mias, ...otras]);
  }, [crc]);

  useEffect(() => {
    if (open) releer();
  }, [open, releer]);

  return (
  <Modal
    open={open}
    onClose={onClose}
    icon="⚙"
    title="Ajustes"
    subtitle="Emulador · Mando · Partida"
    pie={
      hasRom ? (
        <>
          <span>{state.platform?.label ?? ''}</span>
          <span className="ajustes__pie-datos">
            <span className="mono">CRC32 {state.header?.crc32 ?? '—'}</span>
            {conCompanero && <span className="ajustes__soullink">Soul Link activo</span>}
          </span>
        </>
      ) : null
    }
  >
    <div className="ajustes">
      {/* --------- lo que haces --------- */}
      <div className="ajustes__columna">
        <section className="tarjeta">
          <Titulo>Emulador</Titulo>
          <Toolbar
            state={state}
            onTogglePause={emulator.togglePause}
            onReset={emulator.reset}
            onSaveState={emulator.saveState}
            onLoadState={emulator.loadState}
            onDownloadSave={emulator.downloadSave}
            onExportState={emulator.exportState}
            onImportSave={emulator.importSave}
          />
          {state.lastSaveAt && (
            <p className="hint">
              Guardado a las {new Date(state.lastSaveAt).toLocaleTimeString('es')}. La partida
              queda en este navegador.
            </p>
          )}
        </section>

        <section className="tarjeta">
          <Titulo accion={
            <button type="button" className="boton-fantasma" onClick={teclas.restaurar}>
              Restablecer
            </button>
          }>
            Controles
          </Titulo>

          <div className="teclas">
            {BOTONES.map(({ entrada, etiqueta }) => (
              <div className="teclas__fila" key={entrada}>
                <span className="teclas__que">{etiqueta}</span>
                <button
                  type="button"
                  className={`tecla${teclas.esperando === entrada ? ' tecla--esperando' : ''}`}
                  onClick={() =>
                    teclas.esperando === entrada ? teclas.cancelar() : teclas.pedir(entrada)
                  }
                >
                  {teclas.esperando === entrada
                    ? '···'
                    : teclas.mapa[entrada]
                      ? nombreVisible(teclas.mapa[entrada]!)
                      : '—'}
                </button>
              </div>
            ))}

            {/* El avance rapido se enseña pero no se reasigna: no es una tecla
                del mando, es una velocidad, y vive fuera de este mapa. */}
            <div className="teclas__fila">
              <span className="teclas__que">Avance rapido</span>
              <span className="tecla tecla--fija">Espacio</span>
            </div>

            <div className="teclas__fila teclas__fila--ancha">
              <span className="teclas__que">Mando tactil</span>
              <div className="modos">
                {MODOS.map(({ valor, etiqueta }) => (
                  <button
                    key={valor}
                    type="button"
                    className={mando.modo === valor ? 'is-active' : undefined}
                    aria-pressed={mando.modo === valor}
                    onClick={() => mando.cambiarModo(valor)}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Un mando por Bluetooth o USB funciona solo, sin configurar nada.
              Se dice cual se ha reconocido y como van los botones, porque
              cada fabricante pone otras letras. */}
          <p className="hint">
            {mandoFisico.conectado
              ? `Mando conectado: ${mandoFisico.conectado.replace(/\s*\(.*$/, '')}. El botón de la derecha es A y el de abajo B, como en la consola.`
              : 'Puedes conectar un mando por Bluetooth o USB: pulsa cualquier botón para que el navegador lo reconozca.'}
          </p>

          {/* Sus botones, reasignables igual que las teclas: se pulsa la fila
              y luego el boton del mando. Solo con un mando conectado, que sin
              el no hay nada que pulsar. */}
          {mandoFisico.conectado && (
            <>
              <div className="teclas">
                {BOTONES.map(({ entrada, etiqueta }) => (
                  <div className="teclas__fila" key={entrada}>
                    <span className="teclas__que">{etiqueta}</span>
                    <button
                      type="button"
                      className={`tecla${mandoFisico.esperando === entrada ? ' tecla--esperando' : ''}`}
                      onClick={() =>
                        mandoFisico.esperando === entrada
                          ? mandoFisico.cancelar()
                          : mandoFisico.aprender(entrada)
                      }
                    >
                      {mandoFisico.esperando === entrada
                        ? 'Pulsa…'
                        : mandoFisico.mapa[entrada].map(nombreDeBoton).join(' · ') || '—'}
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="boton-fantasma" onClick={mandoFisico.restaurar}>
                Restablecer el mando
              </button>
            </>
          )}

          {/* En un movil que no da abasto, mandar la partida a 60 por segundo
              es lo que mas cuesta despues de emularla. Sin ella siguen el
              equipo, la voz y todo lo demas. */}
          <div className="teclas">
            <div className="teclas__fila teclas__fila--ancha">
              <span className="teclas__que">Enviar mi pantalla</span>
              <div className="modos">
                {[
                  { valor: true, etiqueta: 'Si' },
                  { valor: false, etiqueta: 'No' },
                ].map(({ valor, etiqueta }) => (
                  <button
                    key={etiqueta}
                    type="button"
                    className={video.enviando === valor ? 'is-active' : undefined}
                    aria-pressed={video.enviando === valor}
                    onClick={() => video.cambiar(valor)}
                  >
                    {etiqueta}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {!video.enviando && (
            <p className="hint">
              Tu compañero no ve tu partida, pero sí tu equipo y tu voz. Útil si el móvil va
              lento.
            </p>
          )}

          {teclas.problema && <p className="warn">{teclas.problema}</p>}
        </section>
      </div>

      {/* --------- con que estas jugando --------- */}
      <div className="ajustes__columna">
        {hasRom && state.header && state.platform && (
          <>
            <section className="tarjeta">
              <Titulo tono="azul">ROM actual</Titulo>

              <div className="rom">
                <span className="rom__cap">Titulo interno</span>
                <strong className="rom__nombre">{state.header.title}</strong>
                <span className="rom__fichero" title={state.romName ?? ''}>
                  {state.romName}
                </span>
              </div>

              <dl className="datos">
                <Dato k="Plataforma" v={state.platform.label} />
                <Dato k="Codigo" v={`${state.header.gameCode} rev ${state.header.version}`} />
                <Dato k="CRC32" v={state.header.crc32} destacado />
                <Dato k="Tamano" v={`${(state.header.size / 1024 / 1024).toFixed(0)} MB`} />
              </dl>

              <button
                type="button"
                className="boton-ancho"
                onClick={() => {
                  onClose();
                  emulator.closeRom();
                }}
              >
                Cambiar ROM
              </button>
            </section>

            {/* Tus partidas, aqui y no escondidas detras de "Aleatorizar".
                Gestionarlas -seguir una, renombrarla, llevartela, borrarla- es
                lo que se hace a diario; aleatorizar es lo que se hace una vez
                por partida. Tenerlo al reves obligaba a entrar en el menu de
                crear para poder seguir jugando una que ya existia. */}
            <section className="tarjeta">
              <Titulo
                tono="azul"
                accion={
                  <span className="cuenta">
                    {conCuenta ? `${partidas.length}/${MAX_PARTIDAS}` : 'sin cuenta'}
                  </span>
                }
              >
                Tus partidas
              </Titulo>

              {/* Sin cuenta no hay partidas guardadas, asi que no hay lista
                  que enseñar: se dice por que y como tenerlas. */}
              {!conCuenta && (
                <p className="hint">
                  Las partidas guardadas son de quien inicia sesión. Sin cuenta puedes aleatorizar
                  y jugar, pero al cerrar la pestaña se pierde.
                </p>
              )}

              <PartidasGuardadas
                partidas={conCuenta ? partidas : []}
                crcBase={crc}
                existeGuardada={existeGuardada}
                libres={conCuenta ? MAX_PARTIDAS - partidas.length : 1}
                puedeCrear
                tituloCrear={
                  conCuenta
                    ? 'Abre el menu de aleatorizar para crear una partida nueva'
                    : 'Aleatoriza y juega ahora. Sin cuenta no se guarda.'
                }
                onCrear={onAleatorizar}
                onAbrir={(partida, aqui) => {
                  // Si su copia sigue aqui, se abre y ya. Si no, hay que
                  // rehacerla desde su semilla, y eso lo sabe hacer el menu de
                  // aleatorizar: se manda alli en vez de fingir que no pasa
                  // nada.
                  if (aqui) {
                    onClose();
                    void onContinuar(partida.fichero);
                  } else {
                    onAleatorizar();
                  }
                }}
                onBorrarFichero={onBorrarPartida}
                onExportar={(partida) => setProblema(exportarPartida(partida, leerGuardado))}
                releer={releer}
                visible={open}
              />

              {problema && (
                <p className="alert" role="alert">
                  {problema}
                </p>
              )}

              {/* Sin botones debajo. Copiar la semilla de la partida en curso
                  estaba aqui, y sobra: cada partida de la lista tiene el suyo,
                  que ademas copia la de ESA y no la de la que estes jugando. */}
            </section>
          </>
        )}
      </div>
    </div>
    </Modal>
  );
};

/** Titulo de tarjeta: la marca de color, el texto y una accion opcional. */
const Titulo = ({
  children,
  tono,
  accion,
}: {
  children: ReactNode;
  tono?: 'azul';
  accion?: ReactNode;
}) => (
  <div className="tarjeta__titulo">
    <span className={`tarjeta__marca${tono ? ` tarjeta__marca--${tono}` : ''}`} />
    <h2>{children}</h2>
    {accion && <div className="tarjeta__accion">{accion}</div>}
  </div>
);

const Dato = ({ k, v, destacado }: { k: string; v: string; destacado?: boolean }) => (
  <div>
    <dt>{k}</dt>
    <dd className={`mono${destacado ? ' is-destacado' : ''}`}>{v}</dd>
  </div>
);

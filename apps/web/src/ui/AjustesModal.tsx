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

import type { ReactNode } from 'react';
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
  hasRom: boolean;
  conCompanero: boolean;
  /** Abre el menu del aleatorizador. */
  onAleatorizar: () => void;
  /** Boton para copiar la semilla, o null si esta partida no tiene. */
  copiarSemilla: ReactNode;
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
  hasRom,
  conCompanero,
  onAleatorizar,
  copiarSemilla,
}: Props) => (
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

          {teclas.problema && <p className="warn">{teclas.problema}</p>}

          <p className="hint">
            <strong>Pulsa un boton</strong> y despues la tecla que quieras; Escape cancela. Se
            guarda por posicion en el teclado, no por la letra, asi que el mando sigue donde lo
            dejaste aunque cambies de distribucion.
          </p>
          <p className="hint">
            En <strong>Auto</strong>, el mando tactil sale si juegas tocando la pantalla y se va
            si usas el teclado.
          </p>
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

            <section className="tarjeta">
              <Titulo tono="azul">Aleatorizar</Titulo>

              <div className="aleat">
                <span className="aleat__icono" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </span>
                <div>
                  <div className="aleat__que">
                    {state.romSource === 'generada' ? 'Partida aleatorizada' : 'Partida tal cual'}
                  </div>
                  <div className="aleat__nota">
                    {state.romSource === 'generada'
                      ? 'Aleatorizar otra vez parte de tu ROM original, no de esta'
                      : 'Cambia que Pokemon, objetos y entrenadores aparecen'}
                  </div>
                </div>
              </div>

              <div className="aleat__acciones">
                <button type="button" className="boton-ancho" onClick={onAleatorizar}>
                  Opciones
                </button>
                {copiarSemilla}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  </Modal>
);

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

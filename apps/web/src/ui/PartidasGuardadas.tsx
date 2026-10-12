// Tus partidas: la lista de las copias aleatorizadas que tienes guardadas.
//
// Vive en su propio fichero porque se enseña en DOS sitios y tiene que ser la
// misma en los dos:
//
//   - En Ajustes, que es donde se gestionan: continuar una, renombrarla,
//     llevarsela a otro aparato o borrarla. Es lo que se hace a diario.
//   - En el menu de aleatorizar, donde ademas se crean. Ahi el hueco libre
//     aleatoriza con lo que este marcado; en Ajustes abre ese menu, porque
//     para crear una partida hay que elegir que se cambia.
//
// Tenerla escrita dos veces acabaria con dos listas que se parecen y se portan
// distinto, que es peor que no tenerla en el segundo sitio.

import { useEffect, useState, type ReactNode } from 'react';
import {
  cuando,
  juegoDePartida,
  nombreDePartida,
  olvidar,
  renombrar,
  semillaDePartida,
  sePuedeRehacer,
  tocar,
  type PartidaGuardada,
} from '../core/partidas';
import { apuntarDescartada } from '../core/historial';
import { olvidarReglas } from '../core/reglasNuzlocke';
import { AVISO_ESPACIO, cabeOtra, enPalabras, useEspacio } from '../core/espacio';
import { yaTermino } from '../core/useFinDePartida';
import { codificarSemilla } from '../core/semilla';

/*
 * Los iconos de la fila de una partida.
 *
 * Dibujados y no con una letra: la equis que habia antes se leia como "cerrar"
 * -es la misma que cierra el menu, dos centimetros mas arriba- y lo que hace es
 * borrar una partida para siempre. Una papelera no se confunde con nada.
 *
 * `currentColor` para que hereden el color del boton, incluido el rojo que coge
 * al pasar por encima.
 */
export const IconoPapelera = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4h11" />
    <path d="M6.5 4V2.5h3V4" />
    <path d="M4 4l.7 9a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4" />
    <path d="M6.6 6.8v4.6M9.4 6.8v4.6" />
  </svg>
);

export const IconoLapiz = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.2 2.3l2.5 2.5-8 8-3.2.7.7-3.2z" />
    <path d="M10 3.5l2.5 2.5" />
  </svg>
);

export const IconoSi = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
);

export const IconoNo = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

/** Copia la semilla de una partida: cuatro campos con los que se rehace. */
const BotonSemilla = ({ partida }: { partida: PartidaGuardada }) => {
  const [copiada, setCopiada] = useState(false);

  const datos = semillaDePartida(partida);
  if (!datos) return null;

  const semilla = codificarSemilla(datos);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(semilla);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2200);
    } catch {
      // Si el navegador no deja, al menos queda seleccionable en el titulo.
    }
  };

  return (
    <button
      type="button"
      className={`partida__semilla${copiada ? ' is-copiada' : ''}`}
      onClick={() => void copiar()}
      title={copiada ? 'Copiada' : `Copiar la semilla de esta partida:\n${semilla}`}
      aria-label="Copiar la semilla de esta partida"
    >
      {copiada ? '✓' : '⧉'}
    </button>
  );
};

type Props = {
  /** Todas, las de esta ROM primero. */
  partidas: PartidaGuardada[];
  /** CRC de la ROM cargada ahora, para saber cuales se pueden abrir. */
  crcBase: string | null;
  /** Si su copia sigue en este navegador. */
  existeGuardada: (fichero: string) => boolean;
  /** Cuantos huecos quedan libres. */
  libres: number;
  /** Si se puede crear una ahora mismo. */
  puedeCrear: boolean;
  /** Que dice el hueco libre al pasar por encima. */
  tituloCrear: string;
  onCrear: () => void;
  /**
   * Abrir una partida. `aqui` dice si su copia sigue en el navegador; si no,
   * hay que rehacerla desde su semilla, y eso no lo hace esta lista.
   */
  onAbrir: (partida: PartidaGuardada, aqui: boolean) => void;
  /** Quitar su copia del sistema de ficheros. */
  onBorrarFichero: (fichero: string) => void;
  /** Descargarla entera para otro aparato. */
  onExportar: (partida: PartidaGuardada) => void;
  /** Volver a leer la lista despues de cambiarla. */
  releer: () => void;
  /** Que se enseñe debajo, si el sitio que la usa quiere poner algo. */
  pie?: ReactNode;
  /**
   * Si la lista se esta viendo.
   *
   * Sirve para olvidar lo que estaba a medias al cerrar: una pregunta de
   * "¿seguro?" que sobrevive a cerrar el menu reaparece al volver, pidiendo
   * confirmacion de algo que ya nadie recuerda haber pulsado.
   */
  visible?: boolean;
};

export const PartidasGuardadas = ({
  partidas,
  crcBase,
  existeGuardada,
  libres,
  puedeCrear,
  tituloCrear,
  onCrear,
  onAbrir,
  onBorrarFichero,
  onExportar,
  releer,
  pie,
  visible = true,
}: Props) => {
  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [borrando, setBorrando] = useState<string | null>(null);
  // Se relee al abrir y cada vez que cambia la lista: crear o borrar una
  // partida mueve dieciseis megas.
  const espacio = useEspacio(`${visible}:${partidas.length}`);

  useEffect(() => {
    if (visible) return;
    setBorrando(null);
    setRenombrando(null);
  }, [visible]);

  return (
    <div className="huecos">
      {partidas.map((partida) => {
        const mia = partida.baseCrc32 === (crcBase ?? '');
        const aqui = existeGuardada(partida.fichero);
        const rehacible = sePuedeRehacer(partida);
        // Solo se puede entrar en una partida del juego que esta cargado: para
        // las demas haria falta su ROM.
        const sePuedeAbrir = mia && (aqui || rehacible);

        return (
          <div
            className={`hueco hueco--partida${mia ? '' : ' hueco--ajena'}`}
            key={partida.id}
          >
            {renombrando === partida.id ? (
              /* El nombre se edita en el sitio del nombre, no en una ventana
                 aparte: lo que se esta cambiando es esa linea y ahi se ve lo
                 que queda. */
              <form
                className="hueco__renombrar"
                onSubmit={(event) => {
                  event.preventDefault();
                  renombrar(partida.id, nombreNuevo);
                  setRenombrando(null);
                  releer();
                }}
              >
                <input
                  className="hueco__nombre-campo"
                  value={nombreNuevo}
                  maxLength={40}
                  autoFocus
                  aria-label={`Nombre de ${nombreDePartida(partida)}`}
                  onChange={(event) => setNombreNuevo(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setRenombrando(null);
                  }}
                />
                <button
                  type="submit"
                  className="hueco__accion hueco__accion--guardar"
                  title="Guardar el nombre"
                  aria-label="Guardar el nombre"
                >
                  <IconoSi />
                </button>
                <button
                  type="button"
                  className="hueco__accion"
                  title="Dejarlo como estaba"
                  aria-label="Dejar el nombre como estaba"
                  onClick={() => setRenombrando(null)}
                >
                  <IconoNo />
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="hueco__abrir"
                disabled={!sePuedeAbrir}
                // Lo de "hay que rehacerla" no se enseña en la linea: es jerga
                // nuestra y asustaba sin aportar, porque al pulsar se rehace
                // sola. Se queda aqui, para quien pase el raton y se pregunte
                // por que esta tarda mas.
                title={
                  !mia
                    ? `Para jugarla, carga ${juegoDePartida(partida)} desde "Cambiar ROM"`
                    : aqui
                      ? undefined
                      : rehacible
                        ? 'Su copia ya no esta en este navegador: al abrirla se vuelve a generar desde su semilla.'
                        : 'Su copia ya no esta y no tiene semilla, asi que no se puede recuperar.'
                }
                onClick={() => {
                  if (aqui) tocar(partida.id);
                  onAbrir(partida, aqui);
                }}
              >
                <span className="hueco__nombre">{nombreDePartida(partida)}</span>
                <span className="hueco__datos">
                  <span className="hueco__juego">{juegoDePartida(partida)}</span>
                  <span>{cuando(partida.creada)}</span>
                </span>
              </button>
            )}

            {/* O las acciones, o la pregunta. En el mismo sitio y no debajo:
                asi la ficha no cambia de alto y las de abajo no dan un salto
                al preguntar. */}
            {renombrando === partida.id ? null : borrando === partida.id ? (
              <div className="hueco__acciones hueco__acciones--seguro">
                <span className="hueco__seguro">¿Seguro?</span>
                <button
                  type="button"
                  className="hueco__accion hueco__accion--si"
                  title="Si, borrarla"
                  aria-label={`Confirmar que se borra ${nombreDePartida(partida)}`}
                  onClick={() => {
                    setBorrando(null);
                    // Borrar una partida que nunca llego a acabarse es
                    // DESCARTARLA, y eso se apunta. No cuenta para el
                    // porcentaje, pero sin esto no quedaria ningun rastro: es
                    // lo unico que separa un 90% limpio de uno hecho a base de
                    // borrar lo que iba mal.
                    if (!yaTermino(partida.fichero)) {
                      apuntarDescartada(partida.fichero, {
                        juego: juegoDePartida(partida),
                        // Una Nuzlocke descartada cuenta en la columna de las
                        // Nuzlocke: es justo donde descartar sale a cuenta.
                        dificultad: partida.dificultad ?? null,
                      });
                    }
                    onBorrarFichero(partida.fichero);
                    olvidar(partida.id);
                    olvidarReglas(partida.fichero);
                    releer();
                  }}
                >
                  <IconoSi />
                </button>
                <button
                  type="button"
                  className="hueco__accion"
                  title="No, dejarla"
                  aria-label="Dejar la partida como esta"
                  /* Enfocado al aparecer: asi la tecla de espacio -o un segundo
                     toque sin mirar- cancela en vez de borrar. */
                  autoFocus
                  onClick={() => setBorrando(null)}
                >
                  <IconoNo />
                </button>
              </div>
            ) : (
              <div className="hueco__acciones">
                {/* Cambiar el nombre vale para cualquiera, tambien para las de
                    otra ROM: un nombre es una etiqueta tuya, no algo del
                    juego. */}
                <button
                  type="button"
                  className="hueco__accion"
                  title="Cambiarle el nombre"
                  aria-label={`Cambiar el nombre de ${nombreDePartida(partida)}`}
                  onClick={() => {
                    // Con el nombre que ya tiene dentro, para retocarlo en vez
                    // de escribirlo entero.
                    setNombreNuevo(partida.nombre ?? nombreDePartida(partida));
                    setBorrando(null);
                    setRenombrando(partida.id);
                  }}
                >
                  <IconoLapiz />
                </button>
                {mia && <BotonSemilla partida={partida} />}
                {mia && (
                  <button
                    type="button"
                    className="hueco__accion"
                    onClick={() => onExportar(partida)}
                    title={
                      'Descargar esta partida entera: el guardado y la semilla.\n' +
                      'Es lo que te llevas a otro aparato para seguir ahi.'
                    }
                    aria-label="Descargar esta partida para otro aparato"
                  >
                    ⤓
                  </button>
                )}
                <button
                  type="button"
                  className="hueco__accion hueco__accion--borrar"
                  title="Borrar esta partida"
                  aria-label={`Borrar ${nombreDePartida(partida)}`}
                  onClick={() => setBorrando(partida.id)}
                >
                  <IconoPapelera />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Los huecos libres se enseñan en vez de esconderlos: ver cuantas caben
          todavia es lo que evita la sorpresa de "no puedes, estan llenas"
          cuando ya habias elegido. */}
      {Array.from({ length: Math.max(0, libres) }, (_, i) => (
        <button
          key={`libre-${i}`}
          type="button"
          className="hueco hueco--libre"
          disabled={!puedeCrear}
          onClick={onCrear}
          title={tituloCrear}
        >
          + Crear partida
        </button>
      ))}

      {/* Lo que ocupa, para que nadie descubra que se acabo el sitio cuando
          falla un guardado. Sin datos del navegador no se dice nada. */}
      {espacio && espacio.cuota > 0 && (
        <p
          className={
            espacio.usado / espacio.cuota >= AVISO_ESPACIO || !cabeOtra(espacio) ? 'warn' : 'hint'
          }
        >
          Ocupa {enPalabras(espacio.usado)} de {enPalabras(espacio.cuota)} que deja el navegador.
          {!cabeOtra(espacio) && ' No cabe otra partida: borra alguna antes de crear otra.'}
          {cabeOtra(espacio) &&
            espacio.usado / espacio.cuota >= AVISO_ESPACIO &&
            ' Queda poco sitio: si se llena, lo que falla es el siguiente guardado.'}
        </p>
      )}

      {pie}
    </div>
  );
};

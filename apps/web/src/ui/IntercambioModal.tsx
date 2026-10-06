// La pantalla del intercambio.
//
// Lo que tiene que dejar claro, y por eso esta partida en dos columnas: que
// entregas y que recibes. En un Soul Link eso no es un detalle, es la decision.
//
// Lo que llega se nombra con TU ROM, no con la suya. Entre dos copias
// aleatorizadas distintas la misma especie es otra cosa en cada una, asi que
// decirte "te llega un Bulbasaur" con los datos de ella seria mentirte: el que
// vas a tener es el Bulbasaur de tu copia. Por eso el aviso de abajo.

import type { EquipoResumen } from '@emupoke/protocol';
import type { Especies } from '../core/useEspecies';
import type { Intercambio } from '../core/useIntercambio';
import { Modal } from './Modal';
import { SpriteEspecie } from './Sprite';

type Props = {
  open: boolean;
  onClose: () => void;
  intercambio: Intercambio;
  /** Tu equipo, para elegir a quien entregas. */
  equipo: EquipoResumen | null;
  especies: Especies;
  /** Si hay companero al otro lado. Sin el no hay nada que hacer aqui. */
  conCompanero: boolean;
  generacion: number;
};

const inicial = (nombre: string): string => nombre.slice(0, 2).toUpperCase();
const tono = (especie: number): number => (especie * 47) % 360;

/** Una ficha de "esto entra" o "esto sale". */
const Lado = ({
  titulo,
  mote,
  especie,
  nivel,
  especies,
  generacion,
  vacio,
}: {
  titulo: string;
  mote?: string;
  especie?: number;
  nivel?: number;
  especies: Especies;
  generacion: number;
  vacio: string;
}) => (
  <section className="tarjeta trato__lado">
    <div className="tarjeta__titulo">
      <span className="tarjeta__marca" />
      <h2>{titulo}</h2>
    </div>
    {especie === undefined ? (
      <p className="trato__hueco">{vacio}</p>
    ) : (
      <div className="trato__ficha">
        <SpriteEspecie
          nacional={especies.nacional(especie)}
          generacion={generacion}
          inicial={inicial(especies.nombre(especie))}
          tonoDe={tono(especie)}
          className="fin__sprite"
        />
        <span className="fin__datos">
          <strong className="fin__mote">{mote || especies.nombre(especie)}</strong>
          <span className="fin__nivel">
            {especies.nombre(especie)} · Nv. {nivel}
          </span>
        </span>
      </div>
    )}
  </section>
);

export const IntercambioModal = ({
  open,
  onClose,
  intercambio,
  equipo,
  especies,
  conCompanero,
  generacion,
}: Props) => {
  const { estado, ofrecer, confirmar, cancelar, rematar, olvidar } = intercambio;
  const ranuras = (equipo?.ranuras ?? []).filter((r) => !r.huevo);
  const puedoConfirmar = estado.mia !== null && estado.suya !== null && !estado.miListo;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="⇄"
      title="Intercambiar"
      subtitle="Un Pokemon por otro"
    >
      <div className="trato">
        {/* Un trato a medias se avisa antes que nada: es lo unico que puede
            tener a alguien con un Pokemon de menos. */}
        {estado.aMedias && (
          <section className="trato__pendiente" role="alert">
            <strong>Tienes un intercambio sin terminar.</strong>
            <p>
              Se quedo a medias, seguramente porque se corto la conexion. El Pokemon que te daban
              esta guardado, asi que se puede terminar ahora mismo sin tu companero.
            </p>
            <button type="button" className="button--primary" onClick={rematar}>
              Terminarlo
            </button>
          </section>
        )}

        {/* Fuera de la rama de abajo a proposito: rematar un trato a medias se
            hace sin companero, y su resultado tiene que verse igual. Estaba
            dentro y al terminarlo no se veia nada. */}
        {estado.aviso && <p className="trato__aviso">{estado.aviso}</p>}

        {!conCompanero ? (
          <p className="trato__hueco">
            Para intercambiar hace falta estar en una sala con alguien. Abre <strong>Jugar con un
            amigo</strong> y comparte el codigo.
          </p>
        ) : (
          <>
            <div className="trato__columnas">
              <Lado
                titulo="Entregas"
                mote={estado.mia?.mote}
                especie={estado.mia?.especie}
                nivel={estado.mia?.nivel}
                especies={especies}
                generacion={generacion}
                vacio="Elige abajo a cual entregas."
              />
              <Lado
                titulo="Recibes"
                mote={estado.suya?.mote}
                especie={estado.suya?.especie}
                nivel={estado.suya?.nivel}
                especies={especies}
                generacion={generacion}
                vacio="Tu companero todavia no ha elegido."
              />
            </div>

            {/* Elegir solo tiene sentido mientras no se haya escrito nada. */}
            {estado.fase !== 'hecho' && estado.fase !== 'aplicando' && (
              <section className="tarjeta">
                <div className="tarjeta__titulo">
                  <span className="tarjeta__marca" />
                  <h2>{estado.mia ? 'Cambiar de Pokemon' : 'Tu equipo'}</h2>
                </div>
                {ranuras.length === 0 ? (
                  <p className="trato__hueco">No veo tu equipo todavia.</p>
                ) : (
                  <ul className="trato__equipo">
                    {ranuras.map((r) => (
                      <li key={r.personalidad}>
                        <button
                          type="button"
                          className={`trato__elegir${
                            estado.mia?.ranura === r.ranura ? ' is-elegido' : ''
                          }`}
                          disabled={estado.miListo}
                          onClick={() => ofrecer(r.ranura)}
                        >
                          <SpriteEspecie
                            nacional={especies.nacional(r.especie)}
                            generacion={generacion}
                            inicial={inicial(especies.nombre(r.especie))}
                            tonoDe={tono(r.especie)}
                            className="fin__sprite"
                          />
                          <span className="fin__datos">
                            <strong className="fin__mote">{r.mote || especies.nombre(r.especie)}</strong>
                            <span className="fin__nivel">Nv. {r.nivel}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <p className="hint">
              {estado.fase === 'hecho'
                ? 'Hecho. El Pokemon ya esta en tu equipo.'
                : estado.miListo && !estado.suListo
                  ? 'Has dicho que si. Falta que lo diga tu companero.'
                  : 'Nadie toca su partida hasta que los dos digan que si.'}
            </p>

            <div className="fin__salidas">
              {estado.fase === 'hecho' ? (
                <button type="button" className="button--primary button--wide" onClick={olvidar}>
                  Hacer otro
                </button>
              ) : (
                <button
                  type="button"
                  className="button--primary button--wide"
                  disabled={!puedoConfirmar}
                  onClick={confirmar}
                >
                  {estado.miListo ? 'Esperando a tu companero' : 'Si, intercambiar'}
                </button>
              )}
              <button type="button" className="button--wide" onClick={cancelar}>
                Cancelar
              </button>
            </div>

            <p className="hint">
              Lo que te llega se nombra con <strong>tu</strong> copia. Si las dos estan
              aleatorizadas por separado, la misma especie tiene otros tipos y otras estadisticas
              en cada una, y las suyas se recalculan con las tablas de la tuya al recibirlo.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
};

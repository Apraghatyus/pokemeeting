// La ficha de entrenador: quien eres y con quien juegas.
//
// Dos pestañas, como el diseño que trajo quien lo juega:
//
//   - MI PERFIL. Tu foto, tu nombre con su tag, tu lema, las tres cifras que
//     salen de tus partidas, con que juegas mas y cual es tu favorito.
//   - AMIGOS. Añadir por "Nombre#0482", las solicitudes que te esperan y la
//     lista con quien esta conectado y a que juega.
//
// EL TAG. Cuatro cifras que reparte el servidor, como en Discord, y existe
// para que el apodo NO tenga que ser unico: obligar a que lo fuera convertiria
// el nombre que te ponen tus amigos en un recurso que se agota, y el primero
// que llegue se queda con "Juan".
//
// LO QUE SE VE DE TI. Tu ficha la ves tu; de tus amigos ves su nombre, su foto
// y si estan jugando. Lo que nunca sale de aqui es el usuario con el que entra
// cada uno, que es la mitad de su llave.

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_APODO } from '@emupoke/protocol';
import {
  cambiarClave,
  fotoDe,
  guardarPerfil,
  miPerfil,
  misAmigos,
  prepararFoto,
  quitarAmigo,
  responderSolicitud,
  solicitarAmigo,
  subirAvatar,
  type Amigo,
  type Perfil,
  type Solicitud,
} from '../core/ficha';
import type { EstadoDeCuenta } from '../core/useCuenta';
import type { Especies } from '../core/useEspecies';
import { Modal } from './Modal';

type Props = {
  open: boolean;
  onClose: () => void;
  cuenta: EstadoDeCuenta;
  /** Para poner nombre al Pokemon favorito: lo guardado es un numero. */
  especies: Especies;
};

const COMO_ESTA: Record<Amigo['estado'], string> = {
  'en-partida': 'En partida',
  disponible: 'Disponible',
  desconectado: 'Desconectado',
};

/** Las iniciales, para cuando no hay foto. */
const iniciales = (texto: string): string =>
  texto
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((t) => t[0]?.toUpperCase() ?? '')
    .join('') || '?';

/** Un color estable por nombre, para que cada avatar sin foto sea distinto. */
const tono = (texto: string): number => {
  let suma = 0;
  for (const letra of texto) suma = (suma + letra.charCodeAt(0) * 7) % 360;
  return suma;
};

const Avatar = ({
  apodo,
  tag,
  conFoto,
  version,
  grande,
}: {
  apodo: string;
  tag: string;
  conFoto: boolean;
  version?: string | null;
  grande?: boolean;
}) =>
  conFoto ? (
    <img
      className={`ficha__avatar${grande ? ' ficha__avatar--grande' : ''}`}
      src={fotoDe(apodo, tag, version)}
      alt=""
      draggable={false}
    />
  ) : (
    <span
      className={`ficha__avatar${grande ? ' ficha__avatar--grande' : ''}`}
      style={{ '--tono': tono(apodo) } as React.CSSProperties}
      aria-hidden="true"
    >
      {iniciales(apodo)}
    </span>
  );

/* ---------------- mi perfil ---------------- */

const MiPerfil = ({
  perfil,
  onPerfil,
  especies,
  onSalir,
}: {
  perfil: Perfil;
  onPerfil: (p: Perfil) => void;
  especies: Especies;
  onSalir: () => void;
}) => {
  const [editando, setEditando] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [apodo, setApodo] = useState(perfil.apodo);
  const [lema, setLema] = useState(perfil.lema ?? '');
  const [favorito, setFavorito] = useState(String(perfil.favorito ?? ''));
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [problema, setProblema] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const fichero = useRef<HTMLInputElement | null>(null);

  const guardar = async () => {
    setProblema(null);
    try {
      onPerfil(
        await guardarPerfil({
          apodo,
          lema: lema.trim() || null,
          favorito: favorito.trim() ? Number(favorito) : null,
        }),
      );
      setEditando(false);
    } catch (error) {
      setProblema((error as Error).message);
    }
  };

  const ponerFoto = async (elegido: File) => {
    setProblema(null);
    try {
      await subirAvatar(await prepararFoto(elegido));
      // La direccion de la foto es la misma de siempre, asi que el navegador
      // la tiene cacheada: con un numero distinto detras se salta la cache.
      setVersion(String(Date.now()));
      onPerfil({ ...perfil, conFoto: true });
    } catch (error) {
      setProblema((error as Error).message);
    }
  };

  const guardarClave = async () => {
    setProblema(null);
    setAviso(null);
    try {
      await cambiarClave(actual, nueva);
      setActual('');
      setNueva('');
      setCambiandoClave(false);
      setAviso('Contraseña cambiada. Las sesiones de otros aparatos se han cerrado.');
    } catch (error) {
      setProblema((error as Error).message);
    }
  };

  return (
    <div className="ficha__perfil">
      <div className="ficha__cabecera">
        <button
          type="button"
          className="ficha__foto"
          onClick={() => fichero.current?.click()}
          title="Cambiar la foto"
        >
          <Avatar
            apodo={perfil.apodo}
            tag={perfil.tag}
            conFoto={perfil.conFoto}
            version={version}
            grande
          />
          <span className="ficha__foto-pie">Cambiar</span>
        </button>
        <input
          ref={fichero}
          type="file"
          accept="image/*"
          hidden
          onChange={(evento) => {
            const elegido = evento.target.files?.[0];
            if (elegido) void ponerFoto(elegido);
            evento.target.value = '';
          }}
        />

        <div className="ficha__quien">
          {editando ? (
            <label className="ficha__campo">
              Tu nombre
              <input
                value={apodo}
                maxLength={MAX_APODO}
                onChange={(evento) => setApodo(evento.target.value)}
              />
            </label>
          ) : (
            <h3 className="ficha__nombre">{perfil.apodo}</h3>
          )}

          <button
            type="button"
            className="ficha__tag"
            title="Copiar tu nombre con su tag, para que te añadan"
            onClick={() => {
              void navigator.clipboard
                .writeText(`${perfil.apodo}#${perfil.tag}`)
                .then(() => {
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                })
                .catch(() => {});
            }}
          >
            #{perfil.tag} {copiado ? '✓' : '⧉'}
          </button>

          {editando ? (
            <label className="ficha__campo">
              Tu lema
              <input
                value={lema}
                maxLength={80}
                placeholder="Una ruta más. Un intento más."
                onChange={(evento) => setLema(evento.target.value)}
              />
            </label>
          ) : (
            perfil.lema && <p className="ficha__lema">{perfil.lema}</p>
          )}
        </div>
      </div>

      {/* Las tres cifras. Las descartadas van debajo del porcentaje y no
          escondidas: son las que explican un porcentaje demasiado bonito. */}
      <div className="ficha__cifras">
        <div>
          <strong>{perfil.partidas}</strong>
          <span>Partidas</span>
        </div>
        <div>
          <strong className="ficha__winrate">
            {perfil.porcentaje !== null ? `${perfil.porcentaje}%` : '—'}
          </strong>
          <span>{perfil.porcentaje !== null ? 'Winrate' : 'Faltan partidas'}</span>
        </div>
        <div>
          <strong>{perfil.victorias}</strong>
          <span>Victorias</span>
        </div>
      </div>

      {perfil.descartadas > 0 && (
        <p className="hint">
          Y {perfil.descartadas} descartada{perfil.descartadas === 1 ? '' : 's'}, que no cuentan
          para el porcentaje.
        </p>
      )}

      <div className="ficha__tarjetas">
        <section className="ficha__tarjeta">
          <span className="ficha__etiqueta">Juego más jugado</span>
          {perfil.masJugado ? (
            <>
              <strong>{perfil.masJugado.juego}</strong>
              <span className="hint">
                {perfil.masJugado.partidas} partida{perfil.masJugado.partidas === 1 ? '' : 's'}
              </span>
            </>
          ) : (
            <span className="hint">Todavía ninguno.</span>
          )}
        </section>

        <section className="ficha__tarjeta">
          <span className="ficha__etiqueta">Pokémon favorito</span>
          {editando ? (
            <label className="ficha__campo">
              Su número de especie
              <input
                value={favorito}
                inputMode="numeric"
                placeholder="94"
                onChange={(evento) => setFavorito(evento.target.value.replace(/\D/g, ''))}
              />
            </label>
          ) : perfil.favorito ? (
            <strong>{especies.nombre(perfil.favorito) || `#${perfil.favorito}`}</strong>
          ) : (
            <span className="hint">Sin elegir.</span>
          )}
        </section>
      </div>

      {problema && (
        <p className="alert" role="alert">
          {problema}
        </p>
      )}
      {aviso && <p className="hint">{aviso}</p>}

      {cambiandoClave ? (
        <form
          className="form"
          onSubmit={(evento) => {
            evento.preventDefault();
            void guardarClave();
          }}
        >
          <label>
            Tu contraseña de ahora
            <input
              type="password"
              value={actual}
              autoComplete="current-password"
              onChange={(evento) => setActual(evento.target.value)}
            />
          </label>
          <label>
            La nueva
            <input
              type="password"
              value={nueva}
              autoComplete="new-password"
              onChange={(evento) => setNueva(evento.target.value)}
            />
          </label>
          {/* Se dice ANTES de pulsar: alguien que cambia la contraseña desde
              el movil no espera quedarse fuera del ordenador sin avisar. */}
          <p className="hint">
            Al cambiarla se cerrarán tus sesiones en los demás aparatos. Esta no.
          </p>
          <div className="ficha__botones">
            <button type="submit" className="button--primary">
              Cambiar contraseña
            </button>
            <button type="button" onClick={() => setCambiandoClave(false)}>
              Dejarlo
            </button>
          </div>
        </form>
      ) : (
        <div className="ficha__botones">
          {editando ? (
            <>
              <button type="button" className="button--primary" onClick={() => void guardar()}>
                Guardar
              </button>
              <button
                type="button"
                onClick={() => {
                  setApodo(perfil.apodo);
                  setLema(perfil.lema ?? '');
                  setFavorito(String(perfil.favorito ?? ''));
                  setEditando(false);
                }}
              >
                Dejarlo
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button--primary" onClick={() => setEditando(true)}>
                ✎ Personalizar perfil
              </button>
              <button type="button" onClick={() => setCambiandoClave(true)}>
                Cambiar contraseña
              </button>
              <button type="button" onClick={onSalir}>
                Cerrar sesión
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/* ---------------- amigos ---------------- */

const Amigos = () => {
  const [amigos, setAmigos] = useState<Amigo[]>([]);
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [quien, setQuien] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [problema, setProblema] = useState<string | null>(null);

  const recoger = useCallback((datos: { amigos: Amigo[]; solicitudes: Solicitud[] }) => {
    setAmigos(datos.amigos);
    setSolicitudes(datos.solicitudes);
  }, []);

  useEffect(() => {
    void misAmigos().then(recoger).catch(() => {});
    // Se refresca cada poco: lo que cambia aqui -quien se conecta, quien te
    // manda una solicitud- pasa mientras tienes la pantalla abierta.
    const reloj = setInterval(() => {
      void misAmigos().then(recoger).catch(() => {});
    }, 20_000);
    return () => clearInterval(reloj);
  }, [recoger]);

  const anadir = async () => {
    setProblema(null);
    // Se escribe "Nombre#0482". Se parte por el ULTIMO almohadilla: un apodo
    // puede llevar una dentro y el tag va siempre al final.
    const corte = quien.lastIndexOf('#');
    const apodo = corte > 0 ? quien.slice(0, corte).trim() : '';
    const tag = corte > 0 ? quien.slice(corte + 1).trim() : '';
    if (!apodo || !/^\d{4}$/.test(tag)) {
      setProblema('Escríbelo así: Nombre#0482, con sus cuatro cifras.');
      return;
    }
    try {
      recoger(await solicitarAmigo(apodo, tag));
      setQuien('');
    } catch (error) {
      setProblema((error as Error).message);
    }
  };

  const visibles = busqueda.trim()
    ? amigos.filter((a) => a.apodo.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : amigos;

  return (
    <div className="ficha__amigos">
      <div className="ficha__anadir">
        <input
          value={quien}
          placeholder="Nombre#0482"
          aria-label="Nombre y tag de quien quieres añadir"
          onChange={(evento) => setQuien(evento.target.value)}
          onKeyDown={(evento) => {
            if (evento.key === 'Enter') void anadir();
          }}
        />
        <button type="button" className="button--primary" onClick={() => void anadir()}>
          Añadir
        </button>
      </div>

      {problema && (
        <p className="alert" role="alert">
          {problema}
        </p>
      )}

      {solicitudes.length > 0 && (
        <>
          <h4 className="ficha__seccion ficha__seccion--aviso">
            Solicitud recibida · {solicitudes.length}
          </h4>
          <ul className="ficha__lista">
            {solicitudes.map((s) => (
              <li key={s.id} className="ficha__fila">
                <Avatar apodo={s.apodo} tag={s.tag} conFoto={s.conFoto} />
                <span className="ficha__fila-quien">
                  <strong>{s.apodo}</strong>
                  <small>#{s.tag}</small>
                </span>
                <span className="ficha__fila-acciones">
                  <button
                    type="button"
                    title="Rechazar"
                    aria-label={`Rechazar a ${s.apodo}`}
                    onClick={() => {
                      void responderSolicitud(s.id, false).then(recoger).catch(() => {});
                    }}
                  >
                    ✕
                  </button>
                  <button
                    type="button"
                    className="is-si"
                    title="Aceptar"
                    aria-label={`Aceptar a ${s.apodo}`}
                    onClick={() => {
                      void responderSolicitud(s.id, true).then(recoger).catch(() => {});
                    }}
                  >
                    ✓
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4 className="ficha__seccion">Mis amigos · {amigos.length}</h4>

      {amigos.length > 3 && (
        <input
          className="ficha__buscar"
          type="search"
          value={busqueda}
          placeholder="Buscar amigo"
          aria-label="Buscar amigo"
          onChange={(evento) => setBusqueda(evento.target.value)}
        />
      )}

      {amigos.length === 0 ? (
        <p className="hint">
          Todavía no tienes a nadie. Pásale tu nombre con su tag —el botón de arriba del todo lo
          copia— o escribe el suyo aquí.
        </p>
      ) : (
        <ul className="ficha__lista">
          {visibles.map((a) => (
            <li key={`${a.apodo}#${a.tag}`} className="ficha__fila">
              <Avatar apodo={a.apodo} tag={a.tag} conFoto={a.conFoto} />
              <span className="ficha__fila-quien">
                <strong>
                  {a.apodo} <small>#{a.tag}</small>
                </strong>
                {a.juego && <span className="ficha__jugando">▶ {a.juego}</span>}
              </span>
              <span className={`ficha__estado ficha__estado--${a.estado}`}>
                <span className="dot" />
                {COMO_ESTA[a.estado]}
              </span>
              <button
                type="button"
                className="ficha__quitar"
                title={`Dejar de ser amigo de ${a.apodo}`}
                aria-label={`Dejar de ser amigo de ${a.apodo}`}
                onClick={() => {
                  void quitarAmigo(a.apodo, a.tag).then(recoger).catch(() => {});
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* ---------------- la ficha ---------------- */

export const FichaModal = ({ open, onClose, cuenta, especies }: Props) => {
  const [pestana, setPestana] = useState<'perfil' | 'amigos'>('perfil');
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cuantas, setCuantas] = useState(0);

  const dentro = cuenta.cuenta !== null;

  useEffect(() => {
    if (!open || !dentro) return;
    void miPerfil().then(setPerfil);
    void misAmigos()
      .then((d) => setCuantas(d.amigos.length + d.solicitudes.length))
      .catch(() => {});
  }, [open, dentro]);

  if (!dentro) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon="▣"
      title="Ficha de entrenador"
      subtitle={perfil ? `${perfil.apodo}#${perfil.tag}` : 'Tu perfil y tus amigos'}
    >
      <div className="tabs">
        <button
          type="button"
          className={pestana === 'perfil' ? 'is-active' : undefined}
          onClick={() => setPestana('perfil')}
        >
          Mi perfil
        </button>
        <button
          type="button"
          className={pestana === 'amigos' ? 'is-active' : undefined}
          onClick={() => setPestana('amigos')}
        >
          Amigos {cuantas > 0 ? cuantas : ''}
        </button>
      </div>

      {pestana === 'perfil' ? (
        perfil ? (
          <MiPerfil
            perfil={perfil}
            onPerfil={setPerfil}
            especies={especies}
            onSalir={() => {
              void cuenta.salir();
              onClose();
            }}
          />
        ) : (
          <p className="hint">Trayendo tu ficha…</p>
        )
      ) : (
        <Amigos />
      )}
    </Modal>
  );
};

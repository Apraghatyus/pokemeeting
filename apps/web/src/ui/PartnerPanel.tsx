/**
 * Hueco de la partida del companero.
 *
 * Todavia no hay conexion: este panel deja el sitio reservado y, sobre todo,
 * documenta en la propia interfaz que falta por construir, para que no parezca
 * que algo esta roto.
 */
export const PartnerPanel = () => (
  <section className="panel panel--partner">
    <h2>Partida del companero</h2>
    <div className="partner__screen">
      <p>Sin conexion</p>
    </div>
    <ul className="roadmap">
      <li className="roadmap__done">Emulador local funcionando</li>
      <li>Sala compartida por codigo (servidor de senalizacion)</li>
      <li>Ver su pantalla en directo (video por WebRTC)</li>
      <li>Soul Link: vincular capturas y debilitados</li>
      <li>Intercambios entre las dos partidas</li>
    </ul>
  </section>
);

import { useEffect, useRef } from 'react';

type Props = {
  /** Video en directo de la partida del companero, o null si no hay conexion. */
  stream: MediaStream | null;
  status: string;
};

/**
 * Pantalla del companero.
 *
 * El video llega por WebRTC directamente de su navegador. Lleva entre 100 y
 * 300 ms de retraso: sirve para acompanarle, no para reaccionar a su partida.
 */
export const PartnerPanel = ({ stream, status }: Props) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => {});
  }, [stream]);

  return (
    <section className="panel panel--partner">
      <h2>Partida del companero</h2>
      <div className="partner__screen">
        <video
          ref={videoRef}
          className={stream ? 'partner__video' : 'partner__video is-hidden'}
          playsInline
          muted
        />
        {!stream && <p>{status}</p>}
      </div>
    </section>
  );
};

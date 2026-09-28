import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';

// mGBA-wasm usa pthreads, que requieren SharedArrayBuffer. El navegador solo lo
// concede a documentos con aislamiento cross-origin, de ahi estas dos cabeceras.
// Sin ellas el nucleo arranca y falla de forma silenciosa y confusa.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * HTTPS con certificado autofirmado, activado con HTTPS=1.
 *
 * Hace falta para jugar desde el movil: SharedArrayBuffer solo existe en un
 * contexto seguro, y una IP de red local por HTTP no lo es. "localhost" si,
 * por eso en el ordenador se puede trabajar sin esto.
 *
 * El navegador avisara de que el certificado no es de confianza; hay que
 * aceptarlo una vez. Tras aceptarlo, el contexto ya es seguro.
 */
const useHttps = process.env['HTTPS'] === '1';

/**
 * Modo tunel, activado con TUNNEL=1: para abrir la partida a alguien de fuera
 * a traves de Cloudflare Tunnel, Tailscale Funnel o similar.
 *
 * Cambia dos cosas, y las dos son necesarias:
 *
 * 1. Se aceptan hosts desconocidos. Vite responde 403 a cualquier peticion
 *    cuyo Host no reconozca, asi que sin esto el tunel devuelve "Blocked
 *    request" y no hay forma de entrar.
 *
 * No se activa HTTPS aqui: el tunel ya pone el suyo, con certificado de
 * verdad, y la pagina llega al visitante por https.
 *
 * Sobre la aleatorizacion a traves del tunel: **si se permite**. Quien entra
 * manda su PROPIA ROM y la recibe de vuelta, que es procesar su fichero, no
 * distribuirlo. Lo unico que hacia falta era que la interfaz dejara de
 * prometerle "la ROM no sale de aqui" y le dijera adonde va; de eso se encarga
 * el cliente, que sabe si la pagina viene de localhost o de un dominio ajeno.
 *
 * Con RANDOMIZER_LOCAL_ONLY=1 se cierra a quien venga de fuera, por si se
 * prefiere no aceptar ficheros de nadie.
 */
const useTunnel = process.env['TUNNEL'] === '1';

const proxy: Record<string, ProxyOptions> = {
  // El servidor de salas se expone a traves de esta misma direccion.
  //
  // Asi, con la pagina en HTTPS, el WebSocket sale como wss:// por el mismo
  // origen y hereda su certificado. Conectando directamente al puerto 8787
  // en claro, el navegador bloquearia la conexion por contenido mixto y
  // haria falta un segundo certificado solo para el.
  '/signaling': {
    target: 'http://localhost:8787',
    ws: true,
    rewrite: (path) => path.replace(/^\/signaling/, ''),
  },
};

/** Hosts que consideramos "esta misma maquina". */
const isLocalHost = (host: string | undefined): boolean =>
  /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host ?? '');

/** Con esto puesto, solo se aleatoriza para quien entre por localhost. */
const randomizerLocalOnly = process.env['RANDOMIZER_LOCAL_ONLY'] === '1';

// El servicio de aleatorizacion escucha solo en 127.0.0.1. Pasar por aqui
// evita ademas problemas de origen cruzado desde la pagina.
proxy['/randomizer'] = {
  target: 'http://127.0.0.1:8788',
  rewrite: (path) => path.replace(/^\/randomizer/, ''),
  ...(randomizerLocalOnly
    ? {
        bypass: (req: { headers: { host?: string } }) =>
          isLocalHost(req.headers.host) ? undefined : false,
      }
    : {}),
};

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    headers: crossOriginIsolation,
    // Escucha en la red local para poder probar desde el movil u otra maquina.
    host: true,
    ...(useTunnel ? { allowedHosts: true as const } : {}),
    proxy,
  },
  preview: { headers: crossOriginIsolation },
  // El nucleo se sirve desde public/, nunca desde el grafo de dependencias.
  optimizeDeps: { exclude: ['@thenick775/mgba-wasm'] },
});

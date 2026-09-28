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
 * 2. Se retira la pasarela del servicio de aleatorizacion. Ese servicio corre
 *    en ESTA maquina: a traves del tunel, la ROM de la otra persona viajaria
 *    hasta aqui para aleatorizarse. No es ilegal, porque es su propio fichero
 *    y vuelve a ella, pero la interfaz le dice "la ROM no sale de aqui" y
 *    dejaria de ser verdad. Antes que matizar el mensaje, se quita la funcion:
 *    quien quiera aleatorizar que ejecute su propio servicio.
 *
 * No se activa HTTPS aqui: el tunel ya pone el suyo, con certificado de
 * verdad, y la pagina llega al visitante por https.
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

if (!useTunnel) {
  // El servicio de aleatorizacion escucha solo en 127.0.0.1. Pasar por
  // aqui evita ademas problemas de origen cruzado desde la pagina.
  proxy['/randomizer'] = {
    target: 'http://127.0.0.1:8788',
    rewrite: (path) => path.replace(/^\/randomizer/, ''),
  };
}

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

import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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

export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    headers: crossOriginIsolation,
    // Escucha en la red local para poder probar desde el movil u otra maquina.
    host: true,
    proxy: {
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
    },
  },
  preview: { headers: crossOriginIsolation },
  // El nucleo se sirve desde public/, nunca desde el grafo de dependencias.
  optimizeDeps: { exclude: ['@thenick775/mgba-wasm'] },
});

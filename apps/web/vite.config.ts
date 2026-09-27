import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// mGBA-wasm usa pthreads, que requieren SharedArrayBuffer. El navegador solo lo
// concede a documentos con aislamiento cross-origin, de ahi estas dos cabeceras.
// Sin ellas el nucleo arranca y falla de forma silenciosa y confusa.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: {
    headers: crossOriginIsolation,
    // Escucha en la red local para poder probar con dos maquinas.
    host: true,
  },
  preview: { headers: crossOriginIsolation },
  // El nucleo se sirve desde public/, nunca desde el grafo de dependencias.
  optimizeDeps: { exclude: ['@thenick775/mgba-wasm'] },
});

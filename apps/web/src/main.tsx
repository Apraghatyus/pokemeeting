import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Sin StrictMode a proposito: en desarrollo invoca los efectos dos veces, y el
// nucleo mGBA es un singleton wasm con pthreads que no admite arrancar dos veces
// sobre el mismo canvas. La proteccion iria en el codigo del emulador; preferimos
// no fingir que es reentrante.
createRoot(document.getElementById('root')!).render(<App />);

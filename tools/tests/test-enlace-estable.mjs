// Un parpadeo no es una caida.
//
// El fallo que se reporto: al host se le caia la sala de repente. La causa era
// que `disconnected` se trataba igual que `failed`, y no son lo mismo:
// `disconnected` quiere decir "ahora mismo no llegan paquetes" y WebRTC se
// recupera solo de eso continuamente -un salto de wifi a datos, un segundo de
// mala cobertura-. Tratarlo como una caida tiraba el enlace entero a la primera
// mala racha y obligaba a rehacer la sala.
//
// Se prueba la DECISION y no una conexion de verdad: montar WebRTC para
// comprobar que un enum se interpreta bien seria probar el navegador, no esto.
//
// Uso: npx tsx tools/tests/test-enlace-estable.mjs
import { pathToFileURL } from 'node:url';

const { esCaidaDefinitiva, GRACIA_ANTES_DE_RENDIRSE_MS } = await import(
  pathToFileURL(`${process.cwd()}/apps/web/src/net/peerLink.ts`).href
);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

// EL CASO QUE SE REPORTO.
check('un parpadeo NO es una caida', esCaidaDefinitiva('disconnected') === false);

check('pero fallar si lo es', esCaidaDefinitiva('failed') === true);
check('y cerrarla nosotros tambien', esCaidaDefinitiva('closed') === true);

// Los de camino tampoco son finales: todavia no ha pasado nada malo.
check('conectando no es una caida', esCaidaDefinitiva('connecting') === false);
check('ni recien creada', esCaidaDefinitiva('new') === false);
check('ni conectada, evidentemente', esCaidaDefinitiva('connected') === false);

// La espera tiene que ser util: muy corta no da tiempo a recuperarse, y muy
// larga deja a alguien mirando una imagen congelada sin saber que pasa.
check('la espera antes de rendirse es de segundos, no de milisegundos ni de minutos',
  GRACIA_ANTES_DE_RENDIRSE_MS >= 4000 && GRACIA_ANTES_DE_RENDIRSE_MS <= 20000,
  `${GRACIA_ANTES_DE_RENDIRSE_MS} ms`);

console.log(fallos === 0 ? '\nUN PARPADEO NO TIRA LA SALA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

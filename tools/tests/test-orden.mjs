// El orden del panel y quién va al frente.
//
// Existe por algo que se vio jugando: el panel se barajaba solo en mitad de un
// combate. No estaba leyendo mal; es que tercera generación **intercambia de
// verdad las ranuras del equipo** cuando sacas otro Pokémon, y el que entra pasa
// a ser el primero. O sea que el panel acertaba mirando la memoria y parecía
// equivocarse mirando la pantalla.
//
// Se arregla recordando el orden en que aparecieron. Y de paso cae gratis lo
// otro: si el que pelea está siempre en la ranura 0, iluminar esa ranura es
// iluminar al que pelea, sin tener que detectar el combate.
//
// Uso: npx tsx tools/tests/test-orden.mjs
import { pathToFileURL } from 'node:url';

const { ordenarEstable } = await import(
  pathToFileURL(`${process.cwd()}/apps/web/src/core/ordenEstable.ts`).href
);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

/** Un Pokemon: su mote hace de identidad legible y la personalidad de real. */
const pk = (mote, ranura, personalidad) => ({
  ranura,
  especie: 1,
  mote,
  nivel: 10,
  estado: null,
  tipos: null,
  huevo: false,
  personalidad,
});

const equipo = (...ranuras) => ({ juego: 'BPGS', momento: 0, ranuras });
const motes = (r) => r.map((x) => x.mote).join(',');

// --- el caso que lo destapo ---
// Cuatro Pokemon; el jugador los conoce en este orden.
const inicial = equipo(
  pk('Noay', 0, 101),
  pk('Juja', 1, 102),
  pk('Pxndx', 2, 103),
  pk('Huesitos', 3, 104),
);

const primera = ordenarEstable(inicial, []);
check('la primera vez manda la memoria', motes(primera.ranuras) === 'Noay,Juja,Pxndx,Huesitos',
  motes(primera.ranuras));
check('y el que va al frente es el de la ranura 0', primera.alFrente === 0);

// En combate sacas a Huesitos: el juego lo sube a la ranura 0 y baja a Noay.
const enCombate = equipo(
  pk('Huesitos', 0, 104),
  pk('Juja', 1, 102),
  pk('Pxndx', 2, 103),
  pk('Noay', 3, 101),
);

const segunda = ordenarEstable(enCombate, primera.orden);
check('al cambiar de Pokemon el panel NO se baraja',
  motes(segunda.ranuras) === 'Noay,Juja,Pxndx,Huesitos', motes(segunda.ranuras));

// Y lo que se gana: quien esta peleando es quien ocupa la ranura 0.
const alFrente = segunda.ranuras.find((r) => r.ranura === segunda.alFrente);
check('y el iluminado es el que acaba de salir a pelear', alFrente?.mote === 'Huesitos',
  alFrente?.mote ?? 'ninguno');

// Volver al primero lo devuelve al frente, sin mover el panel.
const tercera = ordenarEstable(inicial, segunda.orden);
check('volver a cambiar tampoco baraja nada',
  motes(tercera.ranuras) === 'Noay,Juja,Pxndx,Huesitos', motes(tercera.ranuras));
check('y el frente vuelve con el',
  tercera.ranuras.find((r) => r.ranura === tercera.alFrente)?.mote === 'Noay');

// --- uno nuevo entra por el final, no por donde diga la memoria ---
const conCapturado = equipo(
  pk('Huesitos', 0, 104),
  pk('Juja', 1, 102),
  pk('Pxndx', 2, 103),
  pk('Noay', 3, 101),
  pk('Nuevo', 4, 105),
);
const cuarta = ordenarEstable(conCapturado, segunda.orden);
check('un Pokemon nuevo entra al final',
  motes(cuarta.ranuras) === 'Noay,Juja,Pxndx,Huesitos,Nuevo', motes(cuarta.ranuras));

// --- y uno que se va, desaparece sin descolocar al resto ---
const sinPxndx = equipo(pk('Huesitos', 0, 104), pk('Juja', 1, 102), pk('Noay', 2, 101));
const quinta = ordenarEstable(sinPxndx, cuarta.orden);
check('el que ya no esta desaparece y los demas no se mueven',
  motes(quinta.ranuras) === 'Noay,Juja,Huesitos', motes(quinta.ranuras));

// --- dos con el mismo mote no se confunden ---
// Por eso se identifican por personalidad y no por el nombre.
const gemelos = equipo(pk('Eevee', 0, 201), pk('Eevee', 1, 202));
const sexta = ordenarEstable(gemelos, []);
const gemelosAlReves = equipo(pk('Eevee', 0, 202), pk('Eevee', 1, 201));
const septima = ordenarEstable(gemelosAlReves, sexta.orden);
check('dos con el mismo mote mantienen cada uno su sitio',
  septima.ranuras.map((r) => r.personalidad).join(',') === '201,202',
  septima.ranuras.map((r) => r.personalidad).join(','));

// --- casos de borde ---
const vacia = ordenarEstable(null, [101, 102]);
check('sin equipo no hay nadie al frente', vacia.alFrente === null);
check('pero no se olvida el orden aprendido', vacia.orden.join(',') === '101,102',
  vacia.orden.join(','));

const sinNada = ordenarEstable(equipo(), []);
check('un equipo vacio tampoco rompe nada',
  sinNada.ranuras.length === 0 && sinNada.alFrente === null);

console.log(fallos === 0 ? '\nEL PANEL NO SE BARAJA SOLO' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

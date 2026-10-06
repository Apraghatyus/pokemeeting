// El panel ensena el equipo como lo tiene el juego.
//
// Antes aqui se probaba lo contrario: que el panel NO se barajara, recordando el
// orden en que habian aparecido. Se hizo creyendo que tercera generacion sube a
// la ranura 0 al que sale a pelear, y por tanto que el orden de memoria bailaba
// en combate.
//
// Una partida de verdad desmintio las dos cosas a la vez: el equipo en el juego
// era [PEZGATO, A BUENO], el panel ensenaba [A BUENO, PEZGATO] -porque el orden
// "estable" se habia quedado con otro reparto- y encima iluminaba a PEZGATO
// mientras peleaba A BUENO.
//
// Asi que ahora manda el juego. El orden del panel tiene que poder compararse
// con la lista del propio juego mirando la pantalla, que es lo que hace el
// jugador.
//
// Uso: npx tsx tools/tests/test-orden.mjs
import { pathToFileURL } from 'node:url';

const { ordenarComoElJuego } = await import(
  pathToFileURL(`${process.cwd()}/apps/web/src/core/ordenEquipo.ts`).href
);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const pk = (mote, ranura, personalidad) => ({
  ranura, especie: 1, mote, nivel: 10,
  estado: null, tipos: null, huevo: false, personalidad,
});

const equipo = (ranuras, peleando = null) => ({ juego: 'BPES', momento: 0, ranuras, peleando });
const motes = (r) => r.map((x) => x.mote).join(',');

// --- EL CASO QUE LO DESTAPO ---
// En el juego: PEZGATO el primero, A BUENO el segundo. Peleando, A BUENO.
const real = equipo([pk('PEZGATO', 0, 101), pk('A BUENO', 1, 102)], 102);
const puesto = ordenarComoElJuego(real);

check('el panel ensena el mismo orden que la lista del juego',
  motes(puesto.ranuras) === 'PEZGATO,A BUENO', motes(puesto.ranuras));
check('y el iluminado es el que pelea, no el primero',
  puesto.alFrente === 102, String(puesto.alFrente));

const dondeEsta = puesto.ranuras.findIndex((r) => r.personalidad === puesto.alFrente);
check('o sea que la marca cae en el segundo de la lista', dondeEsta === 1,
  `esta en el puesto ${dondeEsta}`);

// --- sin combate no se ilumina a nadie ---
// Una marca permanente sobre el primero no dice nada, y encima enganaba: parecia
// que ese estaba peleando cuando solo era el primero de la lista.
const paseando = ordenarComoElJuego(equipo([pk('PEZGATO', 0, 101), pk('A BUENO', 1, 102)]));
check('fuera de combate no se ilumina a nadie', paseando.alFrente === null,
  String(paseando.alFrente));
check('pero el equipo se sigue viendo entero', paseando.ranuras.length === 2);

// --- el orden lo manda la ranura, venga como venga ---
// El lector local ya los da en orden, pero el del companero llega por la red.
const desordenado = ordenarComoElJuego(
  equipo([pk('Tercero', 2, 203), pk('Primero', 0, 201), pk('Segundo', 1, 202)]),
);
check('lo que llega de fuera se ordena igual',
  motes(desordenado.ranuras) === 'Primero,Segundo,Tercero', motes(desordenado.ranuras));

// --- cambiar de Pokemon mueve la marca, no la lista ---
const antes = ordenarComoElJuego(
  equipo([pk('PEZGATO', 0, 101), pk('A BUENO', 1, 102)], 101),
);
const despues = ordenarComoElJuego(
  equipo([pk('PEZGATO', 0, 101), pk('A BUENO', 1, 102)], 102),
);
check('al cambiar de Pokemon la lista no se mueve',
  motes(antes.ranuras) === motes(despues.ranuras), motes(despues.ranuras));
check('pero la marca si', antes.alFrente === 101 && despues.alFrente === 102);

// --- bordes ---
const vacia = ordenarComoElJuego(null);
check('sin equipo no hay nada que colocar', vacia.ranuras.length === 0 && vacia.alFrente === null);
check('un equipo vacio tampoco rompe nada',
  ordenarComoElJuego(equipo([])).ranuras.length === 0);

// Dos con el mismo mote no se confunden: se identifican por personalidad.
const gemelos = ordenarComoElJuego(
  equipo([pk('Eevee', 0, 201), pk('Eevee', 1, 202)], 202),
);
check('con dos motes iguales se ilumina el que toca',
  gemelos.ranuras.findIndex((r) => r.personalidad === gemelos.alFrente) === 1);

console.log(fallos === 0 ? '\nEL PANEL SE PARECE AL JUEGO' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

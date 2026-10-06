// Que en un movil no se descoloque nada.
//
// Dos fallos reales, y los dos de colocacion, no de logica. Por eso se prueban
// leyendo lo que el navegador CALCULA -direccion del flex, bordes de cada caja-
// y no mirando clases: las clases estaban bien puestas en los dos casos.
//
//   1. El equipo del companero se quedaba en columna. En escritorio su lista
//      crece de abajo arriba con `column-reverse`, y esa regla lleva dos clases
//      contra una de la del movil. Las @media no suman especificidad, asi que
//      ganaba la de escritorio: su equipo ocupaba el alto de dos fichas y
//      empujaba el mando fuera de la pantalla. El equipo propio salia bien, que
//      es lo que lo hacia dificil de ver.
//
//   2. El pie del modal del aleatorizador no cabia en una fila y no se partia.
//      Los botones no encogen -asi debe ser, un boton cortado no se puede
//      pulsar- asi que el unico que cedia era el texto, que se estrujaba en una
//      columna de una palabra por linea mientras el boton se salia igual por la
//      derecha.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-movil-colocacion.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-movil-colocacion.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const contexto = await navegador.newContext({
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await contexto.newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});

// --- 1. las dos listas de equipo, en tira ---
//
// La del companero solo sale con una sesion conectada, que no se puede montar
// desde aqui. Lo que se comprueba es la REGLA, que es donde estaba el fallo:
// se pinta la lista con sus clases y se mira que le calcula el navegador.
const direccionDe = (clases) =>
  page.evaluate((lista) => {
    const aside = document.createElement('aside');
    aside.className = lista;
    const ul = document.createElement('ul');
    ul.className = 'equipo__lista';
    aside.append(ul);
    document.body.append(aside);
    const direccion = getComputedStyle(ul).flexDirection;
    aside.remove();
    return direccion;
  }, clases);

const propio = await direccionDe('equipo equipo--propio');
check('tu equipo va en tira horizontal', propio === 'row', propio);

const companero = await direccionDe('equipo equipo--companero');
check('y el de tu companero tambien, que es el que se quedaba en columna',
  companero === 'row', companero);

// --- 2. el pie del modal ---
// El modal del aleatorizador sale solo al elegir la ROM.
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.waitForSelector('.modal[open] .modal__pie', { timeout: 20_000 });

const pie = await page.evaluate(() => {
  const modal = document.querySelector('.modal[open]');
  const pie = modal.querySelector('.modal__pie');
  const acciones = pie.querySelector('.aleatorizar__acciones');
  const nota = pie.querySelector('.aleatorizar__nota');
  const der = (el) => Math.round(el.getBoundingClientRect().right);
  return {
    direccion: getComputedStyle(pie).flexDirection,
    modalDer: der(modal),
    accionesDer: der(acciones),
    // Lineas que ocupa el texto de creditos: si se estruja, son muchas.
    lineasDeLaNota: Math.round(
      nota.getBoundingClientRect().height / parseFloat(getComputedStyle(nota).lineHeight),
    ),
  };
});

check('el pie se apila en vez de pelearse por el ancho', pie.direccion === 'column',
  pie.direccion);
check('los botones caben dentro del modal, sin salirse por la derecha',
  pie.accionesDer <= pie.modalDer,
  `botones hasta ${pie.accionesDer}, modal hasta ${pie.modalDer}`);
check('y los creditos no se estrujan en una columna de una palabra por linea',
  pie.lineasDeLaNota <= 2, `${pie.lineasDeLaNota} lineas`);

// Y nada de esto empuja la pagina a lo ancho, que es como se nota desde fuera.
const desborda = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth,
);
check('la pagina no se desplaza a lo ancho', desborda === false);

// --- 3. a pantalla completa, el equipo sigue debajo de la partida ---
//
// Aqui el equipo "desaparecia", y no desaparecia: quedaba DEBAJO de la partida.
// La regla de pantalla completa, pensada para escritorio, reparte el alto entre
// la mesa y el mando con `flex: 1`, y lleva dos clases y una pseudoclase contra
// la sola clase de la regla del movil. Ganaba ella, el mando se quedaba con casi
// todo el alto y la partida ya no cabia en la mesa: se desbordaba por encima del
// equipo. Medido en 360x740: la mesa recibia 214 pixeles para una partida de 229.
//
// Por eso no se comprueba si el equipo "se ve" -se veia, segun el navegador-
// sino que la partida quepa en su hueco, que es lo que fallaba.
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(2500);

await page.locator('.pantalla__boton--completa').first().click({ timeout: 8_000 });
await page.waitForTimeout(1200);

const completa = await page.evaluate(() => {
  const caja = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { arriba: Math.round(r.top), abajo: Math.round(r.bottom) };
  };
  return {
    enCompleta: document.fullscreenElement !== null,
    centro: caja('.mesa__centro'),
    partida: caja('.pantallas'),
    equipo: caja('.equipo'),
    mando: caja('.pad'),
  };
});

check('se entra en pantalla completa', completa.enCompleta === true);

if (completa.enCompleta && completa.centro && completa.partida) {
  // Un pixel de margen: los redondeos del navegador no son un fallo.
  check('la partida cabe en su hueco y no se desborda',
    completa.partida.abajo <= completa.centro.abajo + 1,
    `partida hasta ${completa.partida.abajo}, hueco hasta ${completa.centro.abajo}`);

  check('el equipo queda DEBAJO de la partida, no tapado por ella',
    completa.equipo.arriba >= completa.partida.abajo - 1,
    `equipo desde ${completa.equipo.arriba}, partida hasta ${completa.partida.abajo}`);

  check('y el mando debajo del equipo, que es el orden de siempre',
    completa.mando.arriba >= completa.equipo.abajo - 1,
    `mando desde ${completa.mando.arriba}, equipo hasta ${completa.equipo.abajo}`);
}

await navegador.close();
console.log(fallos === 0 ? '\nEN MOVIL NO SE DESCOLOCA NADA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

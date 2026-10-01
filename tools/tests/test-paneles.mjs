// Comprueba que el panel de equipo enseña lo que hay en la partida.
//
// Es la prueba que de verdad cierra la cadena: se carga una ROM, se le mete un
// estado de una partida real, y se mira si en la columna de la izquierda
// aparece el Pokemon que esa persona tiene. Entre medias estan la lectura de
// memoria cada pocos segundos, la tabla de nombres de la ROM y el componente.
//
// Uso: node tools/tests/test-paneles.mjs <rom.gba> <estado.bin> [carpeta]
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const [, , ROM, ESTADO, SHOTS = '.'] = process.argv;
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM || !ESTADO) {
  console.error('Uso: node tools/tests/test-paneles.mjs <rom.gba> <estado.bin> [carpeta]');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => {
  if (!/unwind/.test(e.message)) console.log(`[pageerror] ${e.message}`.slice(0, 160));
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});

// --- antes de cargar nada ---
check('tu columna esta ahi desde el principio',
  (await page.locator('.equipo--propio').count()) === 1);
// Las seis ranuras existen siempre, para que al entrar un Pokemon nuevo los
// demas no se muevan. Vacias no se ven, pero ocupan su sitio.
check('con sus seis huecos reservados',
  (await page.locator('.equipo--propio .ficha').count()) === 6);
check('y ninguno con Pokemon todavia',
  (await page.locator('.equipo--propio .ficha:not(.ficha--hueco)').count()) === 0);

// Jugando solo esa columna no existe: su sitio se lo queda la partida.
check('jugando solo no hay columna del companero',
  (await page.locator('.equipo--companero').count()) === 0);
check('y la mesa esta en modo de uno solo',
  (await page.locator('.mesa--solo').count()) === 1);

// --- se carga la ROM y la partida ---
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(5000);

const estado = [...new Uint8Array(readFileSync(ESTADO))];
const cargado = await page.evaluate(async (bytes) => {
  const m = globalThis.mGBAModule;
  const base = m.gameName.split('/').pop().replace(/\.[^.]+$/, '');
  m.FS.writeFile(`${m.filePaths().saveStatePath}/${base}.ss3`, new Uint8Array(bytes));
  await new Promise((r) => setTimeout(r, 200));
  return m.loadStateSlot(3, 0);
}, estado);
check('el estado de la partida se carga', cargado === 1 || cargado === true, String(cargado));

// El equipo se mira cada tres segundos: hay que darle una vuelta de margen.
const aparecio = await page
  .waitForFunction(
    () =>
      [...document.querySelectorAll('.equipo--propio .ficha')].filter(
        (f) => !f.classList.contains('ficha--hueco'),
      ).length > 0,
    null,
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false);
check('el panel se llena solo, sin tocar nada', aparecio);

if (aparecio) {
  const conPokemon = page.locator('.equipo--propio .ficha:not(.ficha--hueco)');
  const fichas = await conPokemon.count();
  check('con tantas fichas como Pokemon hay en la partida', fichas === 1, `${fichas} ficha(s)`);

  const texto = ((await conPokemon.first().textContent()) ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  check('y la ficha lleva el mote que le puso el jugador', /CCC/.test(texto), texto);
  check('su nivel', /Nv\.6/.test(texto), texto);
  check('y el nombre de la especie, sacado de la ROM', /BULBASAUR/i.test(texto), texto);

  // El sprite se pide a PokeAPI por su numero de Pokedex nacional, que sale de
  // una tabla de la propia ROM: la conversion no es una resta.
  const sprite = conPokemon.locator('.ficha__sprite--imagen').first();
  const src = (await sprite.getAttribute('src').catch(() => null)) ?? '';
  check('la ficha pide el sprite de la especie', /\/1\.png$/.test(src), src.slice(-60));
  // Hay que esperarla: la imagen va con carga diferida y mirarla nada mas
  // aparecer la ficha dice que no ha cargado cuando solo es que no ha llegado.
  const cargo = await sprite
    .evaluate(
      (img) =>
        new Promise((listo) => {
          if (img.complete) return listo(img.naturalWidth > 0);
          img.addEventListener('load', () => listo(img.naturalWidth > 0));
          img.addEventListener('error', () => listo(false));
          setTimeout(() => listo(img.naturalWidth > 0), 10_000);
        }),
    )
    .catch(() => false);
  check('y la imagen llega, que con aislamiento cross-origin no es obvio', cargo === true);

  // El tipo sale de la ROM que corre, no de una lista: con una copia
  // aleatorizada, una lista diria el tipo de siempre y seria falso.
  const tipos = await conPokemon.locator('.tipo').allTextContents();
  check('la ficha enseña el tipo de la especie', tipos.length >= 1, tipos.join(' / '));
  check('y es el que tiene en ESTA ROM, que aqui no esta aleatorizada',
    tipos.map((t) => t.toLowerCase()).join('/') === 'planta/veneno', tipos.join('/'));

  // Fuera de combate y sano: ni iluminado ni con estado alterado.
  check('un Pokemon sano no lleva etiqueta de estado',
    (await page.locator('.equipo--propio .estado').count()) === 0);
}

await page.screenshot({ path: `${SHOTS}/paneles.png` });
console.log(`captura en ${SHOTS}/paneles.png`);

await browser.close();
console.log(fallos === 0 ? '\nLOS PANELES ENSEÑAN LA PARTIDA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

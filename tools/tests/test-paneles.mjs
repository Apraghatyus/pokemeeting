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

// --- antes de cargar nada, los dos paneles explican por que estan vacios ---
const vacioPropio = ((await page.locator('.equipo--propio').textContent()) ?? '').replace(/\s+/g, ' ');
check('sin ROM, tu panel dice que falta cargarla', /Carga una ROM/.test(vacioPropio), vacioPropio.slice(0, 70));

const vacioCompanero = ((await page.locator('.equipo--companero').textContent()) ?? '').replace(/\s+/g, ' ');
check('y el del companero, que no hay nadie en la sala',
  /sala/.test(vacioCompanero), vacioCompanero.slice(0, 70));

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
  .waitForFunction(() => document.querySelectorAll('.equipo--propio .ficha').length > 0, null,
    { timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
check('el panel se llena solo, sin tocar nada', aparecio);

if (aparecio) {
  const fichas = await page.locator('.equipo--propio .ficha').count();
  check('con tantas fichas como Pokemon hay en la partida', fichas === 1, `${fichas} ficha(s)`);

  const texto = ((await page.locator('.equipo--propio .ficha').first().textContent()) ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  check('y la ficha lleva el mote que le puso el jugador', /CCC/.test(texto), texto);
  check('su nivel', /Nv\.6/.test(texto), texto);
  check('y el nombre de la especie, sacado de la ROM', /BULBASAUR/i.test(texto), texto);

  // Fuera de combate y sano: ni iluminado ni con estado alterado.
  check('un Pokemon sano no lleva etiqueta de estado',
    (await page.locator('.equipo--propio .estado').count()) === 0);
}

await page.screenshot({ path: `${SHOTS}/paneles.png` });
console.log(`captura en ${SHOTS}/paneles.png`);

await browser.close();
console.log(fallos === 0 ? '\nLOS PANELES ENSEÑAN LA PARTIDA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

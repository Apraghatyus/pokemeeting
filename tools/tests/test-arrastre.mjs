// Comprueba que la ventana del companero se lleva a la esquina que uno quiera.
//
// Se arrastra con el raton de verdad, no se simula cambiando clases: lo que
// puede fallar aqui es justo el gesto -que el boton de dentro se coma el
// arrastre, que no se distinga de un clic, que al soltar calcule mal la
// esquina- y eso no se ve de otra forma.
//
// Necesita el servidor de salas y la aplicacion levantados (npm run dev:all).
//
// Uso: node tools/tests/test-arrastre.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-arrastre.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
});

const abrir = async () => {
  const contexto = await navegador.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await contexto.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  return page;
};

const anfitrion = await abrir();
const invitado = await abrir();

await anfitrion.locator('.roomchip').click();
await anfitrion.locator('.tabs button', { hasText: 'Crear sala' }).click();
await anfitrion.locator('.form input[type=password]').fill('arrastre');
await anfitrion.locator('.form button[type=submit]').click();
await anfitrion.waitForSelector('.room-code', { timeout: 20_000 });
const codigo = ((await anfitrion.locator('.room-code').textContent()) ?? '').trim();
await anfitrion.keyboard.press('Escape');

await invitado.locator('.roomchip').click();
await invitado.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await invitado.locator('.form input.input--code').fill(codigo);
await invitado.locator('.form input[type=password]').fill('arrastre');
await invitado.locator('.form button[type=submit]').click();
await invitado.keyboard.press('Escape');

const ventana = invitado.locator('.pantalla--pequena');
await ventana.waitFor({ timeout: 45_000 });
await invitado.waitForTimeout(2500);

const esquinaActual = () =>
  invitado.evaluate(() => {
    const e = document.querySelector('.pantalla--pequena');
    if (!e) return 'no hay ventana pequena';
    return [...e.classList].find((c) => /^pantalla--(arriba|abajo)-/.test(c)) ?? null;
  });

check('empieza abajo a la derecha', (await esquinaActual()) === 'pantalla--abajo-der');

/** Arrastra la ventana hasta un punto de la partida. */
const arrastrarHasta = async (fraccionX, fraccionY) => {
  const caja = await ventana.boundingBox();
  const partida = await invitado.locator('.pantalla--grande').boundingBox();
  await invitado.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await invitado.mouse.down();
  // Varios pasos: con uno solo el navegador puede no mandar el pointermove.
  for (let i = 1; i <= 6; i += 1) {
    await invitado.mouse.move(
      partida.x + partida.width * fraccionX,
      partida.y + partida.height * fraccionY,
      { steps: 3 },
    );
    await invitado.waitForTimeout(40);
    void i;
  }
  await invitado.mouse.up();
  await invitado.waitForTimeout(600);
};

await arrastrarHasta(0.12, 0.12);
check('arrastrada arriba a la izquierda, se queda ahi',
  (await esquinaActual()) === 'pantalla--arriba-izq', (await esquinaActual()) ?? 'ninguna');

await arrastrarHasta(0.9, 0.15);
check('y de ahi a arriba a la derecha',
  (await esquinaActual()) === 'pantalla--arriba-der', (await esquinaActual()) ?? 'ninguna');

await arrastrarHasta(0.1, 0.88);
check('y abajo a la izquierda',
  (await esquinaActual()) === 'pantalla--abajo-izq', (await esquinaActual()) ?? 'ninguna');

// Sigue asomando por fuera, que es la gracia de donde esta.
const asoma = await invitado.evaluate(() => {
  const g = document.querySelector('.pantalla--grande').getBoundingClientRect();
  const p = document.querySelector('.pantalla--pequena').getBoundingClientRect();
  return Math.round(g.left - p.left);
});
check('y sigue asomando por fuera de la partida', asoma > 20, `${asoma}px por la izquierda`);

// Un clic en el boton de dentro no debe mover nada.
const antes = await esquinaActual();
await invitado.locator('.pantalla--pequena .pantalla__boton--intercambiar').click();
await invitado.waitForTimeout(600);
check('pulsar el boton de intercambiar no la arrastra', (await esquinaActual()) === antes);

// --- en una pantalla de movil no se arrastra ---
//
// Ahi el gesto compite con el desplazamiento de la pagina, y ademas las cuatro
// esquinas quedan casi en el mismo sitio.
await invitado.setViewportSize({ width: 420, height: 860 });
await invitado.waitForTimeout(900);
const antesDeMovil = await esquinaActual();
await arrastrarHasta(0.15, 0.15);
check('en una pantalla de movil, arrastrarla no la mueve',
  (await esquinaActual()) === antesDeMovil, (await esquinaActual()) ?? 'ninguna');
const gesto = await ventana.evaluate((e) => getComputedStyle(e).touchAction);
check('y el dedo vuelve a servir para desplazar la pagina', gesto === 'auto', gesto);

// Y la esquina se recuerda al volver.
await invitado.reload({ waitUntil: 'load' });
await invitado.waitForTimeout(1500);
const recordada = await invitado.evaluate(() => {
  try {
    return globalThis.localStorage.getItem('emupoke.esquina-companero');
  } catch {
    return null;
  }
});
check('la esquina elegida se recuerda', recordada === 'abajo-izq', recordada ?? 'nada');

await navegador.close();
console.log(fallos === 0 ? '\nLA VENTANA SE LLEVA A SU ESQUINA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

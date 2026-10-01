// Comprueba que el mando en pantalla aparece cuando hace falta y solo entonces.
//
// La pregunta que resuelve el codigo que se prueba aqui no es "¿que aparato es
// este?" sino "¿con que esta jugando ahora mismo esta persona?". No son lo
// mismo, y es justo por eso que mirar solo la consulta de medios no basta: un
// portatil con pantalla tactil la cumple igual que un movil, y ahi el mando
// estorba porque se juega con el teclado.
//
// Asi que se prueban las dos mitades: la suposicion de partida y, lo que
// importa de verdad, que se corrija con lo que el jugador hace. Y que si alguien
// lo pone a mano, deje de decidirse solo: mandar sobre algo que la persona
// acaba de elegir es de las cosas que mas molestan de una interfaz.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-mando.mjs <rom.gba>
import { chromium, devices } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-mando.mjs <rom.gba>');
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
  args: ['--autoplay-policy=no-user-gesture-required'],
});

/** Abre la aplicacion con una ROM puesta y jugando. */
const abrir = async (opciones) => {
  const contexto = await navegador.newContext(opciones);
  const page = await contexto.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page
    .getByRole('button', { name: 'Jugar tal cual' })
    .click({ timeout: 20_000 })
    .catch(() => {});
  await page.waitForTimeout(3000);
  return page;
};

/** ¿Esta el mando en pantalla? */
const hayMando = async (page) => (await page.locator('.pad').count()) > 0;

/** Enciende o apaga el mando a mano, desde los ajustes. */
const ponerAMano = async (page) => {
  await page.locator('.iconbutton--opciones').click();
  const boton = page.getByRole('button', { name: /mando tactil/ });
  await boton.waitFor({ timeout: 10_000 });
  const etiqueta = (await boton.textContent()) ?? '';
  await boton.click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  return etiqueta.trim();
};

// --------------------------------------------------------------- un movil
const movil = await abrir({ ...devices['Pixel 5'] });

check('en un movil el mando sale solo, sin tocar ajustes', await hayMando(movil));

// Lo que de verdad distingue a este codigo de mirar la consulta de medios:
// aqui el aparato sigue diciendo que es tactil, y aun asi el mando se va,
// porque quien juega ha cogido el teclado.
await movil.keyboard.press('ArrowRight');
await movil.waitForTimeout(400);
check('si se juega con el teclado, el mando se quita', (await hayMando(movil)) === false);

// Y vuelve en cuanto se suelta el teclado y se toca la pantalla.
await movil.touchscreen.tap(200, 300);
await movil.waitForTimeout(400);
check('y al volver a tocar la pantalla, vuelve', await hayMando(movil));

// Teclas que no son de jugar no cuentan: escribir el codigo de una sala en el
// movil no deberia dejar a nadie sin mando justo despues.
await movil.keyboard.press('Tab');
await movil.keyboard.press('q');
await movil.waitForTimeout(400);
check('escribir otras teclas no lo quita', await hayMando(movil));

// --- y en cuanto se decide a mano, se deja de decidir ---
const etiqueta = await ponerAMano(movil);
check('el ajuste ofrece quitarlo', /Ocultar/.test(etiqueta), etiqueta);
check('quitarlo a mano funciona', (await hayMando(movil)) === false);

await movil.touchscreen.tap(200, 300);
await movil.waitForTimeout(500);
check('y despues tocar la pantalla ya no lo trae de vuelta',
  (await hayMando(movil)) === false);

// ----------------------------------------------------------- un escritorio
// Sin pantalla tactil no hay nada que decidir: el mando solo quitaria sitio.
const escritorio = await abrir({ viewport: { width: 1280, height: 860 } });

check('en escritorio no aparece', (await hayMando(escritorio)) === false);

await escritorio.keyboard.press('ArrowRight');
await escritorio.waitForTimeout(300);
check('y jugar con el teclado lo deja igual', (await hayMando(escritorio)) === false);

// Se puede forzar: sirve para probarlo sin coger un movil.
const etiquetaEscritorio = await ponerAMano(escritorio);
check('se puede encender a mano desde los ajustes', await hayMando(escritorio),
  etiquetaEscritorio);

await navegador.close();
console.log(fallos === 0 ? '\nEL MANDO SALE CUANDO HACE FALTA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

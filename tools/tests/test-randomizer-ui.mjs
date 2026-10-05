// Prueba del menu de aleatorizacion.
//
// Comprueba las dos salidas de la pregunta que aparece al cargar una ROM:
// jugar tal cual, y aleatorizar marcando opciones. La comprobacion de fondo no
// es que los botones respondan, sino que despues el juego sigue corriendo con
// la copia que corresponde.
//
// Uso: node tools/tests/test-randomizer-ui.mjs <rom.gba> [carpeta-de-capturas]
import { chromium } from 'playwright';

const ROM = process.argv[2];
const SHOTS = process.argv[3] ?? '.';
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/tests/test-randomizer-ui.mjs <rom.gba> [carpeta]');
  process.exit(2);
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${name}${detail ? '  -> ' + detail : ''}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});

const abrir = async () => {
  const page = await browser.newPage({
    viewport: { width: 1360, height: 950 },
    ignoreHTTPSErrors: true,
  });
  // 'unwind' es ruido normal de emscripten al cambiar de ROM, no un fallo.
  page.on('pageerror', (e) => {
    if (!/unwind/.test(e.message)) console.log(`[pageerror] ${e.message}`.slice(0, 180));
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  return page;
};

// --- 1. jugar tal cual ---
const vanilla = await abrir();
// Al cargar una ROM se abre solo el menu del randomizer. Se comprueba por el
// contenido y no por el titulo: lo que importa es que ofrezca las dos salidas
// -jugar tal cual o aleatorizar-, no como se llame la ventana.
const preguntaVanilla = await vanilla
  .locator('.aleatorizar')
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
check('al cargar la ROM se ofrece aleatorizar', preguntaVanilla);
check('y se puede jugar tal cual sin aleatorizar nada',
  (await vanilla.getByRole('button', { name: 'Jugar tal cual' }).count()) === 1);

await vanilla.getByRole('button', { name: 'Jugar tal cual' }).click();
await vanilla.waitForTimeout(5000);
const jugandoVanilla = await vanilla.evaluate(
  () => document.querySelector('dialog.modal[open]') === null,
);
check('elegir jugar tal cual cierra la pregunta', jugandoVanilla);

const ficheroVanilla = await vanilla.evaluate(async () => {
  document.querySelector('.iconbutton--opciones').click();
  await new Promise((r) => setTimeout(r, 300));
  const celdas = document.querySelectorAll('.panel dd');
  return celdas[0]?.textContent ?? null;
});
check('sigue cargada la ROM original', !/aleatorizada/.test(ficheroVanilla ?? ''), ficheroVanilla ?? '');
await vanilla.close();

// --- 2. aleatorizar eligiendo opciones ---
const page = await abrir();
// Hay mas de un dialogo en la pagina (sala, aleatorizacion): se acota al abierto.
const modal = page.locator('dialog.modal[open]');
await modal.locator('.interruptor').first().waitFor({ timeout: 20_000 });

const total = await modal.locator('.interruptor').count();
// --- la forma: dos columnas, interruptores y huecos ---
const forma = await modal.evaluate(() => ({
  columnas: getComputedStyle(document.querySelector('.aleatorizar__rejilla'))
    .gridTemplateColumns.split(' ').length,
  libres: document.querySelectorAll('.hueco--libre').length,
  palancas: document.querySelectorAll('.interruptor__palanca').length,
  pie: document.querySelector('.modal__pie') !== null,
  // Lo que de verdad hay que comprobar de un modal nuevo: que entra entero.
  bajar: (() => {
    const c = document.querySelector('.modal[open] .modal__body');
    return Math.max(0, c.scrollHeight - c.clientHeight);
  })(),
}));
check('el menu va en dos columnas', forma.columnas === 2, `${forma.columnas}`);
check('se ven los huecos que quedan libres', forma.libres === 3, `${forma.libres}`);
check('las opciones son interruptores', forma.palancas === 15, `${forma.palancas}`);
check('las dos salidas van en el pie', forma.pie);
check('y en escritorio cabe sin desplazar', forma.bajar === 0, `${forma.bajar}px por bajar`);

check('el menu ofrece las opciones', total >= 7, `${total} opciones`);

const marcadasPorDefecto = await modal.locator('.interruptor input:checked').count();
check('vienen marcadas las habituales', marcadasPorDefecto >= 3, `${marcadasPorDefecto} marcadas`);

await modal.getByRole('button', { name: 'Desmarcar' }).click();
const tras = await modal.locator('.interruptor input:checked').count();
check('se pueden desmarcar todas', tras === 0);

const botonAleatorizar = modal.getByRole('button', { name: /Aleatorizar y jugar/ });
check('sin nada marcado no se puede aleatorizar', await botonAleatorizar.isDisabled());

// Marcamos tres concretas, incluyendo una que el registro del randomizer no
// menciona (objetos del mapa): comprobar que aun asi se informa de ella.
for (const etiqueta of ['Pokemon salvajes', 'Pokemon iniciales', 'Objetos del mapa']) {
  // Se pulsa la etiqueta, no la casilla: la casilla va oculta detras de la
  // palanca -es la que da teclado y semantica- y no se puede pulsar.
  await modal.locator('.interruptor', { hasText: etiqueta }).click();
}
const antes = await page.locator('canvas').screenshot();

await botonAleatorizar.click();
// Margen amplio: por un tunel hay que subir y bajar la ROM, y eso puede pasar
// del minuto aunque vaya comprimida.
const terminado = await modal
  .locator('.modal__title', { hasText: 'Partida aleatorizada' })
  .waitFor({ timeout: 300_000 })
  .then(() => true)
  .catch(() => false);
check('la aleatorizacion termina', terminado);

const texto = (await modal.textContent()) ?? '';
check('se dice que se aleatorizaron los Pokemon salvajes', /Pokemon salvajes/.test(texto));
check(
  'y tambien los objetos del mapa, que el registro no menciona',
  /Objetos del mapa/.test(texto),
  /Ha cambiado: ([^.]+)/.exec(texto)?.[1] ?? texto.slice(0, 120),
);
check('se nombran los nuevos iniciales', /Iniciales/.test(texto),
  /Iniciales\s*(.+?)semilla/.exec(texto.replace(/\s+/g, ' '))?.[1]?.trim() ?? '');
// Antes aqui se comprobaba un "Semilla usada: N" suelto. Ahora la semilla va
// dentro de la semilla, que es lo unico que sirve para rehacer la partida: una
// semilla sin sus ajustes no reconstruye nada.
check('se da la semilla para rehacer la partida', /EMUPOKE1\.[0-9a-f]{8}\.[0-9a-f]{8}\.\d+\./.test(texto),
  /EMUPOKE1\.\S{0,30}/.exec(texto)?.[0] ?? texto.slice(0, 120));

await page.screenshot({ path: `${SHOTS}/ui-randomizer.png`, fullPage: true });

await modal.getByRole('button', { name: 'Empezar a jugar' }).click();
await page.waitForTimeout(6000);

// Que el canvas cambie no demuestra nada: el juego anterior tambien se mueve.
// Lo que hay que comprobar es QUE ROM tiene cargada el nucleo.
const cargada = await page.evaluate(() => globalThis.mGBAModule?.gameName ?? null);
check(
  'el nucleo tiene cargada la ROM aleatorizada',
  // Cada copia lleva un sufijo propio para no pisar el guardado de otra.
  /-aleatoria-\w+\.gba$/.test(cargada ?? ''),
  cargada?.split('/').pop() ?? 'ninguna',
);

const despues = await page.locator('canvas').screenshot();
check('el emulador sigue dibujando con la ROM nueva', Buffer.compare(antes, despues) !== 0);

// --- aleatorizar otra vez debe partir de la ROM original, no de la generada ---
await page.locator('.iconbutton--opciones').click();
await page.locator('.boton-ancho', { hasText: 'Opciones' }).click();
const modal2 = page.locator('dialog.modal[open]');
await modal2.locator('.interruptor').first().waitFor({ timeout: 25_000 });
// Ya no se descarta nada: la partida anterior aparece en la lista para volver
// a ella, y aleatorizar crea otra aparte.
check(
  'ofrece volver a la partida ya creada',
  (await modal2.locator('.hueco--partida').count()) >= 1,
  `${await modal2.locator('.hueco--partida').count()} en la lista`,
);
await modal2.getByRole('button', { name: /Aleatorizar y jugar/ }).click();
await modal2
  .locator('.modal__title', { hasText: 'Partida aleatorizada' })
  .waitFor({ timeout: 300_000 });
await modal2.getByRole('button', { name: 'Empezar a jugar' }).click();
await page.waitForTimeout(3000);

const segunda = await page.evaluate(() => globalThis.mGBAModule?.gameName ?? null);
check(
  'la segunda no encadena nombres sobre la primera',
  !/-aleatorizada-aleatorizada|-aleatoria-\w+-aleatoria/.test(segunda ?? ''),
  segunda?.split('/').pop() ?? 'ninguna',
);

// Cada aleatorizacion es una partida aparte, asi que ahora SI se conservan:
// la original mas una copia por cada vez que se aleatorizo.
const ficheros = await page.evaluate(() => {
  const m = globalThis.mGBAModule;
  try {
    return m.FS.readdir(m.filePaths().gamePath).filter((f) => !f.startsWith('.'));
  } catch {
    return [];
  }
});
check('cada aleatorizacion conserva su propia copia', ficheros.length === 3,
  `${ficheros.length} ficheros: ${ficheros.map((f) => f.slice(-16)).join(' | ')}`);

// --- y se puede cambiar de ROM sin recargar ---
await page.locator('.iconbutton--opciones').click();
await page.getByRole('button', { name: 'Cambiar ROM' }).click();
const vuelveLaZona = await page
  .locator('.dropzone')
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
check('se puede volver a la pantalla de carga sin recargar', vuelveLaZona);

const vuelveAPreguntar = await page.evaluate(
  () => document.querySelector('dialog.modal[open]') !== null,
);
check('no vuelve a preguntar por la ROM que acaba de generar', !vuelveAPreguntar);

await browser.close();
console.log(failures === 0 ? '\nMENU DE ALEATORIZACION FUNCIONANDO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

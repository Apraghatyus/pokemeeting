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

// La cuenta tiene que cuadrar a la vista: el tope es de tres EN TOTAL y lo
// comparten todas las ROMs, asi que si una partida de otro juego ocupa un hueco
// hay que verla. Si no, el contador dice 1/3 y debajo solo hay dos huecos:
// parece que falte uno.
// Se busca DENTRO del dialogo abierto y no con `document`, que es global: el
// cartel de fin de partida tambien tiene un `.cuenta` -el de las medallas- y
// aunque su dialogo este cerrado sigue en el documento. Buscando por fuera salia
// el suyo y la comprobacion fallaba por el sitio equivocado.
const cuadra = await modal.evaluate((caja) => {
  const texto = caja.querySelector('.cuenta')?.textContent?.trim() ?? '';
  const [usadas, tope] = texto.split('/').map(Number);
  return {
    texto,
    tope,
    // Todo lo que ocupa o puede ocupar un hueco, se llame como se llame.
    dibujados: caja.querySelectorAll('.hueco').length,
    ocupados: caja.querySelectorAll('.hueco--partida, .hueco--ajena').length,
    usadas,
  };
});
check('el contador y los huecos dibujados dicen lo mismo',
  cuadra.dibujados === cuadra.tope,
  `${cuadra.texto} y ${cuadra.dibujados} huecos`);
check('y los ocupados son los que dice el contador',
  cuadra.ocupados === cuadra.usadas,
  `${cuadra.ocupados} ocupados, el contador dice ${cuadra.usadas}`);
check('las opciones son interruptores', forma.palancas === 15, `${forma.palancas}`);
check('las dos salidas van en el pie', forma.pie);
check('y en escritorio cabe sin desplazar', forma.bajar === 0, `${forma.bajar}px por bajar`);

check('el menu ofrece las opciones', total >= 7, `${total} opciones`);

const marcadasPorDefecto = await modal.locator('.interruptor input:checked').count();
check('vienen marcadas las habituales', marcadasPorDefecto >= 3, `${marcadasPorDefecto} marcadas`);

// Se apagan una a una: ya no hay boton de desmarcar todas. Se pulsa siempre el
// PRIMERO que siga encendido y se vuelve a mirar, porque al apagarlo deja de
// estar en la lista y los indices se mueven bajo los pies. Y se pulsa la
// etiqueta, que la casilla va oculta detras de la palanca.
for (let vuelta = 0; vuelta < 20; vuelta += 1) {
  const encendidos = modal.locator('.interruptor.is-on');
  if ((await encendidos.count()) === 0) break;
  await encendidos.first().click();
}
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
// Sin distinguir mayusculas: la lista se escribe en minusculas dentro de la
// frase, y lo que importa es que el apartado se nombre, no como se escriba.
check('se dice que se aleatorizaron los Pokemon salvajes', /pokemon salvajes/i.test(texto));
check(
  'y tambien los objetos del mapa, que el registro no menciona',
  /objetos del mapa/i.test(texto),
  /Ha cambiado: ([^.]+)/i.exec(texto)?.[1] ?? texto.slice(0, 120),
);

// Los iniciales ya NO se enseñan aqui, y es a proposito: descubrirlos es parte
// de la gracia de aleatorizar y verlos antes de empezar es un spoiler servido.
//
// Se busca su FORMA y no la palabra "iniciales", que ahora aparece en la lista
// de lo que cambio: lo que se enseñaba eran tres nombres en mayusculas
// separados por barras, y eso no lo produce ninguna otra parte de la pantalla.
check('no se spoilean los iniciales',
  !/[A-Z]{3,}\s*\/\s*[A-Z]{3,}/.test(texto),
  /[A-Z]{3,}\s*\/\s*[A-Z]{3,}/.exec(texto)?.[0] ?? 'ninguno a la vista');

// A cambio, la partida nace con nombre y se puede cambiar.
const campoNombre = modal.locator('.hecha__nombre input');
check('la partida nace con un nombre', ((await campoNombre.inputValue()) ?? '').length > 0,
  await campoNombre.inputValue());
await campoNombre.fill('Mi Soul Link');
await page.waitForTimeout(300);
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
// El nombre que se le puso tiene que ser el que la identifica en la lista:
// antes todas se llamaban por lo que se aleatorizo, asi que dos partidas de la
// misma ROM salian con el mismo texto recortado y no habia forma de saber cual
// era cual. Y cada una dice de que juego es, porque el cupo lo comparten todos.
const enLaLista = await modal.evaluate(() => ({
  nombres: [...document.querySelectorAll('.hueco__nombre')].map((e) => e.textContent?.trim()),
  juegos: [...document.querySelectorAll('.hueco__juego')].map((e) => e.textContent?.trim()),
}));
check('la lista la llama por el nombre que le pusiste',
  enLaLista.nombres.includes('Mi Soul Link'), enLaLista.nombres.join(' | '));
check('y dice de que juego es',
  enLaLista.juegos.length > 0 && enLaLista.juegos.every((j) => j && j.length > 0),
  enLaLista.juegos.join(' | '));

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

// Los botones de una partida guardada: cambiarle el nombre, y borrarla.
//
// Borrar no se puede deshacer: se va la copia y su guardado, y si es una Soul
// Link se lleva por delante horas de DOS personas. El boton esta a cinco
// pixeles del de descargar, asi que un roce no puede bastar.
//
// Lo que se comprueba, y en este orden porque es el orden en que importa:
//
//   1. Que un clic NO borra. Es lo unico que de verdad protege algo.
//   2. Que decir que no la deja donde estaba.
//   3. Que decir que si la borra, porque un boton que pregunta y luego no hace
//      nada es peor que ninguno.
//
// La equis de antes se cambio por una papelera: era la misma equis que cierra
// el menu dos centimetros mas arriba, y lo que hace es otra cosa muy distinta.
//
// Necesita la aplicacion levantada (npm run dev:all) y el servicio de
// aleatorizacion, porque primero hay que crear una partida que borrar.
//
// Y lo otro que se prueba aqui, porque vive en la misma fila: cambiarle el
// nombre. El nombre se ponia al crear la partida y no habia forma de tocarlo
// despues; con tres partidas de la misma ROM es lo unico que las distingue, asi
// que una mal puesta se quedaba asi para siempre.
//
// Uso: node tools/tests/test-borrar-partida.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-borrar-partida.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await navegador.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.waitForSelector('.interruptor', { timeout: 30_000 });

// Primero hay que tener algo que borrar.
await page.getByRole('button', { name: 'Aleatorizar y jugar' }).click({ timeout: 20_000 });
await page.locator('.hecha__cambios, .hecha .warn').first().waitFor({ timeout: 180_000 });
await page.getByRole('button', { name: 'Empezar a jugar' }).click();
await page.waitForTimeout(2500);

// Y volver al menu, que es donde esta la lista.
await page.locator('.roomchip').click().catch(() => {});
await page.locator('.modal[open] .modal__close').first().click().catch(() => {});
await page.evaluate(() => {
  const abrir = [...document.querySelectorAll('button')].find((b) =>
    /randomizer|aleatoriz/i.test(b.getAttribute('title') ?? b.getAttribute('aria-label') ?? ''),
  );
  abrir?.click();
});
await page.waitForTimeout(800);

const lista = page.locator('.modal[open] .hueco--partida');
if ((await lista.count()) === 0) {
  // Si no hay forma de volver al menu desde aqui, se recarga: la partida queda
  // apuntada en el navegador, asi que sigue estando.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.waitForSelector('.hueco--partida', { timeout: 30_000 });
}

const cuantas = () => page.locator('.modal[open] .hueco--partida').count();
const alPrincipio = await cuantas();
check('hay una partida que borrar', alPrincipio >= 1, `${alPrincipio}`);

// --- el boton ---
const borrar = page.locator('.modal[open] .hueco__accion--borrar').first();
check('el boton de borrar es una papelera, no una equis',
  (await borrar.locator('svg').count()) === 1 &&
    ((await borrar.textContent()) ?? '').trim() === '',
  JSON.stringify((await borrar.textContent()) ?? ''));

// --- cambiarle el nombre ---
const nombres = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.modal[open] .hueco__nombre')].map((e) => e.textContent?.trim()),
  );

await page.locator('.modal[open] .hueco__accion[title="Cambiarle el nombre"]').first().click();
await page.waitForTimeout(300);

const campo = page.locator('.modal[open] .hueco__nombre-campo');
check('el lapiz abre el nombre para escribir', (await campo.count()) === 1);
check('y viene con el que ya tenia, para retocarlo',
  ((await campo.inputValue()) ?? '').length > 0, await campo.inputValue());
// Mientras se escribe, los botones de la fila se quitan: la papelera esta a
// cinco pixeles y escribiendo no se mira donde se pulsa.
check('y mientras se escribe no hay papelera que rozar',
  (await page.locator('.modal[open] .hueco--partida .hueco__accion--borrar').count()) === 0);

await campo.fill('Nuestra Soullink');
await campo.press('Enter');
await page.waitForTimeout(500);
check('se guarda el nombre nuevo', (await nombres()).includes('Nuestra Soullink'),
  (await nombres()).join(' / '));

// Y se queda: se apunta donde se apuntan las partidas, no solo en la pantalla.
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.waitForSelector('.hueco--partida', { timeout: 30_000 });
check('y sigue puesto al volver', (await nombres()).includes('Nuestra Soullink'),
  (await nombres()).join(' / '));

// Dejarlo no cambia nada, que es la otra mitad.
await page.locator('.modal[open] .hueco__accion[title="Cambiarle el nombre"]').first().click();
await page.waitForTimeout(300);
await page.locator('.modal[open] .hueco__nombre-campo').fill('No quiero esto');
await page.locator('.modal[open] .hueco__accion[title="Dejarlo como estaba"]').click();
await page.waitForTimeout(400);
check('y dejarlo lo deja como estaba', (await nombres()).includes('Nuestra Soullink'),
  (await nombres()).join(' / '));

// --- 1. un clic no borra ---
await borrar.click();
await page.waitForTimeout(400);

check('un clic NO borra la partida', (await cuantas()) === alPrincipio, `${await cuantas()}`);
check('pregunta dentro de la propia ficha',
  (await page.locator('.modal[open] .hueco--partida .hueco__seguro').count()) === 1,
  ((await page.locator('.modal[open] .hueco__seguro').textContent()) ?? '').trim());
check('y ofrece las dos salidas',
  (await page.locator('.modal[open] .hueco__accion--si').count()) === 1 &&
    (await page.locator('.modal[open] .hueco__acciones--seguro .hueco__accion').count()) === 2);

// Preguntar no puede mover la lista: si la ficha cambia de alto, las de abajo
// dan un salto y se pulsa la que no era.
const altos = await page.evaluate(() =>
  [...document.querySelectorAll('.modal[open] .hueco--partida')].map((e) =>
    Math.round(e.getBoundingClientRect().height),
  ),
);
check('y preguntar no cambia el alto de la ficha',
  altos.every((h) => h === altos[0]), altos.join(', '));

// --- 2. decir que no la deja donde estaba ---
await page.locator('.modal[open] .hueco__acciones--seguro .hueco__accion').last().click();
await page.waitForTimeout(400);
check('decir que no la deja donde estaba', (await cuantas()) === alPrincipio, `${await cuantas()}`);
check('y se vuelve a ver la papelera',
  (await page.locator('.modal[open] .hueco__accion--borrar').count()) >= 1);

// --- 3. decir que si la borra ---
await page.locator('.modal[open] .hueco__accion--borrar').first().click();
await page.waitForTimeout(300);
await page.locator('.modal[open] .hueco__accion--si').click();
await page.waitForTimeout(600);
check('y decir que si la borra de verdad', (await cuantas()) === alPrincipio - 1,
  `${await cuantas()} de ${alPrincipio}`);

await navegador.close();
console.log(
  fallos === 0 ? '\nLOS BOTONES DE UNA PARTIDA HACEN LO QUE DICEN' : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

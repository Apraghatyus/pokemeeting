// Comprueba que cada aleatorizacion es una partida aparte y que se conservan.
//
// Reproduce el caso que fallaba: se juega, se guarda, se recarga la pagina y se
// vuelve a aleatorizar la misma ROM. Antes todas las copias se llamaban igual,
// asi que la nueva heredaba el guardado de la anterior: la ROM era nueva pero
// el progreso era el viejo, y parecia que no se habia generado nada.
//
// Ahora cada copia tiene nombre propio, ninguna pisa a la otra, y las dos
// quedan en la lista para poder volver a cualquiera.
//
// Uso: node tools/test-randomizer-limpio.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Falta la ROM.\nUso: node tools/test-randomizer-limpio.mjs <rom.gba>');
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
// Un solo contexto: IndexedDB tiene que sobrevivir a la recarga, como en un
// navegador de verdad.
const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await context.newPage();
page.on('pageerror', (e) => {
  if (!/unwind/.test(e.message)) console.log(`[pageerror] ${e.message}`.slice(0, 160));
});

const aleatorizar = async () => {
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  const modal = page.locator('dialog.modal[open]');
  await modal.locator('.opcion').first().waitFor({ timeout: 30_000 });
  await modal.getByRole('button', { name: 'Aleatorizar y jugar' }).click();
  await modal.locator('.modal__title', { hasText: 'Partida aleatorizada' }).waitFor({
    timeout: 300_000,
  });
  const texto = ((await modal.textContent()) ?? '').replace(/\s+/g, ' ');
  await modal.getByRole('button', { name: 'Empezar a jugar' }).click();
  await page.waitForTimeout(2500);
  // La semilla va dentro de la receta, que es el cuarto campo de la linea.
  return /EMUPOKE1\.[0-9a-f]{8}\.[0-9a-f]{8}\.(\d+)\./.exec(texto)?.[1] ?? null;
};

const guardados = () =>
  page.evaluate(() => {
    const m = globalThis.mGBAModule;
    try {
      return m.FS.readdir(m.filePaths().savePath).filter((f) => !f.startsWith('.'));
    } catch {
      return [];
    }
  });

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});

const primera = await aleatorizar();
check('la primera aleatorizacion funciona', primera !== null, `semilla ${primera}`);

// Simulamos que el jugador guardo dentro del juego: se escribe un fichero de
// partida reconocible y se persiste, que es lo que hace mGBA al guardar.
const marca = await page.evaluate(async () => {
  const m = globalThis.mGBAModule;
  const nombre = m.gameName.split('/').pop().replace(/\.gba$/i, '.sav');
  const ruta = `${m.filePaths().savePath}/${nombre}`;
  const contenido = new Uint8Array(128).fill(0xa5);
  m.FS.writeFile(ruta, contenido);
  await m.FSSync();
  return ruta;
});
check('se deja una partida guardada persistida', marca.endsWith('.sav'), marca.split('/').pop());

console.log('\nrecargando la pagina...\n');
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});

const trasRecargar = await guardados();
check(
  'el guardado sobrevive a la recarga (si no, no se prueba nada)',
  trasRecargar.some((f) => /\.sav$/.test(f)),
  trasRecargar.join(' | ') || '(ninguno)',
);

// Al volver a cargar la misma ROM debe ofrecerse la partida anterior.
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
const modal = page.locator('dialog.modal[open]');
await modal.locator('.opcion').first().waitFor({ timeout: 30_000 });
check('se ofrece la partida guardada de esta ROM', (await modal.locator('.partida').count()) === 1,
  `${await modal.locator('.partida').count()} en la lista`);

// Generamos una segunda, que no debe pisar a la primera.
await modal.getByRole('button', { name: 'Aleatorizar y jugar' }).click();
await modal.locator('.modal__title', { hasText: 'Partida aleatorizada' }).waitFor({ timeout: 300_000 });
const texto2 = ((await modal.textContent()) ?? '').replace(/\s+/g, ' ');
const segunda = /EMUPOKE1\.[0-9a-f]{8}\.[0-9a-f]{8}\.(\d+)\./.exec(texto2)?.[1] ?? null;
await modal.getByRole('button', { name: 'Empezar a jugar' }).click();
await page.waitForTimeout(2500);
check('la segunda aleatorizacion usa otra semilla', segunda !== null && segunda !== primera,
  `${primera} -> ${segunda}`);

// La partida vieja, con su marca, tiene que seguir intacta.
const viejaIntacta = await page.evaluate((ruta) => {
  const m = globalThis.mGBAModule;
  try {
    if (!m.FS.analyzePath(ruta).exists) return { existe: false, marcado: false };
    const datos = m.FS.readFile(ruta);
    return { existe: true, marcado: datos.length > 0 && datos[0] === 0xa5 };
  } catch {
    return { existe: false, marcado: false };
  }
}, marca);
check('la partida anterior sigue guardada e intacta', viejaIntacta.existe && viejaIntacta.marcado,
  JSON.stringify(viejaIntacta));

// Y la copia nueva arranca limpia, sin heredar ese guardado.
const nuevaLimpia = await page.evaluate(() => {
  const m = globalThis.mGBAModule;
  const nombre = m.gameName.split('/').pop().replace(/\.gba$/i, '.sav');
  const ruta = `${m.filePaths().savePath}/${nombre}`;
  try {
    if (!m.FS.analyzePath(ruta).exists) return { heredado: false };
    const datos = m.FS.readFile(ruta);
    return { heredado: datos.length > 0 && datos[0] === 0xa5 };
  } catch {
    return { heredado: false };
  }
});
check('la copia nueva no hereda el guardado de la anterior', !nuevaLimpia.heredado);

// --- volver a la partida vieja desde la lista ---
await page.locator('.iconbutton--opciones').click();
await page.getByRole('button', { name: 'Cargar otra ROM' }).click();
await page.locator('.dropzone').waitFor({ timeout: 10_000 });
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
const modal3 = page.locator('dialog.modal[open]');
await modal3.locator('.partida').first().waitFor({ timeout: 30_000 });
check('ahora hay dos partidas en la lista', (await modal3.locator('.partida').count()) === 2,
  `${await modal3.locator('.partida').count()} en la lista`);

// La ultima de la lista es la mas antigua: la primera que creamos.
await modal3.locator('.partida__abrir').last().click();
await page.waitForTimeout(3000);
const recuperada = await page.evaluate(() => globalThis.mGBAModule?.gameName?.split('/').pop() ?? null);
check('se puede continuar una partida guardada', recuperada !== null && /aleatoria/.test(recuperada),
  recuperada ?? 'ninguna');

// --- el tope de tres partidas ---
//
// Cada copia es una ROM entera en el almacenamiento del navegador, asi que no
// pueden acumularse sin limite.
await page.locator('.iconbutton--opciones').click();
await page.getByRole('button', { name: 'Cargar otra ROM' }).click();
await page.locator('.dropzone').waitFor({ timeout: 10_000 });
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
const modalTope = page.locator('dialog.modal[open]');
await modalTope.locator('.opcion').first().waitFor({ timeout: 30_000 });

// Van dos: generamos la tercera y el boton debe quedar bloqueado.
await modalTope.getByRole('button', { name: 'Aleatorizar y jugar' }).click();
await modalTope.locator('.modal__title', { hasText: 'Partida aleatorizada' }).waitFor({ timeout: 300_000 });
await modalTope.getByRole('button', { name: 'Empezar a jugar' }).click();
await page.waitForTimeout(2000);

await page.locator('.iconbutton--opciones').click();
await page.getByRole('button', { name: 'Cargar otra ROM' }).click();
await page.locator('.dropzone').waitFor({ timeout: 10_000 });
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
const modalLleno = page.locator('dialog.modal[open]');
await modalLleno.locator('.opcion').first().waitFor({ timeout: 30_000 });

check('con tres partidas ya no deja crear otra',
  await modalLleno.getByRole('button', { name: /Aleatorizar y jugar/ }).isDisabled());
check('y explica por que',
  /maximo/.test((await modalLleno.textContent()) ?? ''),
  /Tienes \d+ partidas[^.]*\./.exec((await modalLleno.textContent()) ?? '')?.[0] ?? '');

// --- y se puede borrar una ---
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.locator('.iconbutton--opciones').click();
await page.getByRole('button', { name: 'Cargar otra ROM' }).click();
await page.locator('.dropzone').waitFor({ timeout: 10_000 });
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
const modal4 = page.locator('dialog.modal[open]');
await modal4.locator('.partida').first().waitFor({ timeout: 30_000 });
const antesDeBorrar = await modal4.locator('.partida').count();
await modal4.locator('.partida__borrar').first().click();
await page.waitForTimeout(500);
check('borrar quita la partida de la lista',
  (await modal4.locator('.partida').count()) === antesDeBorrar - 1,
  `${antesDeBorrar} -> ${await modal4.locator('.partida').count()}`);
check('y vuelve a dejar crear una nueva',
  !(await modal4.getByRole('button', { name: /Aleatorizar y jugar/ }).isDisabled()));

await browser.close();
console.log(failures === 0 ? '\nCADA ALEATORIZACION EMPIEZA DE CERO' : `\n${failures} COMPROBACIONES FALLIDAS`);
process.exit(failures === 0 ? 0 : 1);

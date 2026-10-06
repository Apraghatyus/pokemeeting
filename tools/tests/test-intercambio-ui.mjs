// Un intercambio de verdad, entre dos navegadores.
//
// Lo que se comprueba no es que la pantalla se vea, es que al final el Pokemon
// ESTA en la partida del otro. Por eso se miran los equipos antes y despues:
// cada uno ofrece una ranura distinta, asi que si el intercambio funciona, al
// que entrega la ranura 0 tiene que llegarle lo que habia en la ranura 1 del
// companero.
//
// Los dos arrancan del mismo estado de partida para que los equipos sean
// iguales y el cambio se pueda comprobar sin ambiguedad.
//
// Y se comprueba tambien lo que NO pasa: que nadie toque su partida hasta que
// los dos hayan dicho que si. Ese es el motivo de que el intercambio tenga dos
// fases, y sin esa comprobacion las dos fases podrian desaparecer sin que
// ninguna prueba se enterara.
//
// Necesita la aplicacion entera levantada (npm run dev:all).
//
// Uso: node tools/tests/test-intercambio-ui.mjs <rom.gba> <estado.bin>
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const [ROM, ESTADO] = process.argv.slice(2);
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM || !ESTADO) {
  console.error('Uso: node tools/tests/test-intercambio-ui.mjs <rom.gba> <estado.bin>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const bytesDelEstado = Array.from(new Uint8Array(readFileSync(ESTADO)));

const navegador = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'],
});

/** Abre una pestana con la ROM cargada y la partida puesta donde toca. */
const abrir = async () => {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await contexto.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3500);

  // Se carga el estado en vez de jugar hasta tener equipo: llegar andando desde
  // el menu del titulo es demasiado fragil para una prueba.
  await page.evaluate((datos) => {
    const core = globalThis.mGBAModule;
    const base = (core.gameName?.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    core.FS.writeFile(`${core.filePaths().saveStatePath}/${base}.ss3`, new Uint8Array(datos));
    core.loadStateSlot(3, 0);
  }, bytesDelEstado);
  await page.waitForTimeout(5000);
  return page;
};

/** Los motes del equipo, en orden. De aqui sale la comprobacion final. */
const equipoDe = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.equipo--propio .ficha:not(.ficha--hueco) .ficha__nombre')].map(
      (e) => e.textContent?.trim() ?? '',
    ),
  );

const ana = await abrir();
const beto = await abrir();

const equipoAna = await equipoDe(ana);
const equipoBeto = await equipoDe(beto);
check('las dos partidas tienen equipo', equipoAna.length >= 2 && equipoBeto.length >= 2,
  `${equipoAna.length} y ${equipoBeto.length}`);
if (equipoAna.length < 2) {
  console.log('\nSin al menos dos Pokemon no se puede intercambiar nada. Se corta aqui.');
  await navegador.close();
  process.exit(1);
}
console.log(`     equipo de partida: ${equipoAna.join(', ')}`);

// --- se juntan en una sala ---
await ana.locator('.roomchip').click();
await ana.locator('.tabs button', { hasText: 'Crear sala' }).click();
await ana.locator('.form input[type=password]').fill('trato');
await ana.locator('.form button[type=submit]').click();
await ana.waitForSelector('.room-code', { timeout: 20_000 });
const codigo = ((await ana.locator('.room-code').textContent()) ?? '').trim();
await ana.keyboard.press('Escape');

await beto.locator('.roomchip').click();
await beto.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await beto.locator('.form input.input--code').fill(codigo);
await beto.locator('.form input[type=password]').fill('trato');
await beto.locator('.form button[type=submit]').click();
await beto.keyboard.press('Escape');

const botonTrato = '[aria-label="Intercambiar un Pokemon"]';
await ana.waitForSelector(botonTrato, { timeout: 45_000 });
await beto.waitForSelector(botonTrato, { timeout: 45_000 });
check('con companero aparece el boton de intercambiar', true);

await ana.waitForTimeout(3000);
await ana.locator(botonTrato).click();
await beto.locator(botonTrato).click();
await ana.waitForTimeout(800);

// --- cada uno pone uno sobre la mesa, de ranuras distintas ---
const elegir = async (page, puesto) => {
  await page.locator('.trato__elegir').nth(puesto).click();
  await page.waitForTimeout(600);
};

await elegir(ana, 0);
await elegir(beto, 1);
await ana.waitForTimeout(1200);

const ofrecido = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.trato__lado .fin__mote')].map((e) => e.textContent?.trim() ?? ''),
  );
const sobreLaMesa = await ofrecido(ana);
check('se ven las dos ofertas, la tuya y la suya', sobreLaMesa.length === 2,
  sobreLaMesa.join(' <-> '));

// --- LO QUE NO PUEDE PASAR: que uno solo diga que si y ya cambie algo ---
await ana.locator('.trato .button--primary', { hasText: 'intercambiar' }).click();
await ana.waitForTimeout(2500);

const anaTrasSuSi = await equipoDe(ana);
const betoTrasSuSi = await equipoDe(beto);
check('con un solo si, NADIE toca su partida',
  anaTrasSuSi.join() === equipoAna.join() && betoTrasSuSi.join() === equipoBeto.join());

// --- y ahora el segundo si ---
await beto.locator('.trato .button--primary', { hasText: 'intercambiar' }).click();
await beto.waitForTimeout(6000);
await ana.waitForTimeout(2000);

const anaFinal = await equipoDe(ana);
const betoFinal = await equipoDe(beto);

// Ana entrego su ranura 0 y recibe lo que Beto tenia en la 1. Como partian del
// mismo estado, eso es lo que Ana tenia en su propia ranura 1.
check('a quien entrego el primero le llega el que ofrecia el otro',
  anaFinal[0] === equipoAna[1],
  `ranura 0 era ${equipoAna[0]}, ahora ${anaFinal[0]}, se esperaba ${equipoAna[1]}`);
check('y al otro le llega el primero',
  betoFinal[1] === equipoBeto[0],
  `ranura 1 era ${equipoBeto[1]}, ahora ${betoFinal[1]}, se esperaba ${equipoBeto[0]}`);
check('los equipos siguen teniendo los mismos Pokemon, no uno mas ni uno menos',
  anaFinal.length === equipoAna.length && betoFinal.length === equipoBeto.length,
  `${anaFinal.length} y ${betoFinal.length}`);

// --- la red de seguridad: un trato que se quedo a medias ---
//
// Es el caso que no se puede provocar sin cortar la conexion en el instante
// exacto, y es justo el que no puede fallar: si uno aplica y el otro no, hay un
// duplicado. Se comprueba que el aviso aparece, que se puede rematar sin el
// companero, y que un bloque que no vale se rechaza en vez de escribirse.
await ana.evaluate(() => {
  const nombre = globalThis.mGBAModule?.gameName?.split('/').pop() ?? '';
  localStorage.setItem(
    `emupoke.trato.${nombre}`,
    JSON.stringify({ trato: 'a-medias', ranura: 0, recibo: btoa('x'.repeat(100)), doy: '' }),
  );
});
// Se recarga Y se vuelve a cargar la ROM, que es lo que pasa de verdad: al
// cerrar el navegador la ROM no se queda, asi que sin volver a abrirla no hay
// partida a la que asociar el trato pendiente.
await ana.reload({ waitUntil: 'load' });
await ana.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await ana.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await ana.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await ana.waitForTimeout(4000);
// El boton sale con partida aunque no haya companero, justo para esto.
await ana.locator(botonTrato).click();
await ana.waitForTimeout(1000);

const pendiente = ana.locator('.trato__pendiente');
check('un trato a medias se avisa al abrir', (await pendiente.count()) === 1);

if ((await pendiente.count()) === 1) {
  await pendiente.getByRole('button', { name: 'Terminarlo' }).click();
  await ana.waitForTimeout(3000);
  const aviso = (await ana.locator('.trato__aviso').textContent().catch(() => null)) ?? '';
  check('y un bloque que no vale se rechaza en vez de escribirse', aviso.length > 0, aviso);
}

await navegador.close();
console.log(fallos === 0 ? '\nEL INTERCAMBIO LLEGA A LAS DOS PARTIDAS' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

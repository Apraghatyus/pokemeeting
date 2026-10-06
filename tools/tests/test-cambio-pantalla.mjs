// En movil se ve una pantalla a la vez y se cambia con un boton.
//
// Lo que de verdad hay que comprobar aqui no es que el boton cambie la vista,
// sino que al dejar de verse TU pantalla el companero te siga viendo en
// movimiento. Un canvas que el navegador deja de componer puede dejar de
// producir fotogramas, y el sintoma seria horrible: a ti todo normal, y al
// otro tu partida congelada sin que nadie sepa por que.
//
// Necesita el servidor de salas y la aplicacion levantados (npm run dev:all).
//
// Uso: node tools/tests/test-cambio-pantalla.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-cambio-pantalla.mjs <rom.gba>');
  process.exit(2);
}

// Suelo para distinguir "se mueve" de "se quedo congelado", que es lo peor que
// podria pasar al esconder la pantalla. Lo fino se mide comparando, no con un
// numero absoluto: ver mas abajo.
const MINIMO = 25;

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

/** El movil es quien cambia de pantalla; el otro mira desde un escritorio. */
const abrir = async (ancho, alto) => {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: alto } });
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

const movil = await abrir(412, 900);
const escritorio = await abrir(1280, 860);

await movil.locator('.roomchip').click();
await movil.locator('.tabs button', { hasText: 'Crear sala' }).click();
await movil.locator('.form input[type=password]').fill('cambio');
await movil.locator('.form button[type=submit]').click();
await movil.waitForSelector('.room-code', { timeout: 20_000 });
const codigo = ((await movil.locator('.room-code').textContent()) ?? '').trim();
await movil.keyboard.press('Escape');

await escritorio.locator('.roomchip').click();
await escritorio.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await escritorio.locator('.form input.input--code').fill(codigo);
await escritorio.locator('.form input[type=password]').fill('cambio');
await escritorio.locator('.form button[type=submit]').click();
await escritorio.keyboard.press('Escape');

await movil.waitForSelector('.pantalla--pequena', { timeout: 45_000 });
await movil.waitForTimeout(5000);

// --- en el movil solo se ve una ---
const visible = () =>
  movil.evaluate(() => {
    const grande = document.querySelector('.pantalla--grande');
    const pequena = document.querySelector('.pantalla--pequena');
    const caja = pequena.getBoundingClientRect();
    return {
      // Quien manda la pantalla grande: tu canvas o el video del companero.
      mia: grande.querySelector('canvas') !== null,
      // La otra no se ve, pero sigue existiendo y pintandose.
      pequenaOculta: caja.width <= 4 && caja.height <= 4,
      pequenaSigueEnPie: getComputedStyle(pequena).display !== 'none',
    };
  });

const antes = await visible();
check('en movil solo se ve una pantalla', antes.pequenaOculta);
check('y la que no se ve sigue viva, no quitada', antes.pequenaSigueEnPie);
check('al principio se ve la tuya', antes.mia);

// En movil se cambia deslizando, no con un boton: un boton mas es sitio que
// se le quita a la partida.
check('no hay boton de cambiar, que aqui sobra',
  (await movil.locator('.pantalla--grande .pantalla__boton--intercambiar').isVisible()) === false);
check('y hay dos puntos que avisan de que hay otra pantalla',
  (await movil.locator('.pantallas__puntos span').count()) === 2);

/** Desliza el dedo por la pantalla. */
const deslizar = async (dx, dy) => {
  const caja = await movil.locator('.pantalla--grande').boundingBox();
  const centro = { x: caja.x + caja.width / 2, y: caja.y + caja.height / 2 };
  await movil.mouse.move(centro.x, centro.y);
  await movil.mouse.down();
  for (let paso = 1; paso <= 8; paso += 1) {
    await movil.mouse.move(centro.x + (dx * paso) / 8, centro.y + (dy * paso) / 8);
    await movil.waitForTimeout(25);
  }
  await movil.mouse.up();
  await movil.waitForTimeout(700);
};

// Un gesto corto no cuenta: si no, cambiaria de pantalla al rozarla.
await deslizar(25, 0);
check('un roce corto no cambia de pantalla', (await visible()).mia);

// Y el vertical es de la pagina, que debajo estan el mando y los equipos.
await deslizar(0, 120);
check('deslizar hacia abajo tampoco', (await visible()).mia);

/** Cuantos fotogramas por segundo le llegan al otro de MI partida. */
const fpsQueLlegan = async (segundos) =>
  escritorio.evaluate(async (s) => {
    const video = document.querySelector('video');
    const antes = video.getVideoPlaybackQuality().totalVideoFrames;
    await new Promise((sigue) => setTimeout(sigue, s * 1000));
    return (video.getVideoPlaybackQuality().totalVideoFrames - antes) / s;
  }, segundos);

const conMiPantallaVisible = await fpsQueLlegan(5);
check('mientras se ve tu partida, al otro le llega en movimiento',
  conMiPantallaVisible >= MINIMO, `${conMiPantallaVisible.toFixed(1)} fps`);

// Que equipo se esta ensenando, por su titulo.
const tituloDelEquipo = () =>
  movil.evaluate(() => document.querySelector('.equipo__titulo')?.textContent?.trim() ?? '');

// --- se cambia de pantalla deslizando ---
await deslizar(-140, 0);
const despues = await visible();
check('deslizando se pasa a la pantalla del companero', !despues.mia);

// Y con ella su equipo, que es una sola decision y no dos. Antes iban por
// separado -la pantalla lo llevaba el componente y el equipo la aplicacion- y
// se desincronizaban: deslizabas a su partida y seguias viendo tu equipo.
check('y con ella su equipo', /companero/i.test(await tituloDelEquipo()),
  await tituloDelEquipo());

await deslizar(140, 0);
check('y deslizando al otro lado se vuelve a la tuya', (await visible()).mia);
check('con tu equipo otra vez', /Tu equipo/i.test(await tituloDelEquipo()),
  await tituloDelEquipo());
await deslizar(-140, 0);

const conMiPantallaOculta = await fpsQueLlegan(6);
// Lo que de verdad se pregunta aqui no es a cuantos fps llega, sino si
// esconder la pantalla lo empeora. Se compara contra lo que llegaba antes, en
// la misma maquina y en los mismos segundos: un numero absoluto convierte esto
// en un medidor de lo ocupado que este el ordenador, y en una misma sesion se
// han visto 57 y 40 sin tocar nada.
const perdida = 1 - conMiPantallaOculta / conMiPantallaVisible;
check('y esconderla no empeora lo que le llega', perdida < 0.2,
  `${conMiPantallaVisible.toFixed(1)} -> ${conMiPantallaOculta.toFixed(1)} fps`);
check('que sigue siendo movimiento y no una imagen quieta',
  conMiPantallaOculta >= MINIMO, `${conMiPantallaOculta.toFixed(1)} fps`);

// --- y lo mismo con los equipos: uno a la vez y un boton para cambiar ---
const equipoVisible = () =>
  movil.evaluate(() => ({
    cuantos: document.querySelectorAll('.equipo').length,
    titulo: document.querySelector('.equipo__titulo')?.textContent?.trim() ?? '',
  }));

// Venimos del tercer deslizamiento, asi que lo que se ve es lo suyo.
const equipoAntes = await equipoVisible();
check('en movil se enseña un equipo, no dos', equipoAntes.cuantos === 1, `${equipoAntes.cuantos}`);
check('y es el del lado que se esta mirando', /companero/i.test(equipoAntes.titulo),
  equipoAntes.titulo);

// El boton hace lo mismo que el gesto: las dos formas mueven la misma decision.
await movil.locator('.equipo__cambiar').click();
await movil.waitForTimeout(500);
const equipoDespues = await equipoVisible();
check('el boton te devuelve a lo tuyo', /Tu equipo/i.test(equipoDespues.titulo),
  equipoDespues.titulo);
check('y la pantalla grande vuelve contigo', (await visible()).mia);

await movil.locator('.equipo__cambiar').click();
await movil.waitForTimeout(500);
check('y otra vez a lo suyo', /companero/i.test((await equipoVisible()).titulo));

await navegador.close();
console.log(fallos === 0 ? '\nEL CAMBIO DE PANTALLA NO CORTA LA TRANSMISION' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

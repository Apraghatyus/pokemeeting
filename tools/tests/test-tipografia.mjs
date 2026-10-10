// La letra de la pagina.
//
// Escribe con letra de pixeles, como los juegos: media pantalla es una Game Boy
// Advance de verdad y con una tipografia de sistema alrededor parecian dos
// programas pegados.
//
// Esto se prueba por dos motivos, y ninguno es estetico:
//
//   1. UNA FUENTE QUE NO CARGA NO AVISA. Cae a la del sistema y la pagina sigue
//      viendose bien, solo que no es la que se eligio. Si un dia se mueve el
//      fichero, o el aislamiento cross-origin bloquea la peticion -que ya paso
//      con las imagenes-, nadie se enteraria. Asi que se le pregunta al
//      navegador si de verdad la tiene.
//
//   2. CAMBIAR LA LETRA CAMBIA EL ANCHO DE TODO. Y lo que escasea en esta
//      pagina es sitio: hay fichas de 118 pixeles con dos tipos en una linea y
//      un mando que tiene que caber entero en un telefono. Una letra mas ancha
//      no "se ve un poco distinta": empuja el mando fuera de la pantalla, que es
//      un fallo que ya se reporto tres veces por otros motivos.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-tipografia.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
/** Como se llama la fuente en la hoja de estilos. */
const FUENTE = 'Pixelify Sans';

if (!ROM) {
  console.error('Uso: node tools/tests/test-tipografia.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });

// ---------- que la fuente llegue ----------
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const page = await contexto.newPage();

// Si el fichero no llega, aqui se ve: la pagina seguiria pintando igual.
const fallidas = [];
page.on('response', (r) => {
  if (r.url().includes('/fuentes/') && !r.ok()) fallidas.push(`${r.status()} ${r.url()}`);
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.evaluate(() => document.fonts.ready);

check('el fichero de la fuente se sirve', fallidas.length === 0, fallidas.join(', '));

// Preguntarselo al navegador y no mirar el CSS: el CSS puede pedir una fuente
// que no exista y no se queja.
const cargada = await page.evaluate(
  (nombre) => document.fonts.check(`14px "${nombre}"`),
  FUENTE,
);
check('y el navegador la tiene de verdad, no cae a la del sistema', cargada === true);

// Y que se use, que es otra cosa: estar cargada no significa estar puesta.
const puesta = await page.evaluate((nombre) => {
  const deQuien = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).fontFamily : null;
  };
  return {
    cuerpo: deQuien('body'),
    titulo: deQuien('.topbar h1') ?? deQuien('h1'),
    boton: deQuien('.dropzone button'),
    aviso: deQuien('.dropzone__legal'),
    nombre,
  };
});
check('el cuerpo de la pagina escribe con ella', (puesta.cuerpo ?? '').includes(FUENTE), puesta.cuerpo);
check('y los botones la heredan', (puesta.boton ?? '').includes(FUENTE), puesta.boton);

// Los parrafos que hay que LEER se quedan con la del sistema. Una letra de
// pixeles a once pixeles de alto se mira bien y se lee mal, y justo esos
// parrafos son los que dicen lo que no se puede adivinar -como que la ROM no
// sale de tu ordenador-.
check('pero el aviso legal se lee con la del sistema, que para eso esta',
  !(puesta.aviso ?? '').includes(FUENTE), puesta.aviso);

// Se compara el ancho de un mismo texto con las dos fuentes. Si saliera igual,
// es que no se esta aplicando ninguna y lo de arriba seria un falso positivo.
const anchos = await page.evaluate((nombre) => {
  const medir = (familia) => {
    const span = document.createElement('span');
    span.style.cssText = `position:fixed;left:-9999px;font:14px ${familia};white-space:pre`;
    span.textContent = 'Pokemeeting: entrenadores conectados';
    document.body.append(span);
    const ancho = span.getBoundingClientRect().width;
    span.remove();
    return Math.round(ancho);
  };
  return { conLaBuena: medir(`"${nombre}"`), conLaDelSistema: medir('system-ui') };
}, FUENTE);
check('y se nota: el mismo texto no mide lo mismo con las dos',
  anchos.conLaBuena !== anchos.conLaDelSistema,
  `${anchos.conLaBuena}px frente a ${anchos.conLaDelSistema}px`);

await contexto.close();

// ---------- y que no descoloque nada en un telefono ----------
//
// Aqui esta el riesgo de verdad. Una letra mas ancha empuja, y lo que se sale
// por abajo es el mando.
const movil = await navegador.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const tel = await movil.newPage();
await tel.goto(URL, { waitUntil: 'load' });
await tel.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await tel.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await tel.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await tel.waitForTimeout(3500);
await tel.evaluate(() => document.fonts.ready);

for (const [ancho, alto] of [
  [360, 640],
  [412, 915],
]) {
  await tel.setViewportSize({ width: ancho, height: alto });
  await tel.waitForTimeout(1200);

  const medida = await tel.evaluate(() => {
    const botones = [...document.querySelectorAll('.pad button')];
    const abajo = botones.map((b) => b.getBoundingClientRect().bottom);
    // Un texto que no cabe en su caja: es como se nota una letra mas ancha.
    const desbordados = [...document.querySelectorAll('.pad button, .topbar button, .ficha__nombre')]
      .filter((el) => el.scrollWidth > el.clientWidth + 1)
      .map((el) => (el.textContent ?? '').trim().slice(0, 14));
    return {
      sobra: abajo.length ? Math.round(window.innerHeight - Math.max(...abajo)) : null,
      aLoAncho: document.documentElement.scrollWidth > window.innerWidth,
      aLoAlto: document.documentElement.scrollHeight > window.innerHeight + 1,
      desbordados,
    };
  });

  check(`en ${ancho}x${alto} el mando sigue llegando abajo`,
    medida.sobra !== null && medida.sobra >= 0 && medida.sobra < 40,
    `sobran ${medida.sobra}px`);
  check(`y en ${ancho}x${alto} la pagina no se sale`,
    medida.aLoAncho === false && medida.aLoAlto === false,
    `ancho:${medida.aLoAncho} alto:${medida.aLoAlto}`);
  check(`y en ${ancho}x${alto} ningun texto se sale de su boton`,
    medida.desbordados.length === 0, medida.desbordados.join(', '));
}

await navegador.close();
console.log(
  fallos === 0 ? '\nLA PAGINA ESCRIBE COMO EL JUEGO Y TODO SIGUE CABIENDO' : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

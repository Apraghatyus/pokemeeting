// A pantalla completa, un equipo y dos pestanas.
//
// A pantalla completa todo el sitio es para la partida, asi que no caben las
// dos columnas de equipo. Antes cabian a la fuerza: se quedaban las dos y la
// partida encogia. Ahora se ve UNO y se cambia, igual que en una pantalla
// estrecha.
//
// Y el cambio es uno solo para las dos cosas: pasarse a la partida del
// companero cambia tambien su equipo. Si no, lo que hay debajo de su partida no
// es suyo, y eso se mira sin leer -son seis fichas que se parecen- asi que se
// confunde enseguida.
//
// Se comprueba con DOS navegadores de verdad y no con una pagina sola, porque
// la segunda columna solo existe con alguien al otro lado.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-completa-equipos.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const CLAVE = 'dos pestanas';

if (!ROM) {
  console.error('Uso: node tools/tests/test-completa-equipos.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });

/** Una pestana con la partida puesta. Ancha: lo estrecho ya se prueba aparte. */
const abrir = async () => {
  const page = await (
    await navegador.newContext({ viewport: { width: 1400, height: 900 } })
  ).newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return page;
};

const anfitrion = await abrir();
const invitado = await abrir();

await anfitrion.locator('.roomchip').click();
await anfitrion.locator('.form input[type=password]').fill(CLAVE);
await anfitrion.locator('.form button[type=submit]').click();
await anfitrion.locator('.field__value.room-code').waitFor({ timeout: 15_000 });
const sala = ((await anfitrion.locator('.field__value.room-code').textContent()) ?? '').trim();

await invitado.locator('.roomchip').click();
await invitado.locator('.tabs button', { hasText: 'Entrar en una' }).click();
await invitado.locator('.form input.input--code').fill(sala);
await invitado.locator('.form input[type=password]').fill(CLAVE);
await invitado.locator('.form button[type=submit]').click();

const conectados = await Promise.all(
  [anfitrion, invitado].map((p) =>
    p.locator('.pantalla--pequena').waitFor({ timeout: 60_000 }).then(() => true).catch(() => false),
  ),
);
check('los dos se conectan', conectados.every(Boolean), JSON.stringify(conectados));

// Los modales viven siempre en el documento: hay que cerrar el que esta ABIERTO,
// no el primero que aparezca.
for (const page of [anfitrion, invitado]) {
  await page.locator('.modal[open] .modal__close').first().click().catch(() => {});
  await page.waitForTimeout(400);
}

/** Que equipos se ven y como se cambia. */
const mirar = (page) =>
  page.evaluate(() => ({
    columnas: document.querySelectorAll('.equipo').length,
    // Cual se ve: su clase lo dice, y de ella cuelga que la lista del companero
    // crezca de abajo arriba.
    cual: document.querySelector('.equipo')?.classList.contains('equipo--companero')
      ? 'companero'
      : 'propio',
    pestanas: [...document.querySelectorAll('.equipo__pestana')].map((b) => ({
      texto: (b.textContent ?? '').trim(),
      activa: b.classList.contains('is-activa'),
    })),
    fichas: document.querySelectorAll('.equipo__lista > *').length,
    miPartidaGrande:
      document.querySelector('.pantalla--grande')?.textContent?.includes('Tu partida') ?? null,
  }));

// --- fuera de pantalla completa: las dos columnas ---
const ancho = await mirar(anfitrion);
check('con sitio se ven los dos equipos a la vez', ancho.columnas === 2, `${ancho.columnas}`);
check('y entonces no hay pestanas que elegir', ancho.pestanas.length === 0);

// --- a pantalla completa: uno solo, con pestanas ---
await anfitrion.locator('.pantalla__boton--completa').first().click({ timeout: 8_000 });
await anfitrion.waitForTimeout(1200);

const completa = await mirar(anfitrion);
check('a pantalla completa se ve un solo equipo', completa.columnas === 1, `${completa.columnas}`);
check('y aparecen las dos pestanas', completa.pestanas.length === 2,
  completa.pestanas.map((p) => p.texto).join(' / '));
check('con la tuya marcada al entrar',
  completa.pestanas[0]?.activa === true && completa.pestanas[1]?.activa === false,
  JSON.stringify(completa.pestanas));
check('y lo que se ve es tu equipo', completa.cual === 'propio', completa.cual);

// --- cambiar de equipo ---
await anfitrion.locator('.equipo__pestana', { hasText: 'Tu companero' }).click();
await anfitrion.waitForTimeout(900);

const suyo = await mirar(anfitrion);
check('al pulsar su pestana se ve su equipo', suyo.cual === 'companero', suyo.cual);
check('y la pestana marcada pasa a ser la suya',
  suyo.pestanas[1]?.activa === true && suyo.pestanas[0]?.activa === false,
  JSON.stringify(suyo.pestanas));
// Lo que se pidio desde el principio: el suyo crece hacia su borde, de abajo
// hacia arriba.
//
// Se comprueba la REGLA y no las fichas de ahora: en esta prueba los dos juegan
// una ROM recien puesta, sin equipo todavia, asi que no hay fichas que medir. Se
// pinta una lista con sus clases dentro de la pagina y se mira donde coloca el
// navegador la primera ranura y la ultima.
//
// Y se mide la posicion, no la direccion declarada: la lista es una rejilla, no
// una fila, y la vuelta se da colocando cada ranura en su fila. Preguntar por
// `flexDirection` no decia nada -devolvia "row"- y daba por fallado algo que
// estaba bien.
const ordenDe = (page, clases) =>
  page.evaluate((lista) => {
    const aside = document.createElement('aside');
    aside.className = lista;
    aside.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:400px';
    const ul = document.createElement('ul');
    ul.className = 'equipo__lista';
    for (let i = 0; i < 6; i += 1) {
      const li = document.createElement('li');
      li.className = 'ficha ficha--hueco';
      ul.append(li);
    }
    aside.append(ul);
    document.body.append(aside);
    const hijos = [...ul.children].map((e) => Math.round(e.getBoundingClientRect().top));
    aside.remove();
    return { primera: hijos[0], ultima: hijos[hijos.length - 1] };
  }, clases);

const delCompanero = await ordenDe(anfitrion, 'equipo equipo--companero');
check('su equipo se ordena de abajo arriba',
  delCompanero.primera > delCompanero.ultima,
  `la primera en ${delCompanero.primera}, la ultima en ${delCompanero.ultima}`);

const elTuyo = await ordenDe(anfitrion, 'equipo equipo--propio');
check('y el tuyo de arriba abajo, como siempre',
  elTuyo.primera < elTuyo.ultima,
  `la primera en ${elTuyo.primera}, la ultima en ${elTuyo.ultima}`);
// Y el cambio es uno solo: su equipo y su partida van juntos. Si no, lo que hay
// debajo de su partida no es suyo.
check('y pasarse a su equipo trae tambien su partida', suyo.miPartidaGrande === false,
  String(suyo.miPartidaGrande));

// --- y su ventana no se sale de la pantalla ---
//
// ESTO ESTABA ROTO Y SE VIO MIDIENDO. La ventana del companero asoma un 11% de
// la partida por el lado, y a pantalla completa la partida llena la ventana: ese
// 11% eran ciento veinte pixeles y se salia 64 POR FUERA de la pantalla, con su
// boton de cambiar entero fuera. O sea que desde la partida del companero no
// habia forma de volver a la tuya.
//
// Se mide AQUI, mirando su partida, porque es cuando ese boton existe: en la
// tuya no se pinta y su caja mide cero, que pasaba la comprobacion sin
// comprobar nada.
const asoma = await anfitrion.evaluate(() => {
  const caja = (sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return {
      izq: Math.round(b.left),
      der: Math.round(b.right),
      arr: Math.round(b.top),
      aba: Math.round(b.bottom),
      ancho: Math.round(b.width),
    };
  };
  return {
    ventana: caja('.pantalla--pequena'),
    boton: caja('.pantalla__boton--intercambiar'),
    ancho: window.innerWidth,
    alto: window.innerHeight,
  };
});

/** Dentro de la pantalla y con tamano: una caja de cero no esta "dentro". */
const dentro = (c) =>
  c !== null && c.ancho > 0 && c.izq >= 0 && c.arr >= 0 && c.der <= asoma.ancho && c.aba <= asoma.alto;

check('la ventana del companero asoma, pero dentro de la pantalla',
  dentro(asoma.ventana), JSON.stringify(asoma.ventana) + ` en ${asoma.ancho}x${asoma.alto}`);
// Y sobre todo su boton: sin el no hay forma de volver a tu partida.
check('y su boton de cambiar se puede pulsar', dentro(asoma.boton), JSON.stringify(asoma.boton));

// --- y al reves, desde la partida ---
await anfitrion.locator('.pantalla__boton--intercambiar').first().click();
await anfitrion.waitForTimeout(900);

const vuelta = await mirar(anfitrion);
check('cambiar de partida cambia tambien de equipo', vuelta.cual === 'propio', vuelta.cual);
// Y su equipo vacio lo dice en vez de enseñar seis huecos sin motivo.
check('y mientras no mande equipo, se dice',
  suyo.fichas === 0, `${suyo.fichas} fichas`);

// --- y la partida no pierde sitio por todo esto ---
const sitio = await anfitrion.evaluate(() => {
  const p = document.querySelector('.pantallas')?.getBoundingClientRect();
  return { ancho: p ? Math.round(p.width) : 0, ventana: window.innerWidth };
});
check('a pantalla completa la partida se queda con casi toda la ventana',
  sitio.ancho > sitio.ventana * 0.6, `${sitio.ancho}px de ${sitio.ventana}px`);

await anfitrion.evaluate(() => document.exitFullscreen());
await anfitrion.waitForTimeout(1000);
const fuera = await mirar(anfitrion);
check('al salir vuelven las dos columnas', fuera.columnas === 2, `${fuera.columnas}`);

await navegador.close();
console.log(
  fallos === 0
    ? '\nA PANTALLA COMPLETA, UN EQUIPO Y DOS PESTANAS'
    : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

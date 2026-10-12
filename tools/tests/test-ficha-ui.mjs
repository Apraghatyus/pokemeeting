// La ficha de entrenador, desde la pantalla.
//
// `test:ficha` ya prueba el servidor a fondo. Aqui se prueba lo que solo
// existe en el navegador: que el boton de la cuenta abre la ficha y no la
// pantalla de entrar, que personalizar guarda de verdad, y que dos personas se
// hacen amigas escribiendo "Nombre#0482" -que es el unico sitio donde el tag
// se usa para algo-.
//
// Con DOS navegadores, porque una amistad no se puede probar con uno solo.
//
// Hace falta todo levantado (npm run dev:all) con DATABASE_URL puesta.
//
// Uso: node tools/tests/test-ficha-ui.mjs
import { chromium } from 'playwright';
import { entrarConCuentaNueva } from './con-cuenta.mjs';

const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

let fallos = 0;
const check = (que, bien, detalle = '') => {
  console.log(`${bien ? 'OK  ' : 'MAL '}  ${que}${detalle ? `  -> ${detalle}` : ''}`);
  if (!bien) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });

const abrir = async (prefijo) => {
  const page = await (
    await navegador.newContext({ viewport: { width: 1200, height: 900 } })
  ).newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await entrarConCuentaNueva(page, prefijo);
  await page.waitForTimeout(2500);
  return page;
};

/** Abre la ficha y devuelve su dialogo. */
const abrirFicha = async (page) => {
  await page.locator('.iconbutton--cuenta').click();
  await page.waitForTimeout(900);
  return page.locator('.modal[open]');
};

const ana = await abrir('fana');
const beto = await abrir('fbeto');

// --- 1. el boton de la cuenta abre la ficha, no la pantalla de entrar ---
const fichaAna = await abrirFicha(ana);
check('con sesion, el boton abre la ficha de entrenador',
  (await fichaAna.locator('.modal__title').textContent())?.trim() === 'Ficha de entrenador');
check('con sus dos pestañas',
  (await fichaAna.locator('.tabs button').count()) === 2,
  (await fichaAna.locator('.tabs button').allTextContents()).join(' / '));

const tagAna = ((await fichaAna.locator('.ficha__tag').textContent()) ?? '').trim();
check('y tu nombre lleva su tag de cuatro cifras', /^#\d{4}/.test(tagAna), tagAna);

// Las cifras salen de las partidas terminadas, que aqui son cero. Lo que
// importa es que NO se inventa un porcentaje con cero partidas.
const cifras = await fichaAna.locator('.ficha__cifras strong').allTextContents();
check('las cifras empiezan a cero y sin porcentaje',
  cifras[0] === '0' && cifras[1] === '—', cifras.join(' | '));

// --- 2. personalizar guarda de verdad -----------------------------------
await fichaAna.getByRole('button', { name: /Personalizar perfil/ }).click();
await ana.waitForTimeout(400);
await fichaAna.getByLabel('Tu lema').fill('Una ruta mas. Un intento mas.');
await fichaAna.getByLabel('Su número de especie').fill('94');
await fichaAna.getByRole('button', { name: 'Guardar' }).click();
await ana.waitForTimeout(1200);

check('el lema queda puesto',
  ((await fichaAna.locator('.ficha__lema').textContent()) ?? '').includes('Una ruta mas'),
  (await fichaAna.locator('.ficha__lema').textContent()) ?? '');
// El favorito se guarda como numero y el nombre lo pone la ROM de quien mira.
// Sin ROM cargada sale "#94", que es la verdad y no un nombre inventado.
const favorito = ((await fichaAna.locator('.ficha__tarjeta').last().textContent()) ?? '').trim();
check('y el Pokemon favorito tambien', /GENGAR|#94/i.test(favorito), favorito);

// Y sobrevive a recargar: si solo estuviera en la pantalla, no estaria guardado.
await ana.reload({ waitUntil: 'load' });
await ana.waitForTimeout(2500);
const otraVez = await abrirFicha(ana);
check('y sigue ahi despues de recargar',
  ((await otraVez.locator('.ficha__lema').textContent()) ?? '').includes('Una ruta mas'));

// --- 3. cambiar la contraseña pide la de ahora --------------------------
await otraVez.getByRole('button', { name: 'Cambiar contraseña' }).click();
await ana.waitForTimeout(400);
check('el formulario avisa de que cerrara las demas sesiones',
  /cerrarán tus sesiones en los demás aparatos/i.test(
    ((await otraVez.textContent()) ?? '').replace(/\s+/g, ' '),
  ));

await otraVez.getByLabel('Tu contraseña de ahora').fill('no-es-esta');
await otraVez.getByLabel('La nueva').fill('otra-contrasena-larga');
await otraVez.getByRole('button', { name: 'Cambiar contraseña' }).click();
await ana.waitForTimeout(1500);
check('con la contraseña de ahora mal, no se cambia',
  (await otraVez.locator('.alert').count()) === 1,
  ((await otraVez.locator('.alert').textContent()) ?? '').trim());

// --- 4. dos personas se hacen amigas ------------------------------------
const fichaBeto = await abrirFicha(beto);
const tagBeto = ((await fichaBeto.locator('.ficha__tag').textContent()) ?? '').trim();
const apodoBeto = ((await fichaBeto.locator('.ficha__nombre').textContent()) ?? '').trim();
const cifrasBeto = tagBeto.replace(/[^\d]/g, '');

await otraVez.locator('.tabs button', { hasText: 'Amigos' }).click();
await ana.waitForTimeout(600);
check('sin amigos, se explica como conseguirlos',
  /Pásale tu nombre con su tag/i.test(((await otraVez.textContent()) ?? '').replace(/\s+/g, ' ')));

// Lo que se escribe es exactamente lo que se copia con el boton del tag.
await otraVez.locator('.ficha__anadir input').fill(`${apodoBeto}#${cifrasBeto}`);
await otraVez.getByRole('button', { name: 'Añadir' }).click();
await ana.waitForTimeout(1500);

await fichaBeto.locator('.tabs button', { hasText: 'Amigos' }).click();
await beto.waitForTimeout(1500);
check('a quien va dirigida le sale la solicitud',
  (await fichaBeto.locator('.ficha__seccion--aviso').count()) === 1,
  ((await fichaBeto.locator('.ficha__seccion--aviso').textContent()) ?? '').trim());

await fichaBeto.locator('.ficha__fila-acciones button.is-si').first().click();
await beto.waitForTimeout(1500);
check('al aceptar, aparece en su lista de amigos',
  (await fichaBeto.locator('.ficha__fila').count()) === 1,
  `${await fichaBeto.locator('.ficha__fila').count()} filas`);

// Y por el otro lado tambien: una amistad no puede existir a medias.
await otraVez.locator('.tabs button', { hasText: 'Mi perfil' }).click();
await ana.waitForTimeout(300);
await otraVez.locator('.tabs button', { hasText: 'Amigos' }).click();
await ana.waitForTimeout(1500);
check('y por el otro lado igual, que una amistad no es de uno solo',
  (await otraVez.locator('.ficha__fila').count()) === 1);

// --- 5. la presencia ----------------------------------------------------
//
// Los dos tienen la pagina abierta, asi que los dos estan latiendo. Lo que se
// comprueba es que eso llega: sin latido todos saldrian como desconectados.
const estado = ((await otraVez.locator('.ficha__estado').first().textContent()) ?? '').trim();
check('y se ve que esta conectado', /Disponible|En partida/.test(estado), estado);

await navegador.close();
console.log(fallos === 0 ? '\nLA FICHA SE VE Y SE USA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

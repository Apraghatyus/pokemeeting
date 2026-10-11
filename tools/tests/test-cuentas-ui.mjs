// Entrar desde la interfaz, como lo haria alguien.
//
// La otra prueba -test:cuentas- habla con el servidor directamente, y eso deja
// sin comprobar justo lo que mas se rompe: que la pagina llegue al servicio,
// que la galleta de sesion sobreviva a recargar, y que al entrar se suba de
// verdad lo que habia en este navegador.
//
// Eso ultimo es el motivo de todo esto. El historial se lleva recogiendo desde
// antes de que existieran las cuentas para que el dia que alguien inicie
// sesion haya algo que contar; si la subida no funcionara, ese dia no habria
// pasado nada y nadie se enteraria.
//
// Hace falta todo levantado (npm run dev:all) con DATABASE_URL puesta.
//
// Uso: node tools/tests/test-cuentas-ui.mjs
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

let fallos = 0;
const check = (que, bien, detalle = '') => {
  console.log(`${bien ? 'OK  ' : 'MAL '}  ${que}${detalle ? `  -> ${detalle}` : ''}`);
  if (!bien) fallos += 1;
};

const USUARIO = `ui${Date.now().toString(36)}`;
const CLAVE = 'una-contrasena-larga';

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const page = await contexto.newPage();

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);

// Un historial de antes, como el de quien lleva meses jugando sin cuenta. Es
// lo que tiene que acabar en el servidor al entrar.
const FICHERO = `Pokemon - Edicion Rojo Fuego (Spain)-aleatoria-${USUARIO}.gba`;
await page.evaluate(
  ({ fichero }) => {
    globalThis.localStorage.setItem(
      'emupoke.historial',
      JSON.stringify([
        {
          id: `${fichero}:derrota:propio`,
          partida: fichero,
          cuando: Date.now() - 86_400_000,
          resultado: 'derrota',
          porElEnlace: false,
          medallas: 2,
          equipo: [
            { especie: 1, mote: 'HOJITA', nivel: 22, movimientos: [33, 45, 75, 0], caido: true },
          ],
        },
      ]),
    );
  },
  { fichero: FICHERO },
);
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1200);

// --- 1. crear la cuenta desde la pantalla -------------------------------
//
// La cuenta tiene su propio boton en la barra, al lado de la tuerca. Estaba
// dentro de los ajustes y de ahi se saco: entrar no es configurar el
// emulador, y buscarlo entre las teclas y el volumen era pedir que se
// adivinara donde esta.
check(
  'la cuenta tiene su boton en la barra',
  (await page.locator('.iconbutton--cuenta').count()) === 1,
);
check(
  'con una tuerca al lado, que ya no son tres puntos',
  (await page.locator('.iconbutton--opciones svg').count()) === 1,
);

// Y no esta ademas dentro de los ajustes: estaba en dos sitios y uno de los
// dos sobraba.
await page.locator('.iconbutton--opciones').click();
await page.waitForTimeout(400);
const tarjetas = await page.locator('.modal[open] .tarjeta__titulo h2').allTextContents();
check('y ya no esta tambien dentro de los ajustes', !tarjetas.includes('Tu cuenta'), tarjetas.join(', '));
await page.locator('.modal[open] .modal__close').click();
await page.waitForTimeout(400);

await page.locator('.iconbutton--cuenta').click();
await page.waitForTimeout(400);

const cartel = page.locator('.modal[open]');
check('y se abre la pantalla de la cuenta', (await cartel.locator('.tabs').count()) === 1);

// Lo que hay que saber ANTES de crear una cuenta, no despues.
const aviso = ((await cartel.textContent()) ?? '').replace(/\s+/g, ' ');
check(
  'diciendo que no hace falta para jugar',
  /No hace falta cuenta para jugar/i.test(aviso),
);
check('y que las ROMs no se suben', /Ni las ROMs ni los guardados se suben nunca/i.test(aviso));

await cartel.getByRole('button', { name: 'Crear cuenta' }).first().click();
await page.waitForTimeout(300);

// Sin correo no hay forma de recuperarla, y eso se avisa al elegirla.
check(
  'al crear cuenta avisa de que no hay forma de recuperar la contrasena',
  /no hay forma de recuperar la contrasena/i.test(
    ((await cartel.textContent()) ?? '').replace(/\s+/g, ' '),
  ),
);

await cartel.getByLabel(/^Usuario/).fill(USUARIO);
await cartel.getByLabel(/^Tu nombre/).fill('El de la UI');
await cartel.getByLabel(/^Contrasena/).fill(CLAVE);
await cartel.getByRole('button', { name: 'Crear cuenta' }).last().click();

// Crear la cuenta cifra la contrasena a proposito despacio, y despues sube.
await page.waitForTimeout(4000);

// --- 2. que la sesion es de verdad --------------------------------------
const yo = await page.evaluate(async () => {
  const r = await fetch('/cuentas/yo', { credentials: 'include' });
  return r.json();
});
check('la sesion queda abierta', yo.cuenta?.usuario === USUARIO, yo.cuenta?.usuario ?? 'nadie');
check('con el nombre que se escribio', yo.cuenta?.apodo === 'El de la UI', yo.cuenta?.apodo);

// LO QUE SE VINO A BUSCAR: el historial de antes esta ahora en el servidor.
// Se comprueba volviendo a subir: si la primera subida no hubiera pasado,
// esta diria que es nueva.
const otraVez = await page.evaluate(async (fichero) => {
  const r = await fetch('/cuentas/subir', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Emupoke': '1' },
    body: JSON.stringify({
      partidas: [],
      finales: [
        {
          id: `${fichero}:derrota:propio`,
          partida: fichero,
          cuando: Date.now(),
          resultado: 'derrota',
          porElEnlace: false,
          medallas: 2,
          equipo: [],
        },
      ],
    }),
  });
  return r.json();
}, FICHERO);
check(
  'y lo que habia en este navegador ya esta subido',
  otraVez.finales?.repetidos === 1 && otraVez.finales?.nuevos === 0,
  JSON.stringify(otraVez.finales),
);

// --- 3. que sobrevive a recargar ----------------------------------------
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2000);

// El boton se enciende cuando estas dentro: es la respuesta a "sigo dentro?"
// sin tener que abrir nada.
check(
  'al recargar, el boton de la cuenta dice que sigues dentro',
  (await page.locator('.iconbutton--cuenta.is-dentro').count()) === 1,
);

await page.locator('.iconbutton--cuenta').click();
await page.waitForTimeout(500);

const despues = page.locator('.modal[open]');
check(
  'y dentro sigue tu sesion',
  /Has entrado como/.test(((await despues.textContent()) ?? '').replace(/\s+/g, ' ')),
);
check('llamandote por tu nombre', /El de la UI/.test((await despues.textContent()) ?? ''));

// --- 3b. la sala ya no pregunta como te llamas --------------------------
//
// Con cuenta, preguntarlo otra vez seria pedir dos veces lo mismo y dejar que
// las dos respuestas se separen: "Juan" en el ranking y "juanito" en la sala
// es la misma persona vista como dos.
await despues.locator('.modal__close').click();
await page.waitForTimeout(400);
await page.locator('.roomchip').click();
await page.waitForTimeout(500);

const sala = page.locator('.modal[open]');
check(
  'con cuenta, la sala ya no pide un nombre',
  (await sala.locator('input').count()) > 0 &&
    (await sala.getByPlaceholder('Como quieres que te llamen').count()) === 0,
);
check(
  'lo dice en vez de preguntarlo',
  /Entras como/.test(((await sala.textContent()) ?? '').replace(/\s+/g, ' ')),
);
await sala.locator('.modal__close').click();
await page.waitForTimeout(400);

// --- 4. salir -----------------------------------------------------------
await page.locator('.iconbutton--cuenta').click();
await page.waitForTimeout(400);
await page.locator('.modal[open]').getByRole('button', { name: 'Cerrar sesion' }).click();
await page.waitForTimeout(1500);

const fuera = await page.evaluate(async () => {
  const r = await fetch('/cuentas/yo', { credentials: 'include' });
  return r.json();
});
check('al cerrar sesion ya no hay sesion', fuera.cuenta === null);
check(
  'y el boton deja de estar encendido',
  (await page.locator('.iconbutton--cuenta.is-dentro').count()) === 0,
);

// Y sin cuenta la sala vuelve a preguntarlo, que para eso entrar es opcional.
await page.locator('.modal[open] .modal__close').click().catch(() => {});
await page.waitForTimeout(400);
await page.locator('.roomchip').click();
await page.waitForTimeout(500);
check(
  'sin cuenta, la sala vuelve a pedir el nombre',
  (await page.locator('.modal[open]').getByPlaceholder('Como quieres que te llamen').count()) === 1,
);

// Y lo de este navegador NO se borro al subir: sigue aqui. Borrarlo seria
// cambiar un sitio donde estaban los datos por otro, y si el servidor se cae
// se habrian perdido.
const sigueAqui = await page.evaluate(() =>
  JSON.parse(globalThis.localStorage.getItem('emupoke.historial') ?? '[]').length,
);
check('y el historial de este navegador sigue donde estaba', sigueAqui === 1, `${sigueAqui}`);

await navegador.close();
console.log(
  fallos === 0 ? '\nSE PUEDE ENTRAR, Y LO DE ANTES SUBE' : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

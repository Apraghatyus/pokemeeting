// Entrar en la sala desde un enlace, sin saber nada.
//
// EL CAMINO QUE SE PRUEBA es el de alguien que no ha usado esto nunca: le llega
// un enlace por WhatsApp, lo pulsa, pone su copia del juego y pulsa un boton.
// Ni codigo, ni contrasena, ni semilla: las tres venian dentro del enlace.
//
// Y lo que de verdad importa comprobar no es que entre en la sala -eso ya
// funcionaba teclando el codigo- sino que entre AL MISMO MUNDO. Antes habia que
// pasarse las credenciales y la semilla por separado, y lo que pasaba es que la
// gente se pasaba solo las credenciales: los dos entraban en la sala, jugaban
// mundos distintos y tardaban un rato en entender por que los Pokemon de cada
// ruta no cuadraban.
//
// Por eso se comprueban dos cosas que son faciles de pasar por alto:
//
//   - Que a quien llega por un enlace NO se le pregunta que quiere aleatorizar.
//     Preguntarselo seria ofrecerle acabar en otro mundo que el de su amigo.
//   - Que lo que acaba cargado es el mundo de la semilla y no uno nuevo. El
//     mundo rehecho se apunta con su CRC, y el CRC tiene que ser el que dice la
//     semilla: si no coincidiera, rehacer habria fallado y no se habria cargado
//     nada.
//
// Necesita la aplicacion levantada (npm run dev:all), con el servicio de
// aleatorizacion en marcha.
//
// Uso: node tools/tests/test-invitacion-ui.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
/** Otra ROM cualquiera, para probar que se avisa cuando la copia no es la buena. */
const OTRA = process.argv[3];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const CLAVE = 'la del wifi';

if (!ROM) {
  console.error('Uso: node tools/tests/test-invitacion-ui.mjs <rom.gba> [otra.gba]');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });

const nuevaPestana = async () => {
  const contexto = await navegador.newContext({ viewport: { width: 1200, height: 860 } });
  await contexto.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
  const page = await contexto.newPage();
  return page;
};

const esperarElNucleo = (page) =>
  page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });

// ---------- quien invita: un mundo aleatorizado y una sala ----------
const anfitrion = await nuevaPestana();
await anfitrion.goto(URL, { waitUntil: 'load' });
await esperarElNucleo(anfitrion);
await anfitrion.setInputFiles('input[type=file][accept*=".gba"]', ROM);

await anfitrion.getByRole('button', { name: 'Aleatorizar y jugar' }).click({ timeout: 20_000 });
await anfitrion.locator('.hecha__codigo').waitFor({ timeout: 180_000 });
const semilla = ((await anfitrion.locator('.hecha__codigo').textContent()) ?? '').trim();
check('quien invita tiene un mundo con semilla', semilla.startsWith('EMUPOKE1.'), semilla);

// La semilla dice que CRC tiene que tener el mundo. Es el numero con el que se
// comprueba, al final, que los dos acabaron en el mismo sitio.
const crcDelMundo = semilla.split('.')[2];

await anfitrion.getByRole('button', { name: 'Empezar a jugar' }).click();
await anfitrion.locator('.roomchip').click();
await anfitrion.locator('.form input[type=password]').fill(CLAVE);
await anfitrion.locator('.form button[type=submit]').click();
await anfitrion.locator('.field__value.room-code').waitFor({ timeout: 15_000 });
const sala = ((await anfitrion.locator('.field__value.room-code').textContent()) ?? '').trim();
check('y una sala abierta', /^[A-Z0-9]{6}$/.test(sala), sala);

// ---------- lo que se copia para pasarselo ----------
await anfitrion.getByRole('button', { name: 'Copiar invitacion' }).click();
const copiado = await anfitrion.evaluate(() => navigator.clipboard.readText());

check('lo copiado lleva la sala', copiado.includes(`Sala: ${sala}`), copiado.split('\n')[0]);
check('y la contrasena', copiado.includes(`Contrasena: ${CLAVE}`));
check('y avisa de que hace falta su propia copia del juego',
  /tu propia copia del juego/.test(copiado));
// La frontera de siempre, y aqui es donde se ve de verdad: lo que sale de la
// pagina para mandarselo a alguien son tres lineas de texto. Nunca el juego.
check('lo copiado son unas lineas de texto, no un fichero',
  copiado.length < 400, `${copiado.length} caracteres`);

// Desde localhost NO se manda enlace, y es a proposito: apuntaria al ordenador
// de quien copia, no al de su amigo. Y como la semilla viaja dentro del enlace,
// aqui tampoco va: a su amigo no le serviria, porque no tiene esta pagina.
//
// O sea que el enlace con el mundo dentro no se puede comprobar desde aqui. Su
// formato se comprueba en test-invitacion.mjs, que si puede fingir un dominio de
// verdad; lo que esta prueba hace a cambio es armar el enlace a mano, mas abajo,
// y seguirlo hasta el final.
check('desde localhost no se manda un enlace que no valdria',
  !copiado.includes('http'), copiado.split('\n').join(' | '));

// ---------- quien recibe el enlace ----------
const datos = new URLSearchParams({ sala, clave: CLAVE, semilla });
const invitado = await nuevaPestana();
await invitado.goto(`${URL}#${datos.toString()}`, { waitUntil: 'load' });
await esperarElNucleo(invitado);

const cartel = invitado.locator('.modal[open]');
check('al abrir el enlace sale el cartel de la invitacion',
  (await cartel.locator('.modal__title').textContent()) === 'Te han invitado a jugar');
check('y dice a que sala', ((await cartel.locator('.modal__subtitle').textContent()) ?? '').includes(sala));

// Ahi dentro va la contrasena de la sala: no puede quedarse en la barra de
// direcciones ni en el historial.
check('la invitacion se borra de la direccion en cuanto se lee',
  (await invitado.evaluate(() => globalThis.location.hash)) === '',
  await invitado.evaluate(() => globalThis.location.href));

// Lo unico que se le pide es lo unico que el enlace no puede traer.
check('se le pide su copia del juego, dentro del cartel',
  (await cartel.locator('.dropzone').count()) === 1);
check('y no hay dos zonas de carga en la pagina',
  (await invitado.locator('.dropzone').count()) === 1);

// --- primero, con la copia equivocada ---
//
// La semilla trae el CRC de la ROM original con la que se creo: con otra, el
// mundo saldria distinto. Se avisa ANTES de dejar pulsar el boton y no despues
// de un minuto generando. Y la zona de carga tiene que volver a salir: el aviso
// que dice "hace falta otra ROM" sin un sitio donde ponerla es un callejon.
if (OTRA) {
  await invitado.setInputFiles('input[type=file][accept*=".gba"]', OTRA);
  await invitado.waitForTimeout(3000);

  check('con otra copia del juego se avisa en vez de generar un mundo distinto',
    (await cartel.locator('.alert').count()) === 1,
    ((await cartel.locator('.alert').textContent()) ?? '').slice(0, 60));
  check('y no se deja unirse',
    (await invitado.getByRole('button', { name: 'Unirme a la sala' }).count()) === 0);
  check('pero se puede probar con otra, que es la salida del callejon',
    (await cartel.locator('.dropzone').count()) === 1);
} else {
  console.log('SALTO  con otra copia del juego se avisa: hace falta una segunda ROM');
}

// --- y ahora con la buena ---
await invitado.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await invitado.waitForTimeout(3000);
check('con la copia buena ya no hay aviso', (await cartel.locator('.alert').count()) === 0);

// LO QUE NO PUEDE PASAR: que se le pregunte que quiere aleatorizar. El mundo ya
// esta decidido -es el de quien le invito- y elegir aqui es acabar en otro.
// Se mira si su dialogo esta ABIERTO y no si existe: los modales viven siempre
// en el documento y lo que cambia es si estan echados. Buscar solo el elemento
// daba por fallada una prueba que estaba bien.
check('NO se le pregunta que aleatorizar: el mundo ya esta decidido',
  (await invitado.locator('.modal[open] .aleatorizar').count()) === 0);
check('sigue siendo el cartel de la invitacion el que esta delante',
  (await cartel.locator('.modal__title').textContent()) === 'Te han invitado a jugar');

// ---------- un boton ----------
const unirse = invitado.getByRole('button', { name: 'Unirme a la sala' });
check('aparece el boton de unirse', (await unirse.count()) === 1);
await unirse.click();

// Rehacer el mundo tarda: es generar la copia otra vez desde su semilla.
const conectados = await Promise.all([
  anfitrion.locator('.pantalla--pequena').waitFor({ timeout: 180_000 }).then(() => true).catch(() => false),
  invitado.locator('.pantalla--pequena').waitFor({ timeout: 180_000 }).then(() => true).catch(() => false),
]);
check('quien invita ve la partida del otro', conectados[0] === true);
check('y quien entro ve la de quien le invito', conectados[1] === true);

// ---------- y el mundo es el mismo ----------
//
// El CRC del mundo rehecho tiene que ser el que dice la semilla. Si no lo fuera,
// rehacer habria dado un error y no se habria cargado nada: esta comprobacion es
// la que impide que los dos crean estar en el mismo sitio sin estarlo.
const suMundo = await invitado.evaluate(() => {
  const partidas = JSON.parse(globalThis.localStorage.getItem('emupoke.partidas') ?? '[]');
  const corriendo = (globalThis.mGBAModule?.gameName ?? '').split('/').pop() ?? '';
  const suya = partidas.find((p) => p.fichero === corriendo);
  return { corriendo, crc32: suya?.crc32 ?? null, cuantas: partidas.length };
});

check('el mundo que acaba jugando es el de la semilla, no uno nuevo',
  suMundo.crc32 === crcDelMundo, `${suMundo.crc32} frente a ${crcDelMundo}`);
check('y queda apuntado para poder continuarlo manana',
  suMundo.cuantas >= 1 && suMundo.corriendo.endsWith('.gba'), suMundo.corriendo);

// Se abre la sala al acabar para que quien entro vea en que quedo. Cerrar el
// cartel sin enseñar nada mas le dejaria sin saber si entro o no.
check('y se le ensena la sala en la que esta',
  ((await invitado.locator('.field__value.room-code').textContent()) ?? '').trim() === sala);

await navegador.close();
console.log(
  fallos === 0
    ? '\nCON UN ENLACE Y SU ROM, DENTRO Y EN EL MISMO MUNDO'
    : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

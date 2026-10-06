// El cartel de fin de partida, en el navegador.
//
// La regla en si se prueba aparte (test:fin). Aqui lo que importa es lo de
// alrededor: que el cartel salga, que sus tres salidas hagan cosas distintas y
// -sobre todo- que cerrarlo por error no deje la partida marcada.
//
// Se provoca escribiendo el estado que el propio modulo guarda, en vez de
// perder una partida de verdad: hacen falta dos Pokemon y los dos debilitados,
// y eso no se consigue jugando desde una prueba.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-fin-ui.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-fin-ui.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const page = await contexto.newPage();

const cargar = async () => {
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(3000);
};

await cargar();

// Sin nada que lo provoque, el cartel no sale. Es lo primero que hay que
// comprobar: un cartel de "se acabo" apareciendo solo seria lo peor.
check('jugando normal, no sale ningun cartel',
  (await page.locator('.modal[open] .fin').count()) === 0);

const romName = await page.evaluate(() => globalThis.mGBAModule?.gameName?.split('/').pop() ?? null);
check('se sabe con que partida se asocia', romName !== null, romName ?? 'sin nombre');

/** Escribe el estado que guarda el modulo y recarga para que lo lea. */
const provocarFin = async (resultado = 'derrota') => {
  await page.evaluate(
    ([nombre, comoAcabo]) => {
      localStorage.setItem(
        `emupoke.fin.${nombre}`,
        // Un solo Pokemon: es el caso que fallaba, cuando la regla exigia dos.
        JSON.stringify({ vistos: [111], terminada: true, continuada: false, resultado: comoAcabo }),
      );
    },
    [romName, resultado],
  );
  await cargar();
  await page.waitForTimeout(500);
};

const leerGuardado = () =>
  page.evaluate((nombre) => {
    try {
      return JSON.parse(localStorage.getItem(`emupoke.fin.${nombre}`) ?? 'null');
    } catch {
      return null;
    }
  }, romName);

// --- sale ---
await provocarFin();
check('con el equipo caido sale el cartel', (await page.locator('.modal[open] .fin').count()) === 1);
check('y dice que es una derrota',
  ((await page.locator('.modal[open] .modal__title').textContent()) ?? '').includes('Derrota'),
  (await page.locator('.modal[open] .modal__title').textContent()) ?? '');
check('perdiendo no se ensena la Liga, porque no se sabe por donde ibas',
  (await page.locator('.modal[open] .liga').count()) === 0);
check('avisa de que el juego deja seguir pero el reto no',
  ((await page.locator('.fin__resumen').textContent()) ?? '').includes('reto se acaba'));
check('ofrece las dos salidas',
  (await page.getByRole('button', { name: 'Empezar de nuevo' }).count()) === 1 &&
    (await page.getByRole('button', { name: 'Seguir jugando' }).count()) === 1);
check('y avisa de que seguir no cuenta',
  ((await page.locator('.fin .hint').textContent()) ?? '').includes('no cuenta'));

// --- las imagenes ---
// Esto es lo que de verdad hay que vigilar: la pagina corre con aislamiento
// cross-origin por el emulador, y eso bloquea cualquier imagen de fuera que no
// mande Cross-Origin-Resource-Policy. Si un dia se cambia de coleccion de
// sprites sin mirar esa cabecera, los Pokemon desaparecen sin un solo error en
// consola. Por eso no basta con que la etiqueta exista: tiene que haber cargado.
//
// Se prueban cargandolas desde la propia pagina, y no con una peticion desde
// node, porque la cabecera solo estorba dentro del navegador: desde fuera las
// dos fuentes contestan igual de bien y no se notaria nada.
const cargaDesdeLaPagina = (url) =>
  page.evaluate(
    (donde) =>
      new Promise((resolver) => {
        const img = new Image();
        img.onload = () => resolver(img.naturalWidth);
        img.onerror = () => resolver(0);
        img.src = donde;
      }),
    url,
  );

const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites';
const anchoPokemon = await cargaDesdeLaPagina(
  `${BASE}/pokemon/versions/generation-iii/firered-leafgreen/6.png`,
);
check('los sprites de Pokemon cargan pese al aislamiento', anchoPokemon > 0, `${anchoPokemon}px`);

const anchoMedalla = await cargaDesdeLaPagina(`${BASE}/badges/1.png`);
check('y las medallas tambien', anchoMedalla > 0, `${anchoMedalla}px`);

// Y la fuente que se descarto, para que conste por que: si algun dia empieza a
// mandar la cabecera, esta comprobacion falla y se puede reconsiderar.
const anchoShowdown = await cargaDesdeLaPagina(
  'https://play.pokemonshowdown.com/sprites/trainers/lance.png',
);
check('Showdown sigue sin poderse usar, que es por lo que no hay retratos',
  anchoShowdown === 0, `${anchoShowdown}px`);

// El equipo de dentro del cartel solo se puede mirar si la partida tiene
// Pokemon, y una ROM recien cargada no los tiene. No se da por bueno lo que no
// se ha podido ver: o se comprueba, o se dice que no se comprobo.
const conEquipo = (await page.locator('.modal[open] .fin__fila').count()) > 0;
if (!conEquipo) {
  console.log('SALTO  el equipo dentro del cartel: esta partida no tiene Pokemon que ensenar');
} else {
  const sprites = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('.modal[open] .fin__sprite--imagen')];
    await Promise.all(
      imgs.map((i) =>
        i.complete ? null : new Promise((r) => i.addEventListener('load', r, { once: true })),
      ),
    );
    return { cuantas: imgs.length, cargadas: imgs.filter((i) => i.naturalWidth > 0).length };
  });
  check('el equipo sale con sus sprites, y han cargado de verdad',
    sprites.cuantas > 0 && sprites.cargadas === sprites.cuantas,
    `${sprites.cargadas} de ${sprites.cuantas}`);
}

// --- el otro final ---
await page.evaluate((nombre) => localStorage.removeItem(`emupoke.fin.${nombre}`), romName);
await provocarFin('victoria');
check('ganando sale el mismo cartel', (await page.locator('.modal[open] .fin').count()) === 1);
check('pero dice Victoria',
  ((await page.locator('.modal[open] .modal__title').textContent()) ?? '').includes('Victoria'),
  (await page.locator('.modal[open] .modal__title').textContent()) ?? '');
if (conEquipo) {
  check('con el equipo presentado como ganador',
    (await page.locator('.modal[open] .tarjeta__titulo h2', { hasText: 'Equipo ganador' }).count()) === 1);
}
check('y la Liga entera, que llegar al Salon de la Fama ya la implica',
  (await page.locator('.modal[open] .liga__paso').count()) === 5 &&
    (await page.locator('.modal[open] .liga__paso--derrotado').count()) === 5,
  `${await page.locator('.modal[open] .liga__paso--derrotado').count()} de 5`);

await page.evaluate((nombre) => localStorage.removeItem(`emupoke.fin.${nombre}`), romName);
await provocarFin();

// --- seguir jugando: se cierra y queda marcada ---
await page.getByRole('button', { name: 'Seguir jugando' }).click();
await page.waitForTimeout(400);
check('seguir jugando cierra el cartel', (await page.locator('.modal[open] .fin').count()) === 0);
const trasSeguir = await leerGuardado();
check('y la partida queda marcada como continuada', trasSeguir?.continuada === true,
  JSON.stringify(trasSeguir));
check('sin dejar de estar terminada, que es lo que la saca de las estadisticas',
  trasSeguir?.terminada === true);

// Y no vuelve a salir al recargar: ya se decidio.
await cargar();
await page.waitForTimeout(400);
check('y al recargar no vuelve a salir', (await page.locator('.modal[open] .fin').count()) === 0);

// --- cerrarlo por error no marca nada ---
await page.evaluate((nombre) => localStorage.removeItem(`emupoke.fin.${nombre}`), romName);
await provocarFin();
check('vuelve a salir tras limpiar', (await page.locator('.modal[open] .fin').count()) === 1);

await page.locator('.modal[open] .modal__close').click();
await page.waitForTimeout(400);
check('la X lo cierra', (await page.locator('.modal[open] .fin').count()) === 0);
const trasCerrar = await leerGuardado();
check('y NO deja la partida por terminada: era un falso positivo',
  trasCerrar?.terminada === false, JSON.stringify(trasCerrar));
check('ni la marca como continuada', trasCerrar?.continuada === false);

await navegador.close();
console.log(fallos === 0 ? '\nEL CARTEL DE FIN SE COMPORTA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

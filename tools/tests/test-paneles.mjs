// Comprueba que el panel de equipo enseña lo que hay en la partida.
//
// Es la prueba que de verdad cierra la cadena: se carga una ROM, se le mete un
// estado de una partida real, y se mira si en la columna de la izquierda
// aparece el Pokemon que esa persona tiene. Entre medias estan la lectura de
// memoria cada pocos segundos, la tabla de nombres de la ROM y el componente.
//
// LO QUE SE ESPERA SALE DEL PROPIO ESTADO, no de una lista escrita aqui. Antes
// esperaba un equipo concreto -un Pokemon apodado CCC, de nivel 6, un
// BULBASAUR- porque se escribio contra la partida de alguien. Esa partida no
// esta en el repositorio -es de una persona, como todos los estados-, asi que
// con cualquier otra la prueba fallaba y parecia que algo estaba roto. Lo unico
// roto era la prueba.
//
// Ahora se lee el estado con el mismo lector que usa el programa y se comprueba
// que el panel ensena ESO. Sigue cerrando la cadena entera -memoria, tabla de
// nombres de la ROM, componente- y ademas la puede ejecutar cualquiera con su
// propia partida. Que el lector acierte lo vigilan `test:resumen` y `test:gen3`.
//
// Uso: npx tsx tools/tests/test-paneles.mjs <rom.gba> <estado.bin> [carpeta]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const [, , ROM, ESTADO, SHOTS = '.'] = process.argv;
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM || !ESTADO) {
  console.error('Uso: node tools/tests/test-paneles.mjs <rom.gba> <estado.bin> [carpeta]');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => {
  if (!/unwind/.test(e.message)) console.log(`[pageerror] ${e.message}`.slice(0, 160));
});

await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});

// --- antes de cargar nada ---
check('tu columna esta ahi desde el principio',
  (await page.locator('.equipo--propio').count()) === 1);
// Las seis ranuras existen siempre, para que al entrar un Pokemon nuevo los
// demas no se muevan. Vacias no se ven, pero ocupan su sitio.
check('con sus seis huecos reservados',
  (await page.locator('.equipo--propio .ficha').count()) === 6);
check('y ninguno con Pokemon todavia',
  (await page.locator('.equipo--propio .ficha:not(.ficha--hueco)').count()) === 0);

// Jugando solo esa columna no existe: su sitio se lo queda la partida.
check('jugando solo no hay columna del companero',
  (await page.locator('.equipo--companero').count()) === 0);
check('y la mesa esta en modo de uno solo',
  (await page.locator('.mesa--solo').count()) === 1);

// --- se carga la ROM y la partida ---
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(5000);

const estado = [...new Uint8Array(readFileSync(ESTADO))];
const cargado = await page.evaluate(async (bytes) => {
  const m = globalThis.mGBAModule;
  const base = m.gameName.split('/').pop().replace(/\.[^.]+$/, '');
  m.FS.writeFile(`${m.filePaths().saveStatePath}/${base}.ss3`, new Uint8Array(bytes));
  await new Promise((r) => setTimeout(r, 200));
  return m.loadStateSlot(3, 0);
}, estado);
check('el estado de la partida se carga', cargado === 1 || cargado === true, String(cargado));

// El equipo se mira cada tres segundos: hay que darle una vuelta de margen.
const aparecio = await page
  .waitForFunction(
    () =>
      [...document.querySelectorAll('.equipo--propio .ficha')].filter(
        (f) => !f.classList.contains('ficha--hueco'),
      ).length > 0,
    null,
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false);
check('el panel se llena solo, sin tocar nada', aparecio);

if (aparecio) {
  // Lo que ESE estado tiene dentro, leido como lo lee el programa.
  const pk = await import(pathToFileURL(`${process.cwd()}/packages/pokemon/src/index.ts`).href);
  const leido = pk.resumirEquipo(new Uint8Array(estado));
  check('el estado de prueba se deja leer', leido !== null);

  const esperados = leido?.resumen.ranuras ?? [];
  const romBytes = new Uint8Array(readFileSync(ROM));
  const nombres = pk.encontrarTablaNombres(romBytes);
  const dex = pk.encontrarTablaDex(romBytes);
  const primero = esperados[0];

  const conPokemon = page.locator('.equipo--propio .ficha:not(.ficha--hueco)');
  const fichas = await conPokemon.count();
  check('con tantas fichas como Pokemon hay en la partida',
    fichas === esperados.length, `${fichas} ficha(s), el estado tiene ${esperados.length}`);

  const texto = ((await conPokemon.first().textContent()) ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  check('y la ficha lleva el mote que le puso el jugador',
    primero !== undefined && texto.includes(primero.mote), `${texto} | ${primero?.mote}`);
  // Sin \b al final: en la ficha el nivel va pegado al tipo -"Nv.10Normal"- y
  // ahi no hay frontera de palabra entre el 0 y la N. Lo que hace falta es que
  // no siga otro digito, o Nv.1 valdria por Nv.10.
  check('su nivel',
    primero !== undefined && new RegExp(`Nv\\.${primero.nivel}(?!\\d)`).test(texto),
    `${texto} | Nv.${primero?.nivel}`);

  const nombreEspecie = primero ? (nombres?.nombre(primero.especie) ?? '') : '';
  check('y el nombre de la especie, sacado de la ROM',
    nombreEspecie !== '' && texto.toUpperCase().includes(nombreEspecie.toUpperCase()),
    `${texto} | ${nombreEspecie}`);

  // El sprite se pide a PokeAPI por su numero de Pokedex nacional, que sale de
  // una tabla de la propia ROM: la conversion no es una resta.
  const nacional = primero ? (dex?.nacional(primero.especie) ?? 0) : 0;
  const sprite = conPokemon.locator('.ficha__sprite--imagen').first();
  const src = (await sprite.getAttribute('src').catch(() => null)) ?? '';
  check('la ficha pide el sprite de la especie',
    nacional > 0 && new RegExp(`/${nacional}\\.png$`).test(src),
    `${src.slice(-40)} | esperado /${nacional}.png`);
  // Hay que esperarla: la imagen va con carga diferida y mirarla nada mas
  // aparecer la ficha dice que no ha cargado cuando solo es que no ha llegado.
  const cargo = await sprite
    .evaluate(
      (img) =>
        new Promise((listo) => {
          if (img.complete) return listo(img.naturalWidth > 0);
          img.addEventListener('load', () => listo(img.naturalWidth > 0));
          img.addEventListener('error', () => listo(false));
          setTimeout(() => listo(img.naturalWidth > 0), 10_000);
        }),
    )
    .catch(() => false);
  check('y la imagen llega, que con aislamiento cross-origin no es obvio', cargo === true);

  // El tipo sale de la ROM que corre, no de una lista: con una copia
  // aleatorizada, una lista diria el tipo de siempre y seria falso.
  // De la PRIMERA ficha, no de todas: `conPokemon` son las tres del equipo y
  // pedirle los tipos devolvia los cinco de los tres Pokemon seguidos.
  const tipos = await conPokemon.first().locator('.tipo').allTextContents();
  check('la ficha enseña el tipo de la especie', tipos.length >= 1, tipos.join(' / '));

  // Cual es, leido de ESTA ROM. Antes esperaba "planta/veneno" porque la
  // partida con la que se escribio llevaba un Bulbasaur; con otra partida eso
  // era falso aunque todo funcionara.
  const stats = pk.encontrarTablaEstadisticas(romBytes);
  const suyos = primero ? (stats?.estadisticas(primero.especie)?.tipos ?? null) : null;
  // Un tipo repetido no es doble: el juego lo guarda asi para los mono-tipo.
  const esperado = suyos
    ? [...new Set(suyos)].map((t) => (pk.TIPOS_GEN3[t] ?? '?').toLowerCase())
    : [];
  check('y es el que tiene en ESTA ROM, no el de una lista',
    esperado.length > 0 && tipos.map((t) => t.toLowerCase()).join('/') === esperado.join('/'),
    `${tipos.join('/')} | esperado ${esperado.join('/')}`);

  // Fuera de combate y sano: ni iluminado ni con estado alterado.
  check('un Pokemon sano no lleva etiqueta de estado',
    (await page.locator('.equipo--propio .estado').count()) === 0);
}

await page.screenshot({ path: `${SHOTS}/paneles.png` });
console.log(`captura en ${SHOTS}/paneles.png`);

await browser.close();
console.log(fallos === 0 ? '\nLOS PANELES ENSEÑAN LA PARTIDA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

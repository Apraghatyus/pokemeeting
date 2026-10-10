// El tope de nivel del proximo gimnasio, en pantalla.
//
// La regla es de la comunidad, no del juego: nadie lleva un Pokemon por encima
// del mas alto del lider que toca. Cumplirla a mano obliga a acordarse del
// numero, y en una copia aleatorizada el numero no es el de siempre, asi que lo
// dice el programa.
//
// Hay tres cosas que comprobar y son distintas:
//   1. que el numero que sale es el del gimnasio QUE TOCA, no el del primero;
//   2. que cambia cuando cambian las medallas;
//   3. que al Pokemon que se lo ha pasado se le marca, y solo a el.
//
// Lo tercero se comprueba contra la ficha de verdad, no contra el componente:
// el aviso va como etiqueta y no como borde justo porque los bordes de la ficha
// ya se pisaron una vez entre si, y eso solo se ve en el navegador.
//
// Hacen falta las dos cosas de una partida de verdad, y por motivos distintos:
// las medallas viven en el fichero de guardado -es lo unico con estructura
// reconocible, ver `medallas.ts`- y el equipo, en un estado. Ni las partidas ni
// los estados estan en el repositorio, que son de alguien: se pasan por linea
// de ordenes.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-tope-ui.mjs <rom.gba> <partida.sav> [estado.bin]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROM = process.argv[2];
const SAV = process.argv[3];
const ESTADO = process.argv[4];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM || !SAV) {
  console.error('Uso: node tools/tests/test-tope-ui.mjs <rom.gba> <partida.sav> [estado.bin]');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

/**
 * La misma partida pero sin medallas, para ver el tope del primer gimnasio.
 *
 * Hace falta porque la partida de prueba lleva una medalla y un equipo de
 * niveles 10, 17 y 19: con el tope de MISTY -21- nadie se pasa, asi que el
 * aviso no se podria comprobar. Sin medallas el tope es el de BROCK -14- y dos
 * de los tres se pasan.
 *
 * Se toca un solo byte. Donde esta sale de la misma estructura que lee el
 * programa: el bloque son las secciones 1 a 4 pegadas con 3968 bytes utiles
 * cada una, asi que 0x0FE4 cae 100 bytes dentro de la seccion 2. Y hay que
 * tocarlo en LAS DOS copias, porque el juego alterna entre ellas y se lee la
 * del contador mas alto.
 */
const sinMedallas = (bytes) => {
  const copia = new Uint8Array(bytes);
  const vista = new DataView(copia.buffer);
  const DONDE = 0x0fe4;
  const seccion = [1, 2, 3, 4][Math.floor(DONDE / 3968)];
  const dentro = DONDE % 3968;
  let tocadas = 0;
  for (let i = 0; i * 4096 + 4096 <= copia.length; i += 1) {
    const base = i * 4096;
    if (vista.getUint32(base + 0x0ff8, true) !== 0x08012025) continue;
    if (vista.getUint16(base + 0x0ff4, true) !== seccion) continue;
    copia[base + dentro] = 0;
    tocadas += 1;
  }
  return { copia, tocadas };
};

const original = new Uint8Array(readFileSync(SAV));
const { copia: limpia, tocadas } = sinMedallas(original);
check('la partida de prueba tiene la seccion de las medallas, por duplicado',
  tocadas === 2, `${tocadas} secciones`);
const SAV_SIN = join(mkdtempSync(join(tmpdir(), 'tope-')), 'sin-medallas.sav');
writeFileSync(SAV_SIN, limpia);

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await navegador.newContext({ viewport: { width: 1100, height: 820 } })).newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(3000);

// El tope del gimnasio que toca ya no se escribe en una frase: lo dice la tira
// de medallas, debajo de la que toca. Decirlo en los dos sitios era ruido.
// Dentro de la tira: el cartel de fin tambien pinta sus ocho medallas, y
// aunque su dialogo este cerrado sigue estando en el documento.
const siguiente = page.locator('.medallas-tira .medalla--siguiente');
const topeDeAhora = async () =>
  ((await siguiente.locator('.medalla__tope').textContent()) ?? '').trim();

// Sin partida guardada no hay medallas que leer, y sin medallas no se sabe que
// gimnasio toca. Preferir el hueco a adivinar el primero no es un detalle: a
// quien lleva cuatro medallas le pondria un tope treinta niveles por debajo.
check('sin partida guardada no se marca ningun gimnasio como el que toca',
  (await siguiente.count()) === 0);

// --- 1. el gimnasio que toca ---
await page.setInputFiles('input[type=file][accept*=".sav"]', SAV);
// Recorrer la ROM se retrasa a proposito para no estorbar al arranque, asi que
// hay que darle su tiempo.
await siguiente.first().waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {});
check('con la partida cargada se marca el gimnasio que toca', (await siguiente.count()) === 1);

const conUna = await topeDeAhora();
check('y su tope es el del gimnasio que toca, no el del primero',
  conUna === 'Nv.21', conUna);
// Brock es el tope del primero y la partida ya tiene su medalla: si saliera su
// numero seria que se esta leyendo el gimnasio equivocado.
check('no el de Brock, que ya esta ganado', conUna !== 'Nv.14', conUna);

// --- 1b. la tira de medallas sobre la partida ---
//
// Es lo que se mira de reojo mientras se juega: por donde va la partida y
// cuanto queda. Las conseguidas a color, las que faltan apagadas, y debajo de
// cada una el tope de su gimnasio.
const tira = await page.evaluate(() => {
  const caja = document.querySelector('.medallas-tira');
  if (!caja) return null;
  return {
    cuantas: caja.querySelectorAll('.medalla').length,
    aColor: caja.querySelectorAll('.medalla--tiene').length,
    // Cual esta marcada como "la que toca".
    siguiente: [...caja.querySelectorAll('.medalla')].findIndex((m) =>
      m.classList.contains('medalla--siguiente'),
    ),
    topes: [...caja.querySelectorAll('.medalla__tope')].map((e) => (e.textContent ?? '').trim()),
    sinSaber: caja.classList.contains('medallas-tira--sin-saber'),
  };
});

check('sobre la partida se ve la tira de medallas', tira !== null);
check('con las ocho, tambien las que faltan', tira?.cuantas === 8, String(tira?.cuantas));
// Una medalla: la de Brock. Y las otras siete apagadas, que es lo que cuenta
// cuanto queda.
check('solo la conseguida va a color', tira?.aColor === 1, `${tira?.aColor} a color`);
check('y se marca el gimnasio que toca, que si no no se distingue de la octava',
  tira?.siguiente === 1, `la ${(tira?.siguiente ?? -1) + 1}`);
// Los topes de Rojo Fuego, leidos de la ROM. En una copia aleatorizada serian
// otros, que es justo por lo que no se escriben en una lista.
check('debajo de cada una, el nivel mas alto de su lider',
  tira?.topes.join(' ') === 'Nv.14 Nv.21 Nv.24 Nv.29 Nv.43 Nv.43 Nv.47 Nv.50',
  tira?.topes.join(' '));
check('y no se marca como dudosa, porque esta partida si tiene guardado',
  tira?.sinSaber === false);

// --- 2. sigue a las medallas ---
await page.setInputFiles('input[type=file][accept*=".sav"]', SAV_SIN);
await page.waitForTimeout(6000);
const sinNinguna = await topeDeAhora();
check('quitando la medalla, el tope vuelve al primer gimnasio',
  sinNinguna === 'Nv.14', sinNinguna);
check('y la marca se mueve a la primera medalla', await page.evaluate(() => {
  const todas = [...document.querySelectorAll('.medallas-tira .medalla')];
  return todas.findIndex((m) => m.classList.contains('medalla--siguiente')) === 0;
}));

// --- 3. a quien se pasa, se le marca ---
//
// Para esto hace falta un equipo, y recien importada la partida el juego esta en
// su pantalla de titulo -importar la reinicia-. Se carga un estado, igual que
// hace el menu de cargar, y por eso va DESPUES de importar y no antes.
if (ESTADO) {
  const bytes = Array.from(new Uint8Array(readFileSync(ESTADO)));
  const cargado = await page.evaluate((datos) => {
    const core = globalThis.mGBAModule;
    const base = (core.gameName?.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    core.FS.writeFile(`${core.filePaths().saveStatePath}/${base}.ss4`, new Uint8Array(datos));
    // El nucleo devuelve el entero de C, no un booleano.
    return Boolean(core.loadStateSlot(4, 0));
  }, bytes);
  check('se carga el estado con el equipo dentro', cargado === true);
  // El equipo se relee cada tres segundos: hay que darle una vuelta entera.
  await page.waitForTimeout(5000);
}

const fichas = await page.evaluate(() => {
  // El tope sale de la tira: es el numero que hay debajo de la medalla marcada
  // como la que toca.
  const cap =
    document.querySelector('.medallas-tira .medalla--siguiente .medalla__tope')?.textContent ?? '';
  const tope = Number(cap.replace(/[^0-9]/g, ''));
  return [...document.querySelectorAll('.equipo--propio .ficha:not(.ficha--hueco)')].map((f) => {
    const nivel = Number(
      (f.querySelector('.ficha__nivel')?.textContent ?? '').replace(/[^0-9]/g, ''),
    );
    return {
      nivel,
      tope,
      pasado: nivel > tope,
      tenido: f.querySelector('.ficha__nivel--pasado') !== null,
      // Y la ficha entera apagada: para el reto ese Pokemon no se puede usar.
      fuera: f.classList.contains('ficha--pasado'),
      etiqueta: (f.querySelector('.estado--pasado')?.textContent ?? '').trim(),
    };
  });
});

if (fichas.length === 0) {
  console.log('SALTO  a quien se pasa del tope se le marca: sin estado no hay equipo que mirar');
} else {
  // Lo que importa no es que marque, es que marque a QUIEN se ha pasado: marcar
  // a los seis o a ninguno se veria igual de "funcionando" en una captura.
  check('solo se marca a quien se ha pasado del tope',
    fichas.every((f) => f.tenido === f.pasado),
    JSON.stringify(fichas));

  // Lo que se pidio: al que se pasa del tope del gimnasio que toca se le
  // deshabilita, no solo se le pone una etiqueta. Se apaga como un debilitado,
  // porque para el reto viene a ser lo mismo.
  check('al que se pasa se le apaga la ficha entera',
    fichas.every((f) => f.fuera === f.pasado),
    fichas.map((f) => `Nv.${f.nivel}${f.fuera ? ' apagado' : ''}`).join(', '));

  const pasados = fichas.filter((f) => f.pasado);
  check('y hay alguno pasado, que es el caso que importa', pasados.length > 0,
    `tope Nv.${fichas[0]?.tope}, niveles ${fichas.map((f) => f.nivel).join(', ')}`);
  // Por un nivel se aguanta y por ocho no, asi que el numero importa.
  check('la etiqueta dice cuantos niveles se pasa',
    pasados.length > 0 && pasados.every((f) => f.etiqueta === `+${f.nivel - f.tope}`),
    pasados.map((f) => `Nv.${f.nivel} ${f.etiqueta}`).join(', '));
}

// Al companero no se le pone TU tope: su ROM y sus medallas estan en su
// ordenador, y marcarle sus Pokemon por una regla que no es la suya es mentir.
check('al companero no se le apaga ningun Pokemon por tu tope',
  (await page.locator('.equipo--companero .ficha--pasado').count()) === 0);

// --- 3b. y a pantalla completa la partida sigue siendo la partida ---
//
// ESTO SE ROMPIO Y NO SE NOTO HASTA VERLO. La tira se escondia con
// `display: none` en pantalla completa, y eso la saca del grid: dejaba de ser
// una celda y todo lo de detras se corria una columna, asi que la partida caia
// en la columna de las medallas. Medido: 920 pixeles de ancho fuera, 62 dentro.
//
// Se mide el ancho de la partida contra el de la ventana porque es lo unico que
// lo habria cazado: no hubo error, ni aviso, ni nada roto en consola.
await page.locator('.pantalla__boton--completa').first().click({ timeout: 8_000 });
await page.waitForTimeout(1500);

const enCompleta = await page.evaluate(() => {
  const partida = document.querySelector('.pantallas')?.getBoundingClientRect();
  return {
    entro: document.fullscreenElement !== null,
    ancho: partida ? Math.round(partida.width) : 0,
    ventana: window.innerWidth,
    medallas: document.querySelectorAll('.medallas-tira .medalla').length,
  };
});

check('se entra en pantalla completa', enCompleta.entro === true);
check('y la partida se queda con casi toda la ventana, no con una columna',
  enCompleta.ancho > enCompleta.ventana * 0.6,
  `${enCompleta.ancho}px de ${enCompleta.ventana}px`);
// Y la tira se queda: en escritorio cuesta sesenta pixeles de ancho, que
// sobran, y esconderla era lo que corria las columnas.
check('y las medallas siguen ahi', enCompleta.medallas === 8, String(enCompleta.medallas));
await page.evaluate(() => document.exitFullscreen());
await page.waitForTimeout(800);

// --- 4. y en un telefono, que no empuje el mando fuera ---
//
// Esto ya paso: una linea de mas en la columna del equipo se come alto, y el
// alto es justo lo que falta en un movil. Lo que acabo saliendose por abajo fue
// el mando, que es lo unico sin lo que no se puede jugar.
//
// La prueba de colocacion en movil no cubre esto porque alli no hay partida
// guardada, y sin medallas el tope no se ensena: el aviso solo aparece cuando
// hay algo que avisar, que es cuando estorba.
const movil = await (
  await navegador.newContext({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  })
).newPage();
await movil.goto(URL, { waitUntil: 'load' });
await movil.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await movil.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await movil.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await movil.waitForTimeout(3000);
await movil.setInputFiles('input[type=file][accept*=".sav"]', SAV);
await movil
  .locator('.medalla--siguiente')
  .first()
  .waitFor({ state: 'visible', timeout: 25_000 })
  .catch(() => {});

for (const [ancho, alto] of [
  [360, 640],
  [412, 915],
]) {
  await movil.setViewportSize({ width: ancho, height: alto });
  await movil.waitForTimeout(1200);

  const medida = await movil.evaluate(() => {
    const tira = document.querySelector('.medallas-tira');
    const abajo = [...document.querySelectorAll('.pad button')].map(
      (b) => b.getBoundingClientRect().bottom,
    );
    return {
      medallas: document.querySelectorAll('.medallas-tira .medalla').length,
      // En un telefono la tira vuelve a ser una fila: lo que falta alli es alto.
      enFila: tira
        ? getComputedStyle(tira.querySelector('.medallas')).gridTemplateColumns.split(' ').length
        : 0,
      sobra: abajo.length ? Math.round(window.innerHeight - Math.max(...abajo)) : null,
      desborda: document.documentElement.scrollHeight > window.innerHeight + 1,
    };
  });

  check(`en ${ancho}x${alto} se ven las ocho medallas`, medida.medallas === 8,
    String(medida.medallas));
  check(`y en ${ancho}x${alto} van en fila, que es lo que cabe`, medida.enFila === 8,
    `${medida.enFila} columnas`);
  check(`y en ${ancho}x${alto} el mando sigue llegando abajo`,
    medida.sobra !== null && medida.sobra >= 0 && medida.sobra < 40,
    `sobran ${medida.sobra}px por debajo del ultimo boton`);
  check(`y en ${ancho}x${alto} nada se sale de la pantalla`, medida.desborda === false);
}

await navegador.close();
console.log(fallos === 0 ? '\nEL TOPE SE VE Y ES EL DEL GIMNASIO QUE TOCA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

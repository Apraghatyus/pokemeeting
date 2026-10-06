// El borde amarillo solo mientras hay combate.
//
// El fallo que se reporto: al acabar la pelea el borde se quedaba encendido
// sobre el ultimo que peleo mientras el jugador caminaba por el mapa. La causa
// es que el juego NO borra la copia del Pokemon que estaba en el campo, asi que
// buscarla no distingue "esta peleando" de "fue el ultimo que peleo".
//
// Se arregla mirando ademas dos punteros que el juego deja puestos mientras el
// combate corre (ver `MARCAS_DE_COMBATE`). Aqui se comprueba de punta a punta:
// se cargan dos estados de verdad y se mira la ficha.
//
// Los estados no estan en el repositorio -son partidas de alguien- asi que se
// pasan por linea de ordenes. Para sacarlos: menu ⋮ → Exportar estado, uno
// dentro de un combate y otro caminando.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-borde-combate.mjs <rom.gba> <combate.bin> <mapa.bin>
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const [ROM, COMBATE, MAPA] = process.argv.slice(2);
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM || !COMBATE || !MAPA) {
  console.error('Uso: node tools/tests/test-borde-combate.mjs <rom.gba> <combate.bin> <mapa.bin>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await navegador.newContext({ viewport: { width: 1000, height: 760 } })).newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(3500);

/** Mete un estado en el nucleo y lo carga, como hace el menu de cargar. */
const cargarEstado = async (fichero) => {
  const bytes = Array.from(new Uint8Array(readFileSync(fichero)));
  const ok = await page.evaluate((datos) => {
    const core = globalThis.mGBAModule;
    const base = (core.gameName?.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
    core.FS.writeFile(`${core.filePaths().saveStatePath}/${base}.ss4`, new Uint8Array(datos));
    return core.loadStateSlot(4, 0);
  }, bytes);
  // El equipo se relee cada tres segundos: hay que darle una vuelta entera.
  await page.waitForTimeout(5000);
  // El nucleo devuelve el entero de C, no un booleano.
  return Boolean(ok);
};

/** Cuantas fichas estan iluminadas, cuantas hay y en que orden. */
const fichas = () =>
  page.evaluate(() => ({
    total: document.querySelectorAll('.ficha:not(.ficha--hueco)').length,
    encendidas: document.querySelectorAll('.ficha--activo').length,
    orden: [...document.querySelectorAll('.ficha:not(.ficha--hueco) .ficha__nombre')]
      .map((e) => e.textContent?.trim() ?? '')
      .join(','),
  }));

check('se carga el estado de dentro del combate', (await cargarEstado(COMBATE)) === true);
const enPelea = await fichas();
check('con la partida en combate se ve el equipo', enPelea.total > 0, `${enPelea.total} fichas`);
check('y UNO esta iluminado: el que pelea', enPelea.encendidas === 1,
  `${enPelea.encendidas} iluminadas`);

// EL SEGUNDO FALLO QUE SE REPORTO: al entrar en combate, el panel se
// reorganizaba solo. El juego mueve sus ranuras durante la pelea, asi que el
// panel tiene que dejar de seguirlas mientras dure.
check('se carga el estado de caminando', (await cargarEstado(MAPA)) === true);
const enMapa = await fichas();
check('fuera de combate se sigue viendo el equipo', enMapa.total > 0, `${enMapa.total} fichas`);
// EL PRIMER FALLO QUE SE REPORTO.
check('pero NO hay ninguno iluminado', enMapa.encendidas === 0,
  `${enMapa.encendidas} iluminadas`);

// Y el orden: fuera de combate manda el juego. Se vuelve a entrar en combate y
// el panel tiene que quedarse como estaba.
const ordenEnMapa = enMapa.orden;
await cargarEstado(COMBATE);
const alVolverAPelear = await fichas();
check('al entrar en combate el panel NO se reorganiza',
  alVolverAPelear.orden === ordenEnMapa,
  `en el mapa ${ordenEnMapa}, peleando ${alVolverAPelear.orden}`);

await navegador.close();
console.log(fallos === 0 ? '\nEL BORDE SOLO SE ENCIENDE EN COMBATE' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

// Cuando el aparato le quita al lienzo la memoria de video.
//
// Pasa de verdad, y se reporto tres veces: en un telefono justo de memoria el
// sistema le retira al navegador el contexto de video y la partida se queda en
// un rectangulo blanco. Sin nadie escuchando ese evento no habia ni aviso ni
// vuelta atras, porque el navegador **solo** intenta restaurarlo si alguien lo
// atiende y llama a preventDefault.
//
// No se puede esperar a que a esta maquina le falte memoria, pero no hace falta:
// WebGL trae una extension, WEBGL_lose_context, hecha justo para provocarlo. O
// sea que esto se prueba de verdad y no de mentira.
//
// Lo que se comprueba es lo que ve el jugador: que en vez de un rectangulo en
// blanco sin explicacion aparezca que ha pasado y como salir.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-sin-video.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-sin-video.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await navegador.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(3500);

check('jugando no se avisa de nada', (await page.locator('.pantalla__caida').count()) === 0);

// La partida corre sobre WebGL, que es lo que hace posible todo esto.
const tipo = await page.evaluate(() => {
  const c = document.querySelector('.pantalla__media');
  for (const t of ['webgl2', 'webgl']) {
    try { if (c.getContext(t)) return t; } catch {}
  }
  return null;
});
check('la partida se pinta con WebGL', tipo !== null, tipo ?? 'ninguno');

// --- se le quita el contexto, como haria un movil sin memoria ---
const sePudo = await page.evaluate(() => {
  const c = document.querySelector('.pantalla__media');
  const gl = c.getContext('webgl2') ?? c.getContext('webgl');
  const ext = gl?.getExtension('WEBGL_lose_context');
  if (!ext) return false;
  ext.loseContext();
  return true;
});
check('se puede provocar la perdida para probarlo', sePudo === true);

await page.waitForTimeout(1200);

const aviso = page.locator('.pantalla__caida');
check('sale un aviso en vez de un rectangulo en blanco', (await aviso.count()) === 1);

const texto = (await aviso.textContent()) ?? '';
check('que dice lo que ha pasado', /memoria de video/i.test(texto), texto.slice(0, 60));
check('y que la imagen no vuelve sola, sin prometer magia',
  /no vuelve sola/i.test(texto));
check('con una salida: recargar', (await aviso.getByRole('button', { name: 'Recargar' }).count()) === 1);

// Y el contexto queda marcado como perdido, que es lo que de verdad paso.
const perdido = await page.evaluate(() => {
  const c = document.querySelector('.pantalla__media');
  const gl = c.getContext('webgl2') ?? c.getContext('webgl');
  return gl ? gl.isContextLost() : null;
});
check('el contexto esta de verdad perdido, no es un aviso de adorno', perdido === true);

await navegador.close();
console.log(fallos === 0 ? '\nQUEDARSE SIN VIDEO SE EXPLICA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

// El menu de opciones: que este lo que sirve y no lo que estorba.
//
// Tambien vigila la pantalla completa en escritorio, que se quedo en negro por
// una regla que hacia que la partida midiera cero: el hueco que la mide se
// ajustaba a su contenido, y el contenido se medía contra el hueco.
//
// Uso: node tools/tests/test-menu.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-menu.mjs <rom.gba>');
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
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, { timeout: 30_000 });
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(3500);

// --- pantalla completa en escritorio ---
await page.locator('.pantalla__boton--completa').click();
await page.waitForTimeout(900);
const enCompleta = await page.evaluate(() => {
  const p = document.querySelector('.pantalla--grande').getBoundingClientRect();
  return { ancho: Math.round(p.width), alto: Math.round(p.height), ventana: innerHeight };
});
check('en escritorio la partida se VE en pantalla completa',
  enCompleta.ancho > 100 && enCompleta.alto > 100,
  `${enCompleta.ancho}x${enCompleta.alto}`);
check('y aprovecha el alto', enCompleta.alto >= enCompleta.ventana * 0.6,
  `${enCompleta.alto} de ${enCompleta.ventana}`);
await page.locator('.pantalla__boton--completa').click();
await page.waitForTimeout(600);

// --- el menu ---
await page.locator('.iconbutton--opciones').click();
await page.waitForSelector('.toolbar', { timeout: 10_000 });

const hay = async (nombre) => (await page.getByRole('button', { name: nombre, exact: true }).count()) > 0;

check('reiniciar dice que reinicia la partida', await hay('Reiniciar partida'));
check('guardar y cargar estado siguen', (await hay('Guardar estado')) && (await hay('Cargar estado')));
check('exportar e importar ya no dicen ".sav"',
  (await hay('Exportar partida')) && (await hay('Importar partida')));
check('y no queda ningun ".sav" suelto en el menu',
  (await page.locator('.modal').getByText('.sav', { exact: false }).count()) === 0);
check('el avance rapido ya no esta en el menu',
  (await page.locator('.toolbar').getByText(/Avance rapido/).count()) === 0);
check('el registro del nucleo ya no se enseña',
  (await page.locator('.modal').getByText('Registro del nucleo').count()) === 0);
check('la seccion de ROM se llama "Cambiar ROM"',
  (await page.locator('.modal').getByText('Cambiar ROM', { exact: true }).count()) === 1);
check('aleatorizar tiene su boton de opciones', await hay('Opciones'));

// --- reiniciar pide confirmacion ---
const reiniciar = page.getByRole('button', { name: 'Reiniciar partida' });
await reiniciar.click();
await page.waitForTimeout(200);
check('al primer clic pregunta en vez de reiniciar',
  (await page.getByRole('button', { name: /Seguro/ }).count()) === 1);

// --- el avance rapido sigue funcionando por su camino ---
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await page.locator('canvas').click({ force: true }).catch(() => {});
await page.keyboard.press('Space');
await page.waitForTimeout(300);
const mult = await page.evaluate(() => globalThis.mGBAModule?.getFastForwardMultiplier?.() ?? 1);
check('y el espacio lo sigue encendiendo aunque no este en el menu', mult > 1, `x${mult}`);
await page.keyboard.press('Space');

await navegador.close();
console.log(fallos === 0 ? '\nEL MENU DICE LO QUE HACE' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

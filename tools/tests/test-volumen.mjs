// El volumen es del jugador, no de la partida.
//
// mGBA pone el volumen a tope en cada `loadGame`: para el nucleo el nivel es
// una propiedad del juego cargado. Eso se notaba de dos formas:
//
//   - Al aleatorizar, la copia nueva arrancaba sonando aunque tuvieras el juego
//     silenciado. Es por donde se vio.
//   - Y mas callado, ya pasaba con la primera ROM de la sesion: el nivel
//     guardado se aplicaba al arrancar el nucleo y `loadGame` lo borraba acto
//     seguido. La barra decia 70% y el juego sonaba al 100%.
//
// Lo que se comprueba aqui es que el nucleo suena al volumen que dice la barra,
// y no que la barra ensene un numero: el fallo era justo que los dos no se
// parecian en nada. `getVolume()` da el multiplicador de verdad, en pasos de
// 1/256, asi que se compara con holgura.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-volumen.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-volumen.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
// Un solo contexto para las dos cargas: el volumen se guarda en localStorage y
// eso es justo lo que tiene que sobrevivir.
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

/** Lo que suena de verdad y lo que dice la barra, para poder compararlos. */
const mirar = () =>
  page.evaluate(() => ({
    nucleo: globalThis.mGBAModule?.getVolume?.() ?? null,
    barra: Number(
      (document.querySelector('.volumen__cifra')?.textContent ?? '').replace('%', ''),
    ),
  }));

/** El nucleo va en pasos de 1/256, asi que 0.7 se guarda como 0.69921875. */
const cuadran = (nucleo, barra) => Math.abs(nucleo - barra / 100) < 0.01;

await cargar();

const recienCargada = await mirar();
check('el nucleo suena al volumen que dice la barra, ya en la primera ROM',
  cuadran(recienCargada.nucleo, recienCargada.barra),
  `nucleo ${recienCargada.nucleo}, barra ${recienCargada.barra}%`);

// --- silenciar ---
await page.locator('.volumen .iconbutton').click();
await page.waitForTimeout(500);

const silenciado = await mirar();
check('silenciar deja el nucleo a cero', silenciado.nucleo === 0 && silenciado.barra === 0,
  `nucleo ${silenciado.nucleo}, barra ${silenciado.barra}%`);

// --- EL CASO QUE SE REPORTO ---
// Cargar otra ROM con el juego silenciado. Da igual que venga del aleatorizador
// o de una partida guardada: las dos pasan por la misma funcion que esta carga.
await cargar();

const trasRecargar = await mirar();
check('el silencio sobrevive a cargar otra ROM', trasRecargar.barra === 0,
  `barra ${trasRecargar.barra}%`);
check('y el juego NO vuelve a sonar por su cuenta', trasRecargar.nucleo === 0,
  `nucleo ${trasRecargar.nucleo}`);

// --- y con un nivel normal, que no es lo mismo que cero ---
await page.locator('.volumen input[type=range]').evaluate((input) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(input, '40');
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.waitForTimeout(400);
await cargar();

const trasNivel = await mirar();
check('y un nivel cualquiera tambien sobrevive',
  trasNivel.barra === 40 && cuadran(trasNivel.nucleo, 40),
  `nucleo ${trasNivel.nucleo}, barra ${trasNivel.barra}%`);

await navegador.close();
console.log(fallos === 0 ? '\nEL VOLUMEN ES DEL JUGADOR' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

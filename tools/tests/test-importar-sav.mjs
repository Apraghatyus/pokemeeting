// Importar una partida empezada en otro sitio.
//
// Esto no funcionaba, y fallaba de la peor manera: sin decir nada. El nucleo
// guarda el fichero que le subes con el nombre que trae, pero el juego lee
// siempre `<nombre de la ROM>.sav`. O sea que importar "mi partida.sav" dejaba
// el fichero ahi al lado, intacto, y el juego seguia con su guardado vacio. Ni
// error, ni aviso, ni nada: pulsabas Importar y no pasaba absolutamente nada.
//
// Solo funcionaba si el fichero ya se llamaba igual que la ROM, que no es como
// se llaman ni los que exporta este programa ni los de otros emuladores.
//
// Por eso se comprueba el sistema de ficheros del nucleo y no la pantalla: lo
// que estaba mal era donde acababa el fichero.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-importar-sav.mjs <rom.gba> <partida.sav>
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const ROM = process.argv[2];
const SAV = process.argv[3];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM || !SAV) {
  console.error('Uso: node tools/tests/test-importar-sav.mjs <rom.gba> <partida.sav>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

// La partida de prueba tiene que tener algo dentro: una a ceros pasaria por
// buena sin haberse copiado.
const original = new Uint8Array(readFileSync(SAV));
const conContenido = original.filter((b) => b).length;
check('la partida de prueba tiene contenido', conContenido > 0, `${conContenido} bytes no nulos`);

// Y tiene que llamarse DISTINTO de la ROM, que es el caso que fallaba.
const nombreSav = SAV.split(/[\/]/).pop();
const nombreRom = ROM.split(/[\/]/).pop().replace(/\.[^.]+$/, '');
check('y un nombre distinto al de la ROM, que es el caso que fallaba',
  !nombreSav.startsWith(nombreRom), nombreSav);

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await navegador.newContext({ viewport: { width: 1000, height: 760 } })).newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.getByRole('button', { name: 'Jugar tal cual' }).click({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(3000);

await page.setInputFiles('input[type=file][accept*=".sav"]', SAV);
await page.waitForTimeout(4000);

const guardado = await page.evaluate(() => {
  const core = globalThis.mGBAModule;
  const base = (core.gameName?.split('/').pop() ?? '').replace(/\.[^.]+$/, '');
  const ruta = `${core.filePaths().savePath}/${base}.sav`;
  try {
    const f = core.FS.readFile(ruta);
    return { existe: true, bytes: f.length, conContenido: f.filter((b) => b).length };
  } catch {
    return { existe: false };
  }
});

check('la partida acaba en el fichero que el juego lee', guardado.existe === true);
check('y con el contenido de la que se importo, no vacia',
  guardado.conContenido === conContenido,
  `${guardado.conContenido} bytes no nulos, se esperaban ${conContenido}`);

await navegador.close();
console.log(fallos === 0 ? '\nLA PARTIDA IMPORTADA LLEGA A SU SITIO' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

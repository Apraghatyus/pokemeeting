// Comprueba que una partida se puede llevar a otro aparato.
//
// Es el caso completo: en un navegador se aleatoriza, se juega y se guarda; se
// descarga la partida; y en OTRO navegador, que no sabe nada del primero, se
// carga la ROM original y ese fichero, y hay que acabar con el mismo mundo y
// el mismo guardado.
//
// El segundo navegador se abre con su propio perfil a proposito: si compartiera
// el almacenamiento con el primero, la copia aleatorizada ya estaria ahi y la
// prueba no probaria nada.
//
// Necesita el servicio de aleatorizacion levantado (npm run dev:all).
//
// Uso: node tools/tests/test-llevarse-partida.mjs <rom.gba>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-llevarse-partida.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });

const abrir = async () => {
  const contexto = await navegador.newContext({
    viewport: { width: 1280, height: 860 },
    acceptDownloads: true,
  });
  const page = await contexto.newPage();
  page.on('pageerror', (e) => {
    if (!/unwind/.test(e.message)) console.log(`[pageerror] ${e.message}`.slice(0, 150));
  });
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  return page;
};

// ---------------------------------------------------------------- aparato 1
const primero = await abrir();
await primero.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await primero.getByRole('button', { name: 'Aleatorizar y jugar' }).click({ timeout: 20_000 });
await primero.waitForSelector('text=Partida aleatorizada', { timeout: 300_000 });
await primero.getByRole('button', { name: 'Empezar a jugar' }).click();
await primero.waitForTimeout(5000);

const copia = await primero.evaluate(() => globalThis.mGBAModule.gameName.split('/').pop());
check('se aleatoriza una partida', copia.includes('-aleatoria-'), copia);

// Se finge que el jugador guardo dentro del juego. Escribir el .sav a mano es
// la unica forma de llegar aqui sin jugar media hora, y lo que importa de la
// prueba es el viaje del fichero, no como se escribio.
const FIRMA = [0x45, 0x4d, 0x55, 0x50, 0x4f, 0x4b, 0x45]; // "EMUPOKE"
await primero.evaluate(
  async ({ nombre, firma }) => {
    const m = globalThis.mGBAModule;
    const sav = new Uint8Array(131072);
    for (let i = 0; i < sav.length; i += 1) sav[i] = (i * 7) % 251;
    sav.set(firma, 0);
    m.FS.writeFile(`${m.filePaths().savePath}/${nombre.replace(/\.[^.]+$/, '.sav')}`, sav);
    await m.FSSync();
  },
  { nombre: copia, firma: FIRMA },
);

// --- se descarga la partida ---
await primero.locator('.iconbutton--opciones').click();
await primero.getByRole('button', { name: 'Abrir opciones' }).click();
await primero.waitForSelector('.partida', { timeout: 20_000 });

const descarga = primero.waitForEvent('download', { timeout: 30_000 });
await primero.locator('.partida').first().getByRole('button', { name: /Descargar esta partida/ }).click();
const fichero = await descarga;
const destino = join(tmpdir(), fichero.suggestedFilename());
await fichero.saveAs(destino);

const bytes = readFileSync(destino);
check('se descarga el fichero de la partida', bytes.length > 100_000,
  `${fichero.suggestedFilename()}, ${bytes.length} bytes`);
check('y lleva la marca del formato', bytes.subarray(0, 17).toString() === 'EMUPOKE-PARTIDA-1');

// Lo que NO lleva: la ROM. Son dieciseis megas; esto pesa lo que el guardado.
check('no lleva la ROM dentro', bytes.length < 200_000, `${Math.round(bytes.length / 1024)} KB`);

const crcCopia = await primero.evaluate(() => {
  const m = globalThis.mGBAModule;
  const rom = m.FS.readFile(m.gameName);
  let crc = 0xffffffff;
  for (let i = 0; i < rom.length; i += 1) {
    crc ^= rom[i];
    for (let b = 0; b < 8; b += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
});

// ---------------------------------------------------------------- aparato 2
const segundo = await abrir();
await segundo.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await segundo.waitForSelector('text=Como quieres jugar', { timeout: 20_000 });
await segundo.locator('details.partidas > summary').click();
await segundo.setInputFiles('.partida__traer input[type=file]', destino);

// Rehacer la copia tarda: hay que aleatorizar los dieciseis megas otra vez.
const cargo = await segundo
  .waitForFunction(() => globalThis.mGBAModule?.gameName?.includes('-aleatoria-'), null, {
    timeout: 300_000,
  })
  .then(() => true)
  .catch(() => false);
check('en el otro aparato se rehace la partida', cargo);

if (cargo) {
  await segundo.waitForTimeout(3000);
  const resultado = await segundo.evaluate(() => {
    const m = globalThis.mGBAModule;
    const rom = m.FS.readFile(m.gameName);
    let crc = 0xffffffff;
    for (let i = 0; i < rom.length; i += 1) {
      crc ^= rom[i];
      for (let b = 0; b < 8; b += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    const nombre = m.gameName.split('/').pop();
    const sav = m.FS.readFile(`${m.filePaths().savePath}/${nombre.replace(/\.[^.]+$/, '.sav')}`);
    return {
      crc: ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0'),
      marca: [...sav.subarray(0, 7)],
      largo: sav.length,
    };
  });

  check('y sale la MISMA copia, byte a byte', resultado.crc === crcCopia,
    `${crcCopia} vs ${resultado.crc}`);
  check('con el guardado que venia dentro',
    resultado.marca.join(',') === FIRMA.join(','), `${resultado.largo} bytes`);
}

await navegador.close();
console.log(fallos === 0 ? '\nLA PARTIDA VIAJA ENTERA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

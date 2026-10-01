// Prueba aislada del nucleo de Nintendo DS.
//
// Antes de meter un nucleo nuevo en la aplicacion hay que responder dos
// preguntas, y las dos solo se responden ejecutandolo: ¿arranca una ROM de DS
// en el navegador?, y ¿a que velocidad? Lo segundo decide si tiene sentido,
// porque un emulador a veinte imagenes por segundo no sirve para jugar y menos
// para que dos personas jueguen a la vez.
//
// Esto NO toca la aplicacion. Monta una pagina aparte con el nucleo, la sirve
// con las mismas cabeceras de aislamiento que usamos, y mide. Asi se puede
// decidir con datos y sin haber reescrito nada.
//
// Uso: node tools/nds/probar-nds.mjs <rom.nds> [carpeta-de-capturas]
import { createServer } from 'node:http';
import { createReadStream, cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const ROM = process.argv[2];
const SHOTS = process.argv[3] ?? '.';
const PUERTO = 4190;

if (!ROM || !existsSync(ROM)) {
  console.error('Falta la ROM de Nintendo DS.');
  console.error('Uso: node tools/nds/probar-nds.mjs <rom.nds> [carpeta]');
  process.exit(2);
}

// El nucleo no viene con el proyecto, igual que no viene el jar del
// randomizer: es software de otra gente y con licencia GPL. Se instala aparte.
const NUCLEO = 'tools/nds/nucleo/data';
if (!existsSync(join(NUCLEO, 'loader.js'))) {
  console.error('No encuentro el nucleo de DS. Bajalo primero:\n');
  console.error('    node tools/nds/preparar.mjs\n');
  console.error('Lee tools/nds/LEEME.md antes: tiene consecuencias de licencia.');
  process.exit(2);
}

// --- se monta una carpeta con todo lo que la pagina necesita ---
//
// El frontend busca el nucleo en cores/<nombre>[-thread]-wasm.data. Con
// aislamiento cross-origin hay SharedArrayBuffer, asi que usara el de hilos.
const raiz = join(tmpdir(), 'emupoke-nds');
rmSync(raiz, { recursive: true, force: true });
mkdirSync(raiz, { recursive: true });
cpSync(NUCLEO, raiz, { recursive: true });

writeFileSync(
  join(raiz, 'index.html'),
  `<!doctype html>
<html lang="es">
  <head><meta charset="utf-8" /><title>Prueba de nucleo DS</title></head>
  <body style="margin:0;background:#000">
    <div style="width:100vw;height:100vh" id="pantalla"></div>
    <script>
      window.EJS_player = '#pantalla';
      window.EJS_core = 'desmume';
      window.EJS_gameUrl = '/rom.nds';
      window.EJS_pathtodata = '/';
      window.EJS_startOnLoaded = true;
      // El paquete de npm trae las fuentes sin minificar, y el cargador busca
      // primero las minificadas. Sin esto salen dos 404 que no rompen nada
      // pero despistan al leer la salida.
      window.EJS_DEBUG_XX = true;
      // Sin interfaz propia: aqui solo se mide el nucleo.
      window.EJS_Buttons = { playPause: false, restart: false, settings: false, fullscreen: false };
    </script>
    <script src="/loader.js"></script>
  </body>
</html>`,
);

// --- servidor minimo, con el mismo aislamiento que la aplicacion ---
const TIPOS = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.nds': 'application/octet-stream',
};

const servidor = createServer((req, res) => {
  const ruta = (req.url ?? '/').split('?')[0];
  const fichero = ruta === '/rom.nds' ? resolve(ROM) : join(raiz, ruta === '/' ? 'index.html' : ruta);

  if (!existsSync(fichero) || statSync(fichero).isDirectory()) {
    res.writeHead(404).end('no esta');
    return;
  }
  res.writeHead(200, {
    'content-type': TIPOS[extname(fichero)] ?? 'application/octet-stream',
    // Las mismas dos de siempre: el nucleo con hilos necesita SharedArrayBuffer.
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  });
  createReadStream(fichero).pipe(res);
});

await new Promise((listo) => servidor.listen(PUERTO, listo));
console.log(`sirviendo la prueba en http://localhost:${PUERTO}\n`);

const navegador = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
const pagina = await navegador.newPage({ viewport: { width: 1000, height: 800 } });
const problemas = [];
pagina.on('pageerror', (e) => problemas.push(String(e.message).slice(0, 120)));
pagina.on('response', (r) => {
  if (r.status() >= 400) problemas.push(`${r.status()} ${r.url().slice(0, 80)}`);
});

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

await pagina.goto(`http://localhost:${PUERTO}/`, { waitUntil: 'load' });

const aislado = await pagina.evaluate(() => globalThis.crossOriginIsolated);
check('la pagina tiene aislamiento cross-origin', aislado === true);

// El frontend tarda: descomprime el nucleo y monta su sistema de ficheros.
const arranco = await pagina
  .waitForFunction(() => typeof globalThis.EJS_emulator?.gameManager?.getFrameNum === 'function', null,
    { timeout: 180_000 })
  .then(() => true)
  .catch(() => false);
check('el nucleo arranca y expone su gestor de partida', arranco);

if (arranco) {
  // getFrameNum cuenta imagenes emuladas. Dos lecturas separadas dan la
  // velocidad real, que es lo unico que decide si DS es jugable aqui.
  const medir = async (segundos) => {
    const antes = await pagina.evaluate(() => globalThis.EJS_emulator.gameManager.getFrameNum());
    await pagina.waitForTimeout(segundos * 1000);
    const despues = await pagina.evaluate(() => globalThis.EJS_emulator.gameManager.getFrameNum());
    return (despues - antes) / segundos;
  };

  await pagina.waitForTimeout(4000); // que termine de arrancar el juego
  const velocidad = await medir(6);
  const nativo = 60;
  check('el juego avanza', velocidad > 0, `${velocidad.toFixed(1)} imagenes por segundo`);
  // Aviso importante al leer el numero: con una ROM de relleno el emulador casi
  // no trabaja. Esto es un techo, no la velocidad de un juego de verdad.
  check('va a velocidad jugable (al menos la mitad de la real)', velocidad >= nativo / 2,
    `${((velocidad / nativo) * 100).toFixed(0)}% de la velocidad real`);

  const dimensiones = await pagina.evaluate(() =>
    globalThis.EJS_emulator.gameManager.getVideoDimensions?.('width') ?? null,
  );
  console.log(`   ancho que declara el nucleo: ${dimensiones ?? 'no lo dice'}`);

  // Un estado es lo que permitiria leer el equipo, como se hace en GBA.
  const estado = await pagina.evaluate(() => {
    try {
      const bytes = globalThis.EJS_emulator.gameManager.getState();
      return bytes?.length ?? 0;
    } catch (e) {
      return `fallo: ${String(e).slice(0, 60)}`;
    }
  });
  check('se puede sacar un estado, que es por donde se leeria el equipo',
    typeof estado === 'number' && estado > 0, `${estado} bytes`);

  mkdirSync(SHOTS, { recursive: true });
  await pagina.screenshot({ path: join(SHOTS, 'nds.png') });
  console.log(`   captura en ${join(SHOTS, 'nds.png')}`);
}

if (problemas.length > 0) {
  console.log('\n--- avisos del navegador ---');
  for (const p of [...new Set(problemas)].slice(0, 8)) console.log(`   ${p}`);
}

await navegador.close();
servidor.close();
console.log(fallos === 0 ? '\nEL NUCLEO DE DS FUNCIONA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

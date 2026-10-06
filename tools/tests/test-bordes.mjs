// Las dos marcas de la ficha tienen que convivir.
//
// La ficha dice dos cosas distintas con el borde: amarillo alrededor si ese
// Pokemon esta peleando, y una barra de color al canto si le pasa algo. Son
// datos independientes y pueden darse a la vez -te duermen al que esta en el
// campo- asi que tienen que verse los dos.
//
// No se veian. Las dos reglas usan box-shadow y la del estado va despues en la
// hoja, asi que ganaba: al dormirse el que peleaba, se le iba la marca amarilla.
// Un fallo de cascada, no de logica, y por eso se prueba leyendo el estilo ya
// calculado por el navegador en vez de mirando clases.
//
// Necesita la aplicacion levantada (npm run dev:all).
//
// Uso: node tools/tests/test-bordes.mjs
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await navegador.newContext()).newPage();
await page.goto(URL, { waitUntil: 'load' });
// Basta con que la hoja de estilos este puesta: las reglas de la ficha son
// globales, asi que no hace falta cargar ninguna ROM para comprobarlas.
await page.waitForSelector('.dropzone', { timeout: 30_000 });

/** Pinta una ficha con esas clases y devuelve la sombra que le calcula el navegador. */
const sombraDe = (clases) =>
  page.evaluate((lista) => {
    const li = document.createElement('li');
    li.className = lista;
    document.body.append(li);
    const sombra = getComputedStyle(li).boxShadow;
    li.remove();
    return sombra;
  }, clases);

const ACENTO = '255, 203, 5';

const normal = await sombraDe('ficha');
check('una ficha sin nada no dibuja ningun borde', normal === 'none', normal);

const peleando = await sombraDe('ficha ficha--activo');
check('el que pelea lleva el borde amarillo', peleando.includes(ACENTO), peleando);

const dormido = await sombraDe('ficha ficha--dormido');
check('el que esta dormido lleva su barra de estado',
  dormido.includes('inset') && !dormido.includes(ACENTO), dormido);

// EL CASO QUE SE REPORTO: duermen al que esta peleando.
const peleandoYDormido = await sombraDe('ficha ficha--activo ficha--dormido');
check('al dormir al que pelea, NO se le quita el borde amarillo',
  peleandoYDormido.includes(ACENTO), peleandoYDormido);
check('y conserva tambien la barra de estado alterado',
  peleandoYDormido.includes('138, 127, 212'), peleandoYDormido);

// Y lo mismo con el resto de estados, que es donde se cuela una lista a medias.
for (const [estado, color] of [
  ['debilitado', '238, 21, 21'],
  ['congelado', '118, 199, 224'],
  ['paralizado', '217, 179, 42'],
  ['quemado', '224, 122, 60'],
  ['envenenado', '168, 97, 196'],
]) {
  const sombra = await sombraDe(`ficha ficha--activo ficha--${estado}`);
  check(`y con ${estado} tambien se ven los dos`,
    sombra.includes(ACENTO) && sombra.includes(color), sombra);
}

await navegador.close();
console.log(fallos === 0 ? '\nLAS DOS MARCAS CONVIVEN' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

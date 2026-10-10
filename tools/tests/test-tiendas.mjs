// El aleatorizado de los objetos de tienda.
//
// Se reporto que "no funcionaba". Y funcionaba: lo que pasaba es que la casilla
// venia desmarcada, y para verla hay que bajar por una lista de quince
// opciones. O sea que el fallo no estaba en generar nada, estaba en que nadie
// lo pedia nunca.
//
// Por eso esta prueba mira las dos cosas por separado, que es lo que habria
// ahorrado el viaje:
//
//   1. Que el servicio cambia de verdad las listas de objetos de las tiendas.
//      No vale con que diga que lo ha hecho: se miran los bytes y se comprueba
//      que donde habia una lista de objetos seguidos -como la pone el juego-
//      ahora hay otra cosa, y que sigue siendo objetos que existen.
//   2. Que la casilla viene marcada. Una opcion que funciona y que nadie marca
//      es, para quien juega, una opcion que no funciona.
//
// Lo primero necesita el servicio de aleatorizacion (npm run dev:all). Lo
// segundo, ademas, la aplicacion levantada.
//
// Uso: node tools/tests/test-tiendas.mjs <rom.gba>
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';
const SERVICIO = process.env.RANDOMIZER_URL ?? 'http://127.0.0.1:8788';

if (!ROM) {
  console.error('Uso: node tools/tests/test-tiendas.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const rom = readFileSync(ROM);

/** Marco del cuerpo: [4 bytes: longitud del JSON][JSON][ROM]. */
const empaquetar = (peticion) => {
  const cabecera = Buffer.from(JSON.stringify(peticion), 'utf8');
  const cuerpo = Buffer.alloc(4 + cabecera.length + rom.length);
  cuerpo.writeUInt32BE(cabecera.length, 0);
  cabecera.copy(cuerpo, 4);
  rom.copy(cuerpo, 4 + cabecera.length);
  return cuerpo;
};

const aleatorizar = async (options) => {
  const r = await fetch(`${SERVICIO}/randomize`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-body-encoding': 'gzip' },
    body: gzipSync(empaquetar({ options, seed: '12345' }), { level: 6 }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  const bruto = Buffer.from(await r.arrayBuffer());
  return {
    rom: r.headers.get('x-body-encoding') === 'gzip' ? gunzipSync(bruto) : bruto,
    resumen: JSON.parse(
      Buffer.from(r.headers.get('x-summary') ?? '', 'base64').toString('utf8') || '{}',
    ),
  };
};

// --- 1. el servicio ---
const hecha = await aleatorizar(['tiendas']).catch((e) => {
  console.error(`No hay servicio en ${SERVICIO}: ${e.message}`);
  process.exit(1);
});

check('pedir solo las tiendas devuelve solo eso',
  hecha.resumen.changed?.join() === 'Objetos de tienda', JSON.stringify(hecha.resumen.changed));

/**
 * Los tramos de la ROM que cambian, juntando los que estan pegados.
 *
 * Se cortan tras ocho bytes iguales seguidos: dentro de una lista de objetos
 * puede repetirse alguno, y partir por el primer byte igual trocearia una misma
 * lista en pedazos sueltos.
 */
const tramosQueCambian = (antes, ahora) => {
  const tramos = [];
  let inicio = -1;
  let iguales = 0;
  for (let i = 0; i < antes.length; i += 1) {
    if (antes[i] !== ahora[i]) {
      if (inicio < 0) inicio = i;
      iguales = 0;
    } else if (inicio >= 0) {
      iguales += 1;
      if (iguales >= 8) {
        tramos.push([inicio, i - iguales + 1]);
        inicio = -1;
      }
    }
  }
  if (inicio >= 0) tramos.push([inicio, antes.length]);
  return tramos;
};

const tramos = tramosQueCambian(rom, hecha.rom);
check('y cambia bytes de la ROM', tramos.length > 0, `${tramos.length} tramos`);

/** Cuantos objetos existen en tercera generacion. Un indice mayor no es un objeto. */
const OBJETOS_GEN3 = 377;

/**
 * Las listas de tienda del juego son objetos SEGUIDOS: el juego las escribe asi
 * -pocion, antidoto, despertar...-. Esa es la forma que hay que ver cambiar;
 * los cambios sueltos de un byte pueden ser cualquier otra cosa.
 */
const esListaDeObjetos = (buf, [a, b]) => {
  if (b - a < 8) return false;
  const ids = [];
  for (let i = a; i + 1 < b; i += 2) ids.push(buf.readUInt16LE(i));
  return ids.length >= 4 && ids.every((id) => id > 0 && id <= OBJETOS_GEN3);
};

const listasAntes = tramos.filter((t) => esListaDeObjetos(rom, t));
const listasAhora = tramos.filter((t) => esListaDeObjetos(hecha.rom, t));

check('donde habia una lista de objetos sigue habiendo otra',
  listasAntes.length > 0 && listasAhora.length >= listasAntes.length,
  `${listasAntes.length} listas antes, ${listasAhora.length} despues`);

// Y lo que hay ahora no es lo de antes. Sin esto, una lista intacta pasaria
// igual de bien: lo que se comprueba es que CAMBIO, no que exista.
const primera = listasAntes[0];
if (primera) {
  const leer = (buf) => {
    const ids = [];
    for (let i = primera[0]; i + 1 < primera[1]; i += 2) ids.push(buf.readUInt16LE(i));
    return ids;
  };
  const viejos = leer(rom);
  const nuevos = leer(hecha.rom);
  check('y no es la misma lista', viejos.join() !== nuevos.join(),
    `${viejos.slice(0, 6).join(',')} -> ${nuevos.slice(0, 6).join(',')}`);
  check('y todos los objetos nuevos existen de verdad',
    nuevos.every((id) => id > 0 && id <= OBJETOS_GEN3), nuevos.slice(0, 6).join(','));
}

// Sin pedirlo, no se tocan: una opcion que cambia cosas sin marcarla seria peor
// que una que no cambia nada.
const sinPedirlo = await aleatorizar(['salvajes']);
const intactas = (primera ?? [0, 0])[1] > 0
  ? rom.subarray(primera[0], primera[1]).equals(sinPedirlo.rom.subarray(primera[0], primera[1]))
  : true;
check('y sin marcarlas, las tiendas se quedan como estaban', intactas);

// --- 2. la casilla ---
const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await navegador.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
  timeout: 30_000,
});
await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
await page.waitForSelector('.interruptor', { timeout: 30_000 });
await page.waitForTimeout(500);

const marcadas = await page.evaluate(() =>
  [...document.querySelectorAll('.interruptor')]
    .filter((l) => l.querySelector('input')?.checked)
    .map((l) => l.querySelector('.interruptor__nombre')?.textContent?.trim() ?? ''),
);

check('la opcion de las tiendas viene marcada', marcadas.some((n) => /tienda/i.test(n)),
  marcadas.join(' / '));
// Las cuatro de siempre siguen ahi: esto no venia a cambiar lo que ya habia.
for (const nombre of ['salvajes', 'iniciales', 'entrenadores', 'aprenden']) {
  check(`y siguen marcadas las de siempre (${nombre})`,
    marcadas.some((n) => new RegExp(nombre, 'i').test(n)));
}

// Y lo que se genera por defecto las lleva. Es la comprobacion que de verdad
// cierra el reporte: no que la casilla este marcada, sino que llegan al mundo.
await page.getByRole('button', { name: 'Aleatorizar y jugar' }).click({ timeout: 20_000 });
await page.locator('.hecha__cambios, .hecha .warn').first().waitFor({ timeout: 180_000 });
const cambios = ((await page.locator('.hecha__cambios').textContent()) ?? '').toLowerCase();
check('y una partida hecha con lo de por defecto trae las tiendas aleatorizadas',
  cambios.includes('objetos de tienda'), cambios.trim());

await navegador.close();
console.log(
  fallos === 0
    ? '\nLAS TIENDAS SE ALEATORIZAN Y ADEMAS SE PIDEN SOLAS'
    : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

// El aleatorizado de los objetos de tienda.
//
// Se reporto que "no funcionaba", y era verdad a medias: el randomizer decia
// que las habia cambiado y la primera tienda del juego seguia vendiendo Poke
// Ball, Pocion, Antidoto y Antiparaliz.
//
// La causa estaba en SU base de datos, no en nuestro codigo: trae una lista
// `SkipShops` con las tiendas que no va a tocar, y en Rojo Fuego se come veinte
// de las veintitres. La de Ciudad Verde -0x16A330 en la ROM espanola- es una de
// ellas. Por eso las otras veinte se aleatorizan por nuestra cuenta despues;
// ver `apps/randomizer/src/tiendas.ts`.
//
// Lo que se comprueba, por orden de lo que mas duele si se rompe:
//
//   1. Que la primera tienda del juego cambia. Es la que se miro para reportarlo.
//   2. Que se puede seguir comprando balls y pociones donde se podia. Una
//      Nuzlocke sin forma de comprar balls no es mas dificil: es imposible.
//   3. Que lo que aparece en los escaparates son objetos que esa ROM ya vendia.
//      Repartir numeros al azar meteria objetos clave y MOs donde no van.
//   4. Que la misma semilla da la misma ROM. Si no, una partida no se puede
//      rehacer y el enlace de invitacion deja de valer.
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
    semilla: r.headers.get('x-seed'),
    ajustes: r.headers.get('x-settings'),
  };
};

// --- 1. el servicio ---
const hecha = await aleatorizar(['tiendas']).catch((e) => {
  console.error(`No hay servicio en ${SERVICIO}: ${e.message}`);
  process.exit(1);
});

check('pedir solo las tiendas devuelve solo eso',
  hecha.resumen.changed?.join() === 'Objetos de tienda', JSON.stringify(hecha.resumen.changed));

/** La lista de una tienda: objetos seguidos hasta un cero. */
const listaEn = (buf, donde) => {
  const ids = [];
  for (let i = 0; i < 24; i += 1) {
    const id = buf.readUInt16LE(donde + i * 2);
    if (id === 0) break;
    ids.push(id);
  }
  return ids;
};

/**
 * Las tiendas de la ROM espanola de Rojo Fuego, de la base de datos del propio
 * randomizer. La 5 es la primera del juego, la de Ciudad Verde: es la que se
 * miro para reportar que esto no funcionaba.
 */
const TIENDAS = [
  0x164a4c, 0x167778, 0x167790, 0x1677ac, 0x1677cc, 0x16a330, 0x16a7a0, 0x16ad70,
  0x16b428, 0x16b724, 0x16bbd0, 0x16bc0c, 0x16bcc8, 0x16bd1c, 0x16bd54, 0x16d5b0,
  0x16eae0, 0x16eb8c, 0x16f074, 0x170bf4, 0x171950, 0x171d70, 0x171f28,
];
const CIUDAD_VERDE = 0x16a330;

// --- 1. la tienda que se miro ---
const antesVerde = listaEn(rom, CIUDAD_VERDE);
const ahoraVerde = listaEn(hecha.rom, CIUDAD_VERDE);
check('la primera tienda del juego vendia lo de siempre',
  antesVerde.join() === '4,13,14,18', antesVerde.join());
check('y ahora vende otra cosa', ahoraVerde.join() !== antesVerde.join(),
  `${antesVerde.join()} -> ${ahoraVerde.join()}`);
check('sin cambiar de tamano, que la lista la lee el juego',
  ahoraVerde.length === antesVerde.length, `${antesVerde.length} -> ${ahoraVerde.length}`);

// --- 2. lo que no se puede perder ---
const esBall = (id) => id >= 1 && id <= 12;
const POCION = 13;
let sinSuBall = 0;
let sinSuPocion = 0;
for (const donde of TIENDAS) {
  const antes = listaEn(rom, donde);
  const ahora = listaEn(hecha.rom, donde);
  for (const id of antes) {
    if (esBall(id) && !ahora.includes(id)) sinSuBall += 1;
    if (id === POCION && !ahora.includes(id)) sinSuPocion += 1;
  }
}
check('donde se vendian balls se siguen vendiendo', sinSuBall === 0,
  `${sinSuBall} tiendas se quedaron sin la suya`);
check('y donde se vendian pociones tambien', sinSuPocion === 0,
  `${sinSuPocion} tiendas se quedaron sin la suya`);

// --- 3. nada que la ROM no vendiera ya ---
const catalogo = new Set(TIENDAS.flatMap((d) => listaEn(rom, d)));
const nuevos = TIENDAS.flatMap((d) => listaEn(hecha.rom, d));
const intrusos = nuevos.filter((id) => !catalogo.has(id));
// Las tres que toca el randomizer pueden traer objetos suyos; las nuestras no.
const nuestras = TIENDAS.filter((_, i) => ![12, 13, 14].includes(i));
const intrusosNuestros = nuestras
  .flatMap((d) => listaEn(hecha.rom, d))
  .filter((id) => !catalogo.has(id));
check('lo que ponemos nosotros sale del catalogo de la propia ROM',
  intrusosNuestros.length === 0, intrusosNuestros.slice(0, 8).join(','));
check('y todo lo que hay en los escaparates es un objeto que existe',
  nuevos.every((id) => id > 0 && id <= 377), `${intrusos.length} de fuera del catalogo`);

// --- 4. la misma semilla, la misma ROM ---
const otraVez = await aleatorizar(['tiendas']);
check('la misma semilla da exactamente la misma copia',
  otraVez.rom.equals(hecha.rom),
  'si no, una partida no se puede rehacer desde su semilla');

// Y por el camino de verdad: rehacerla como la rehace el programa, con los
// ajustes ya resueltos y la semilla, SIN la lista de opciones.
//
// Es la comprobacion que de verdad protege algo. Por ahi no llega ningun
// 'tiendas' que mirar, asi que decidir por la peticion dejaba la copia rehecha
// sin tiendas cambiadas; y como se comparan byte a byte, el enlace de
// invitacion y el boton de rehacer partida habrian dejado de funcionar en
// cuanto alguien marcara esta casilla.
const rehecha = await fetch(`${SERVICIO}/randomize`, {
  method: 'POST',
  headers: { 'content-type': 'application/octet-stream', 'x-body-encoding': 'gzip' },
  body: gzipSync(
    empaquetar({
      settingsString: Buffer.from(hecha.ajustes ?? '', 'base64').toString('utf8'),
      seed: hecha.semilla ?? undefined,
    }),
    { level: 6 },
  ),
});
const brutoRehecho = Buffer.from(await rehecha.arrayBuffer());
const romRehecha =
  rehecha.headers.get('x-body-encoding') === 'gzip' ? gunzipSync(brutoRehecho) : brutoRehecho;
check('y rehacerla desde su semilla da la misma, tambien las tiendas',
  romRehecha.equals(hecha.rom),
  'si no, el enlace de invitacion y rehacer partida dejan de valer');

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

// No viene marcada, y es a proposito: cambia lo que te venden, y eso conviene
// elegirlo. Lo que no puede pasar es que marcarla no sirva de nada, que es lo
// que se reporto.
check('la opcion no viene marcada por defecto', !marcadas.some((n) => /tienda/i.test(n)),
  marcadas.join(' / '));

const laDeTiendas = page
  .locator('.interruptor')
  .filter({ has: page.locator('.interruptor__nombre', { hasText: 'Objetos de tienda' }) });
check('pero la opcion esta ahi', (await laDeTiendas.count()) === 1);

await laDeTiendas.click();
await page.waitForTimeout(200);
check('y se puede marcar',
  (await laDeTiendas.locator('input').isChecked()) === true);

await page.getByRole('button', { name: 'Aleatorizar y jugar' }).click({ timeout: 20_000 });
await page.locator('.hecha__cambios, .hecha .warn').first().waitFor({ timeout: 180_000 });
const cambios = ((await page.locator('.hecha__cambios').textContent()) ?? '').toLowerCase();
check('y marcandola, la partida sale con las tiendas aleatorizadas',
  cambios.includes('objetos de tienda'), cambios.trim());

await navegador.close();
console.log(
  fallos === 0
    ? '\nLAS TIENDAS SE ALEATORIZAN DE VERDAD, TAMBIEN LA PRIMERA'
    : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

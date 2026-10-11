// El ranking, con datos sembrados a proposito.
//
// No se comprueba "que salga una tabla": se comprueban las tres reglas que la
// hacen significar algo, y las tres son faciles de romper sin darse cuenta.
//
//   1. Las DESCARTADAS no cuentan para el porcentaje. Si contaran -o si no se
//      ensenaran- bastaria con borrar lo que va mal antes de la pantalla de
//      derrota para quedarse en el 100%.
//   2. SOLA y SOUL LINK no se mezclan. Son dos competiciones distintas: en
//      Soul Link tu Pokemon muere tambien cuando muere el de la otra persona.
//   3. El filtro por juego filtra de verdad.
//
// Hace falta todo levantado (npm run dev:all) con DATABASE_URL puesta.
//
// Uso: node tools/tests/test-ranking.mjs
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

let fallos = 0;
const check = (que, bien, detalle = '') => {
  console.log(`${bien ? 'OK  ' : 'MAL '}  ${que}${detalle ? `  -> ${detalle}` : ''}`);
  if (!bien) fallos += 1;
};

const sello = Date.now().toString(36);
const USUARIO = `rank${sello}`;
const APODO = `Rankeador ${sello.slice(-4)}`;
const CLAVE = 'una-contrasena-larga';

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const page = await (await navegador.newContext({ viewport: { width: 1320, height: 900 } })).newPage();
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1500);

// --- sembrar ------------------------------------------------------------
//
// Siete finales a proposito: cuatro victorias y una derrota en solitario -que
// dan un 80% sobre cinco partidas, justo el minimo para que el porcentaje se
// ensene-, una descartada que no debe contar, y una victoria de Soul Link que
// no debe aparecer en la pestana de solitario.
const sembrado = await page.evaluate(
  async ({ usuario, clave, apodo, sello }) => {
    const pedir = (ruta, cuerpo) =>
      fetch(`/cuentas${ruta}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Emupoke': '1' },
        body: JSON.stringify(cuerpo),
      }).then((r) => r.json());

    await pedir('/registro', { usuario, clave, apodo });

    const final = (n, resultado, extra) => ({
      id: `${sello}-${n}`,
      partida: `${sello}.gba`,
      cuando: Date.now() - n * 86_400_000,
      resultado,
      porElEnlace: false,
      medallas: 4,
      equipo: [
        { especie: 25, mote: 'CHISPA', nivel: 30, movimientos: [45, 0, 0, 0], caido: false },
      ],
      ...extra,
    });

    return pedir('/subir', {
      partidas: [],
      finales: [
        final(1, 'victoria', { juego: 'Rojo Fuego', modo: 'sola' }),
        final(2, 'victoria', { juego: 'Rojo Fuego', modo: 'sola' }),
        final(3, 'victoria', { juego: 'Esmeralda', modo: 'sola' }),
        final(7, 'victoria', { juego: 'Rojo Fuego', modo: 'sola' }),
        final(4, 'derrota', { juego: 'Rojo Fuego', modo: 'sola' }),
        final(5, 'descartada', { juego: 'Rojo Fuego', modo: 'sola' }),
        final(6, 'victoria', { juego: 'Rojo Fuego', modo: 'soullink', companero: 'Mateo' }),
      ],
    });
  },
  { usuario: USUARIO, clave: CLAVE, apodo: APODO, sello },
);

check('se siembran los siete finales', sembrado.finales?.nuevos === 7, JSON.stringify(sembrado.finales));

// --- 1. en solitario ----------------------------------------------------
await page.locator('.iconbutton--ranking').click();
await page.waitForTimeout(1500);

/** La fila de nuestro jugador, buscandolo por su nombre. */
const miFila = async () => {
  await page.locator('.rank__buscar').fill(APODO);
  await page.waitForTimeout(300);
  const fila = page.locator('.rank__fila').first();
  if ((await fila.count()) === 0) return null;
  return {
    partidas: ((await fila.locator('.rank__partidas').textContent()) ?? '').replace(/\s+/g, ' ').trim(),
    porcentaje: ((await fila.locator('.rank__porcentaje').textContent()) ?? '').trim(),
    victorias: ((await fila.locator('.rank__v').textContent()) ?? '').trim(),
    derrotas: ((await fila.locator('.rank__d').textContent()) ?? '').trim(),
    fila,
  };
};

const solo = await miFila();
check('el jugador aparece en el ranking', solo !== null);

if (solo) {
  // Cinco: cuatro victorias y una derrota. La descartada NO esta aqui.
  check('las partidas contadas son las terminadas, sin la descartada',
    solo.partidas.startsWith('5 partidas'), solo.partidas);
  check('y la descartada se dice aparte, no se esconde',
    /1 descartada/.test(solo.partidas), solo.partidas);
  check('el porcentaje sale de victorias y derrotas, no de las descartadas',
    solo.porcentaje === '80%', `${solo.porcentaje}, con 4V de 5`);
  check('con sus victorias y derrotas', solo.victorias === '4V' && solo.derrotas === '1D',
    `${solo.victorias} ${solo.derrotas}`);

  // Y la de Soul Link no se ha colado en la cuenta de solitario.
  check('la partida de Soul Link no cuenta aqui', !solo.partidas.startsWith('6 partidas'),
    solo.partidas);
}

// --- 2. el filtro por juego --------------------------------------------
await page.locator('.rank__juegos button', { hasText: 'Esmeralda' }).first().click();
await page.waitForTimeout(900);
const soloEsmeralda = await miFila();
check('filtrando por juego quedan solo las de ese juego',
  soloEsmeralda?.partidas.startsWith('1 partida'), soloEsmeralda?.partidas);
// Y con una sola partida NO se ensena porcentaje. Un 100% de una partida no
// dice nada y parece que si; hasta que hay unas cuantas, la cuenta cruda.
check('pero con una sola partida no se ensena porcentaje',
  soloEsmeralda?.porcentaje === '—', soloEsmeralda?.porcentaje);

await page.locator('.rank__juegos button', { hasText: 'Todos' }).first().click();
await page.waitForTimeout(900);

// --- 3. Soul Link es otra competicion -----------------------------------
await page.locator('.rank__modos button', { hasText: 'Soul Link' }).click();
await page.waitForTimeout(1200);

const enlace = await miFila();
check('en Soul Link solo esta la de Soul Link',
  enlace?.partidas.startsWith('1 partida'), enlace?.partidas);
check('y con su victoria', enlace?.victorias === '1V' && enlace?.derrotas === '0D',
  `${enlace?.victorias} ${enlace?.derrotas}`);

// --- 4. lo que se despliega ---------------------------------------------
await page.locator('.rank__modos button', { hasText: 'Solo' }).click();
await page.waitForTimeout(1200);
const vuelta = await miFila();
await vuelta.fila.locator('.rank__cabecera').click();
await page.waitForTimeout(600);

const partidas = page.locator('.rank__fila').first().locator('.rank__partida');
check('al desplegar salen sus ultimas partidas', (await partidas.count()) > 0,
  `${await partidas.count()}`);
check('con el equipo que llevaba',
  (await page.locator('.rank__fila').first().locator('.rank__poke').count()) > 0);

const texto = ((await partidas.first().textContent()) ?? '').replace(/\s+/g, ' ');
check('y diciendo de que juego era', /Rojo Fuego|Esmeralda/.test(texto), texto.slice(0, 60));

// --- 5. volver deja la partida como estaba ------------------------------
await page.locator('.rank__volver').click();
await page.waitForTimeout(600);
check('al volver, el ranking se cierra', (await page.locator('.rank').count()) === 0);
check('y la pagina de jugar sigue ahi', (await page.locator('.topbar').count()) === 1);

await navegador.close();
console.log(fallos === 0 ? '\nEL RANKING CUENTA LO QUE DEBE' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

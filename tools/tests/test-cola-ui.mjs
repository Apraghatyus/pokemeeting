// Que el jugador vea la cola, no solo que exista.
//
// La cola ya se prueba por dentro (test-cola) y por HTTP (test-cola-servicio).
// Lo que falta es lo unico que le importa a quien espera: que la pagina le diga
// algo. Si el servidor hace cola perfectamente y la pantalla sigue diciendo
// "Aleatorizando..." veinte minutos, la cola no ha servido de nada.
//
// Se abren tantas pestanas como haga falta para pasarse del limite del servicio
// y se aleatoriza en todas a la vez.
//
// Necesita la aplicacion y el servicio levantados (npm run dev:all).
//
// Uso: node tools/tests/test-cola-ui.mjs <rom.gba>
import { chromium } from 'playwright';

const ROM = process.argv[2];
const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

if (!ROM) {
  console.error('Uso: node tools/tests/test-cola-ui.mjs <rom.gba>');
  process.exit(2);
}

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const limite = await fetch('http://127.0.0.1:8788/cola')
  .then((r) => r.json())
  .then((d) => d.limite)
  .catch(() => null);

if (limite === null) {
  console.error('No encuentro el servicio de aleatorizacion. Arranca npm run dev:all.');
  process.exit(2);
}

// Una mas que las que caben: la de mas es la que tiene que ver la cola.
const CUANTAS = limite + 1;
console.log(`el servicio atiende ${limite} a la vez, asi que abro ${CUANTAS} pestanas\n`);

const navegador = await chromium.launch({ channel: 'msedge', headless: true });

const abrir = async () => {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await contexto.newPage();
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => !document.querySelector('.dropzone button')?.disabled, null, {
    timeout: 30_000,
  });
  await page.setInputFiles('input[type=file][accept*=".gba"]', ROM);
  await page.waitForSelector('text=Como quieres jugar', { timeout: 20_000 });
  return page;
};

const pestanas = [];
for (let i = 0; i < CUANTAS; i += 1) pestanas.push(await abrir());

// Todas a la vez: la ultima no cabe y tiene que esperar.
await Promise.all(
  pestanas.map((p) => p.getByRole('button', { name: 'Aleatorizar y jugar' }).click()),
);

// Buscar el aviso de espera en cualquiera de ellas. En cual sale es cosa del
// orden en que lleguen al servidor, asi que se vigilan todas.
const aviso = await Promise.race(
  pestanas.map(async (p, i) => {
    const texto = p.locator('.modal .hint[role=status]');
    await texto.waitFor({ timeout: 90_000 });
    return { pestana: i, texto: (await texto.textContent()) ?? '' };
  }),
).catch(() => null);

check('a quien no le cabe turno se le avisa', aviso !== null,
  aviso ? `pestana ${aviso.pestana}: "${aviso.texto.trim()}"` : 'nadie vio nada en 90 s');

if (aviso) {
  const t = aviso.texto;
  check('el aviso dice cuanta gente hay delante o que es el siguiente',
    /\d+ esperando antes que tu/.test(t) || /siguiente/i.test(t), t.trim());
  // No es un adorno: sin una estimacion, "eres el cuarto" no contesta la
  // pregunta de si da tiempo a levantarse de la silla.
  check('y da una estimacion o dice que puede esperar tranquilo',
    /minuto|siguiente|pestana/i.test(t), t.trim());
}

// Y lo importante: que ninguna se quede sin su copia por haber esperado.
const acabaron = await Promise.all(
  pestanas.map((p, i) =>
    p
      .waitForSelector('text=Partida aleatorizada', { timeout: 300_000 })
      .then(() => true)
      .catch(() => {
        console.log(`   (la pestana ${i} no llego a terminar)`);
        return false;
      }),
  ),
);
check(`las ${CUANTAS} acaban con su copia`, acabaron.every(Boolean),
  `${acabaron.filter(Boolean).length}/${CUANTAS}`);

// Esperar no puede significar recibir la copia de otro.
const semillas = await Promise.all(
  pestanas.map((p) =>
    p
      .locator('.semilla code, .semilla, [data-semilla]')
      .first()
      .textContent()
      .catch(() => null),
  ),
);
const utiles = semillas.filter((x) => x && x.trim() !== '');
if (utiles.length === CUANTAS) {
  check('y cada una es una partida distinta', new Set(utiles).size === CUANTAS,
    `${new Set(utiles).size}/${CUANTAS} distintas`);
}

await navegador.close();
console.log(fallos === 0 ? '\nLA ESPERA SE VE EN PANTALLA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

// El cartel del DEBER del Centro tiene que verse, y verse a la vez que un aviso.
//
// Son dos carteles distintos en la misma esquina de la pantalla: el aviso de
// una regla rota -que se va solo- y el deber del Centro -que se queda hasta que
// se cumple-. Pegado cada uno al borde por su cuenta, en una pantalla estrecha
// los textos largos del Centro ocupan varias lineas y un cartel tapaba al otro:
// de ahi la columna que los apila.
//
// Se prueba leyendo el estilo YA CALCULADO por el navegador, no las clases: es
// un fallo de cascada y de posiciones, no de logica, igual que el de las dos
// marcas de la ficha (ver test-bordes.mjs). Y sin ROM: las reglas de la hoja
// son globales.
//
// La logica -quien hay que guardar y cuando- se prueba aparte, sin navegador,
// en test-reglas-en-vivo.mjs (`deberDelCentro`).
//
// Necesita la aplicacion levantada (npm run dev).
//
// Uso: node tools/tests/test-deber-centro.mjs
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL ?? 'http://localhost:5173/';

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

// Los dos mensajes de verdad, tal cual los escribe `reglasEnVivo.ts`: son
// largos, y lo largo es justo lo que rompia la colocacion.
const DEBER =
  'Antes de seguir tienes que guardar a PIDGEY en el PC: está muerto aunque lo hayas sacado del PC. Hasta que lo hagas la enfermera no te atiende y no puedes salir del Centro.';
const AVISO =
  'La enfermera no atiende con PIDGEY en el equipo: está muerto aunque lo hayas sacado del PC. Solo vuelve con un Revivir; si no, déjalo en el PC o libéralo antes de curar.';

const navegador = await chromium.launch({ channel: 'msedge', headless: true });
const contexto = await navegador.newContext();

/** Pinta la columna de avisos como la pinta la aplicacion y mide lo que sale. */
const medirEn = (hoja) =>
  hoja.evaluate(
    ([textoDeber, textoAviso]) => {
      const columna = document.createElement('div');
      columna.className = 'avisos';
      columna.innerHTML = `
        <div class="aviso-regla aviso-regla--deber">
          <span class="aviso-regla__marca">PC</span><span>${textoDeber}</span>
        </div>
        <div class="aviso-regla aviso-regla--error">
          <span class="aviso-regla__marca">!</span><span>${textoAviso}</span>
        </div>`;
      document.body.append(columna);
      const [elDeber, elAviso] = columna.querySelectorAll('.aviso-regla');
      const caja = (e) => {
        const r = e.getBoundingClientRect();
        return { arriba: r.top, abajo: r.bottom, ancho: r.width, alto: r.height };
      };
      const estilo = (e, sel) => getComputedStyle(sel ? e.querySelector(sel) : e);
      const medida = {
        deber: caja(elDeber),
        aviso: caja(elAviso),
        pantalla: window.innerHeight,
        bordeDeber: estilo(elDeber).borderTopColor,
        bordeAviso: estilo(elAviso).borderTopColor,
        marcaFondo: estilo(elDeber, '.aviso-regla__marca').backgroundColor,
        marcaLetra: estilo(elDeber, '.aviso-regla__marca').color,
        botonesDelDeber: elDeber.querySelectorAll('button').length,
      };
      columna.remove();
      return medida;
    },
    [DEBER, AVISO],
  );

const abrir = async (ancho, alto) => {
  const hoja = await contexto.newPage();
  await hoja.setViewportSize({ width: ancho, height: alto });
  await hoja.goto(URL, { waitUntil: 'load' });
  await hoja.waitForSelector('.dropzone', { timeout: 30_000 });
  return hoja;
};

// --- en una pantalla de ordenador ---
const m = await medirEn(await abrir(1280, 800));

check('el deber se pinta y ocupa sitio', m.deber.ancho > 100, `${Math.round(m.deber.ancho)}px`);
check(
  'el deber va encima del aviso y no se pisan',
  m.deber.abajo <= m.aviso.arriba,
  `deber ${Math.round(m.deber.arriba)}-${Math.round(m.deber.abajo)}, aviso ${Math.round(m.aviso.arriba)}-${Math.round(m.aviso.abajo)}`,
);
check('y los dos caben en la pantalla', m.deber.arriba >= 0, `${Math.round(m.deber.arriba)}px`);
check('el deber no se puede quitar: no lleva boton', m.botonesDelDeber === 0);
check(
  'no se confunde con una regla rota: otro color de borde',
  m.bordeDeber !== m.bordeAviso,
  `${m.bordeDeber} contra ${m.bordeAviso}`,
);
check(
  'su marca se lee: fondo y letra distintos',
  m.marcaFondo !== m.marcaLetra && m.marcaFondo !== 'rgba(0, 0, 0, 0)',
  `${m.marcaFondo} sobre ${m.marcaLetra}`,
);

// --- EL CASO QUE SE ROMPIA: pantalla de movil ---
// Ahi cada mensaje ocupa varias lineas y los dos juntos pasan de 300 pixeles de
// alto. Con cada cartel pegado al borde por su cuenta, el de abajo subia por
// encima del otro y lo tapaba.
const e = await medirEn(await abrir(390, 720));

check(
  'en pantalla de movil tampoco se pisan, con los dos textos a varias lineas',
  e.deber.abajo <= e.aviso.arriba && e.deber.alto > 60 && e.aviso.alto > 60,
  `deber ${Math.round(e.deber.arriba)}-${Math.round(e.deber.abajo)} (${Math.round(e.deber.alto)} alto), aviso ${Math.round(e.aviso.arriba)}-${Math.round(e.aviso.abajo)} (${Math.round(e.aviso.alto)} alto)`,
);
// Y aprovechan el ancho: con la columna anclada solo por el medio el ancho
// disponible era media pantalla, y los carteles salian como una tira estrecha
// de 390 pixeles de alto.
check(
  'y aprovechan el ancho de la pantalla, no la mitad',
  e.deber.ancho > 320,
  `${Math.round(e.deber.ancho)}px de 390`,
);
check(
  'y el de arriba no se sale por el techo',
  e.deber.arriba >= 0,
  `${Math.round(e.deber.arriba)}px de ${e.pantalla}`,
);

await navegador.close();
console.log(fallos === 0 ? '\nEL DEBER DEL CENTRO SE VE' : `\n${fallos} fallos.`);
process.exit(fallos === 0 ? 0 : 1);

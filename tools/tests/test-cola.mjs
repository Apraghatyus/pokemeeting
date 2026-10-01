// Prueba de la cola de aleatorizaciones.
//
// Es logica pura, asi que se prueba sin JVM y sin red: lo que hay que verificar
// no es que vaya rapido sino que no se pase del limite, y eso en una cola se
// rompe por carreras, no por lentitud.
//
// La carrera concreta que vigila esto: al soltar un hueco hay una tentacion de
// liberarlo y dejar que el siguiente lo pida, pero entre esas dos cosas hay un
// salto de microtarea, y una peticion que llegue justo ahi se cuela por encima
// del limite. Por eso el hueco se le pasa directamente al siguiente, y por eso
// la comprobacion importante de aqui es la de "nunca se pasa del limite".
//
// Uso: npx tsx tools/tests/test-cola.mjs
import { Abandonada, Cola, ColaLlena } from '../../apps/randomizer/src/cola.ts';

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const esperar = (ms) => new Promise((sigue) => setTimeout(sigue, ms));

// --- no se pasa del limite, ni con todas llegando de golpe ---
{
  const cola = new Cola(3, 100);
  let dentro = 0;
  let pico = 0;
  let hechas = 0;

  const trabajo = async () => {
    const soltar = await cola.turno(null);
    dentro += 1;
    pico = Math.max(pico, dentro);
    await esperar(20);
    dentro -= 1;
    hechas += 1;
    soltar();
  };

  await Promise.all(Array.from({ length: 30 }, trabajo));
  check('con 30 de golpe y limite 3, nunca hay mas de 3 dentro', pico === 3, `pico ${pico}`);
  check('y acaban las 30', hechas === 30, `${hechas}`);
  check('al terminar no queda nadie dentro', cola.estado().atendiendo === 0);
  check('ni nadie esperando', cola.estado().enCola === 0);
}

// --- se atiende por orden de llegada ---
{
  const cola = new Cola(1, 100);
  const orden = [];
  const primero = await cola.turno('a');

  const resto = [1, 2, 3].map(async (n) => {
    const soltar = await cola.turno(String(n));
    orden.push(n);
    soltar();
  });

  // Que los tres se pongan en cola antes de soltar al primero.
  await esperar(10);
  check('los que no caben esperan', cola.estado().enCola === 3, `${cola.estado().enCola}`);
  primero();
  await Promise.all(resto);
  check('se atiende por orden de llegada', orden.join(',') === '1,2,3', orden.join(','));
}

// --- se puede preguntar por donde va uno ---
{
  const cola = new Cola(1, 100);
  const ocupado = await cola.turno('trabajando');
  const esperas = ['uno', 'dos', 'tres'].map((t) => cola.turno(t).then((s) => s()));
  await esperar(10);

  check('el primero de la cola tiene a cero por delante', cola.puestoDe('uno')?.delante === 0,
    `${cola.puestoDe('uno')?.delante}`);
  check('el tercero tiene a dos por delante', cola.puestoDe('tres')?.delante === 2,
    `${cola.puestoDe('tres')?.delante}`);
  check('de quien no espera no se sabe nada', cola.puestoDe('trabajando') === null);
  check('ni de un ticket inventado', cola.puestoDe('nunca-existio') === null);

  ocupado();
  await Promise.all(esperas);

  // Solo despues de terminar alguna se puede estimar cuanto falta.
  const segundos = cola.estado().segundosPorCopia;
  check('al terminar alguna se sabe cuanto se tarda por copia',
    typeof segundos === 'number' && segundos >= 0, `${segundos} s`);
}

// --- con la cola llena se dice "ahora no" en vez de aceptar y mentir ---
{
  const cola = new Cola(1, 2);
  const ocupado = await cola.turno('trabajando');
  const dosQueCaben = [cola.turno('uno'), cola.turno('dos')];
  await esperar(10);

  let rechazada = null;
  try {
    await cola.turno('tres');
  } catch (error) {
    rechazada = error;
  }
  check('pasado el maximo se rechaza', rechazada instanceof ColaLlena,
    rechazada?.name ?? 'no fallo');

  ocupado();
  for (const t of dosQueCaben) (await t)();
}

// --- quien se va deja de ocupar sitio ---
{
  const cola = new Cola(1, 100);
  const ocupado = await cola.turno('trabajando');

  const seVa = new AbortController();
  const abandonada = cola.turno('se-va', seVa.signal).catch((e) => e);
  const sigueAhi = cola.turno('sigue').then((s) => ({ s }));
  await esperar(10);
  check('los dos esperan', cola.estado().enCola === 2, `${cola.estado().enCola}`);

  seVa.abort();
  const error = await abandonada;
  check('quien cierra la pestana sale de la cola', error instanceof Abandonada,
    error?.name ?? 'no fallo');
  check('y deja de contar', cola.estado().enCola === 1, `${cola.estado().enCola}`);

  ocupado();
  const { s } = await sigueAhi;
  check('el que seguia ahi recibe el turno', typeof s === 'function');
  s();
}

// --- no se cuela nadie en el hueco que queda al soltar ---
{
  // Esta es la carrera de verdad: se suelta un hueco y en ese mismo instante
  // llega una peticion nueva. Si el hueco se liberara en vez de cederse, aqui
  // habria dos dentro con limite 1.
  const cola = new Cola(1, 100);
  let dentro = 0;
  let pico = 0;

  const trabajo = async (t) => {
    const soltar = await cola.turno(t);
    dentro += 1;
    pico = Math.max(pico, dentro);
    await esperar(5);
    dentro -= 1;
    soltar();
  };

  const esperando = trabajo('primero');
  await esperar(1);
  const enCola = trabajo('estaba-esperando');
  // Esta llega justo cuando el primero esta soltando.
  await esperar(4);
  const justoEnElHueco = trabajo('llega-en-el-hueco');

  await Promise.all([esperando, enCola, justoEnElHueco]);
  check('nadie se cuela en el hueco al soltar', pico === 1, `pico ${pico}`);
}

// --- soltar dos veces no regala huecos ---
{
  const cola = new Cola(2, 100);
  const soltar = await cola.turno('doble');
  check('un turno cogido se cuenta', cola.estado().atendiendo === 1);
  soltar();
  soltar();
  soltar();
  check('soltar tres veces no baja de cero', cola.estado().atendiendo === 0,
    `${cola.estado().atendiendo}`);
}

console.log(fallos === 0 ? '\nLA COLA NO SE PASA DEL LIMITE' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

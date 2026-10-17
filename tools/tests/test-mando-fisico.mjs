// Comprueba la tabla de los mandos fisicos: que boton va a cual.
//
// La usan la web y la app de Android, y es facil de romper sin darse cuenta:
// cambiar un indice deja el mando "funcionando" con A y B cambiados, y eso solo
// se nota jugando. Logica pura: ni navegador ni mando.
//
// Uso: npx tsx tools/tests/test-mando-fisico.mjs
import { pathToFileURL } from 'node:url';

const {
  entradasDelMando,
  ZONA_MUERTA,
  asignarBoton,
  esAccion,
  ACCIONES,
  MAPA_POR_DEFECTO,
  primerBotonPulsado,
} = await import(pathToFileURL(`${process.cwd()}/apps/web/src/core/mandoFisico.ts`).href);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

/** Un mando del mapeo estandar con esos botones pulsados. */
const mando = (pulsados = [], axes = [0, 0, 0, 0], valores = {}) => ({
  buttons: Array.from({ length: 17 }, (_, i) => ({
    pressed: pulsados.includes(i),
    value: valores[i] ?? (pulsados.includes(i) ? 1 : 0),
  })),
  axes,
});
const ver = (m, mapa) => [...entradasDelMando(m, mapa)].sort().join(',');

check('sin tocar nada no hay nada', ver(mando()) === '');
check('el de la derecha es A', ver(mando([1])) === 'A', ver(mando([1])));
check('el de abajo es B', ver(mando([0])) === 'B', ver(mando([0])));
check('bumpers a L y R', ver(mando([4, 5])) === 'L,R');
// Los gatillos NO son de la consola: un GBA no los tiene. Se quedan para lo
// que el programa sabe hacer y el juego no, que es donde no le quitan el sitio
// a ningun boton.
check('los gatillos llevan las acciones', ver(mando([6, 7])) === 'Mapa,Turbo', ver(mando([6, 7])));
check(
  'un gatillo analogico a medias no cuenta',
  ver(mando([], [0, 0], { 6: 0.3 })) === '',
);
check('apretado si', ver(mando([], [0, 0], { 7: 0.9 })) === 'Mapa');
check('select y start', ver(mando([8, 9])) === 'Select,Start');
check('la cruceta', ver(mando([12, 15])) === 'Right,Up');
check('el stick hace de cruceta', ver(mando([], [-1, 0])) === 'Left');
check('con diagonales', ver(mando([], [0.8, 0.8])) === 'Down,Right');
check(
  'un stick gastado que no vuelve al centro no camina solo',
  ver(mando([], [ZONA_MUERTA - 0.1, -(ZONA_MUERTA - 0.1)])) === '',
);
check('un mando a medio leer no rompe nada', ver({ buttons: [], axes: [] }) === '');

// --- reasignar ---
const cambiado = asignarBoton(MAPA_POR_DEFECTO, 'B', 3);
check('reasignar pone el boton nuevo', ver(mando([3]), cambiado) === 'B', ver(mando([3]), cambiado));
check('y se lo quita a quien lo tenia', !cambiado.A.includes(3));
check('lo demas se queda igual', ver(mando([1, 9]), cambiado) === 'A,Start');
// --- las acciones ---
check('las acciones se distinguen de los botones', esAccion('Turbo') && esAccion('Mapa'));
check('y la A no es una accion', !esAccion('A'));
check('las dos tienen boton de fabrica',
  ACCIONES.every(({ accion }) => MAPA_POR_DEFECTO[accion].length > 0));
check(
  'ningun boton hace dos cosas a la vez',
  (() => {
    const vistos = new Set();
    for (const botones of Object.values(MAPA_POR_DEFECTO)) {
      for (const b of botones) {
        if (vistos.has(b)) return false;
        vistos.add(b);
      }
    }
    return true;
  })(),
);
// Y se reasignan igual que los botones, quitandoselo a quien lo tuviera.
const conTurboEnLB = asignarBoton(MAPA_POR_DEFECTO, 'Turbo', 4);
check('una accion se puede poner en un bumper', ver(mando([4]), conTurboEnLB) === 'Turbo');
check('y la L se queda sin ese boton', !conTurboEnLB.L.includes(4));
const conLEnGatillo = asignarBoton(MAPA_POR_DEFECTO, 'L', 6);
check('y al reves: un boton de la consola le quita el suyo a una accion',
  ver(mando([6]), conLEnGatillo) === 'L' && !conLEnGatillo.Turbo.includes(6));

check('aprender mira el primer boton pulsado', primerBotonPulsado(mando([7])) === 7);
check('sin pulsar nada no aprende nada', primerBotonPulsado(mando()) === null);

console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);

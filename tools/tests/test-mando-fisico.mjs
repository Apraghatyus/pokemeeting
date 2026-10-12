// Comprueba la tabla de los mandos fisicos: que boton va a cual.
//
// La usan la web y la app de Android, y es facil de romper sin darse cuenta:
// cambiar un indice deja el mando "funcionando" con A y B cambiados, y eso solo
// se nota jugando. Logica pura: ni navegador ni mando.
//
// Uso: npx tsx tools/tests/test-mando-fisico.mjs
import { pathToFileURL } from 'node:url';

const { entradasDelMando, ZONA_MUERTA } = await import(
  pathToFileURL(`${process.cwd()}/apps/web/src/core/mandoFisico.ts`).href
);

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
const ver = (m) => [...entradasDelMando(m)].sort().join(',');

check('sin tocar nada no hay nada', ver(mando()) === '');
check('el de la derecha es A', ver(mando([1])) === 'A', ver(mando([1])));
check('el de abajo es B', ver(mando([0])) === 'B', ver(mando([0])));
check('bumpers a L y R', ver(mando([4, 5])) === 'L,R');
check('y los gatillos tambien', ver(mando([6, 7])) === 'L,R');
check(
  'un gatillo analogico a medias no cuenta',
  ver(mando([], [0, 0], { 6: 0.3 })) === '',
);
check('apretado si', ver(mando([], [0, 0], { 7: 0.9 })) === 'R');
check('select y start', ver(mando([8, 9])) === 'Select,Start');
check('la cruceta', ver(mando([12, 15])) === 'Right,Up');
check('el stick hace de cruceta', ver(mando([], [-1, 0])) === 'Left');
check('con diagonales', ver(mando([], [0.8, 0.8])) === 'Down,Right');
check(
  'un stick gastado que no vuelve al centro no camina solo',
  ver(mando([], [ZONA_MUERTA - 0.1, -(ZONA_MUERTA - 0.1)])) === '',
);
check('un mando a medio leer no rompe nada', ver({ buttons: [], axes: [] }) === '');

console.log(fallos === 0 ? '\nTodo bien.' : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);

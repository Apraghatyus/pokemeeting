// El enlace que lleva directo a la sala.
//
// Dentro van tres cosas: el codigo, la contrasena y la semilla del mundo que
// juega quien invita. Las tres hacen falta para que el otro pueda entrar sin
// escribir nada y, sobre todo, para que entre AL MISMO MUNDO: antes habia que
// pasarse las credenciales y la semilla por separado, y eso acababa con los dos
// jugando mundos distintos sin entender por que.
//
// Lo que mas se prueba aqui es lo que NO debe dar por bueno. Un enlace a medias
// que abre un cartel de "te han invitado" y luego no deja entrar es peor que no
// reconocer nada.
//
// Uso: npx tsx tools/tests/test-invitacion.mjs
import { pathToFileURL } from 'node:url';

// El modulo lee `location`, que en Node no existe. Se le pone una antes de
// cargarlo, que es justo lo que hay que probar: el enlace se arma sobre la
// direccion de esta pagina, no sobre una escrita a mano en el codigo.
globalThis.location = {
  origin: 'https://pokemeeting.example',
  pathname: '/',
  search: '',
  hash: '',
  hostname: 'pokemeeting.example',
};
let reemplazada = null;
globalThis.history = { replaceState: (_a, _b, url) => { reemplazada = url; } };

const base = `${process.cwd()}/apps/web/src/core`;
const { enlaceDeInvitacion, leerInvitacion, olvidarInvitacion, textoDeInvitacion, direccionCompartible } =
  await import(pathToFileURL(`${base}/invitacion.ts`).href);
const { codificarSemilla } = await import(pathToFileURL(`${base}/semilla.ts`).href);

let fallos = 0;
const check = (nombre, ok, detalle = '') => {
  console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? '  -> ' + detalle : ''}`);
  if (!ok) fallos += 1;
};

const SEMILLA = {
  baseCrc32: 'dd88761c',
  crc32: '0a1b2c3d',
  semilla: '123456789',
  // Los ajustes del randomizer son base64, con sus `+`, `/` y `=`: si no se
  // escapan al meterlos en la direccion, lo que vuelve no es lo que se mando.
  ajustes: 'AB+c/d==',
};

const inv = { sala: 'ABC123', clave: 'un secreto', semilla: SEMILLA };
const enlace = enlaceDeInvitacion(inv);
/** Lo que leeria el navegador: `leerInvitacion` mira el fragmento, no la URL. */
const soloElFragmentoDe = (url) => url.slice(url.indexOf('#'));

// --- lo que lleva el enlace ---
check('el enlace sale de la direccion de esta pagina',
  enlace.startsWith('https://pokemeeting.example/#'), enlace);

// Lo que va detras de `#` no se manda al servidor. Con `?` la contrasena de la
// sala quedaria escrita en el registro de accesos de cada maquina por la que
// pase la peticion.
check('y va en el fragmento, que no sale del navegador',
  !enlace.slice(0, enlace.indexOf('#')).includes('?') && enlace.includes('#'), enlace);

check('la contrasena no viaja en claro dentro de la direccion',
  !enlace.includes('un secreto'), enlace);

// --- y vuelve igual ---
const vuelta = leerInvitacion(soloElFragmentoDe(enlace));
check('se reconoce la invitacion', vuelta !== null);
check('con su sala', vuelta?.sala === 'ABC123', vuelta?.sala);
check('con su contrasena, espacio incluido', vuelta?.clave === 'un secreto', vuelta?.clave);
check('y con la semilla entera, sin perder un solo caracter',
  vuelta?.semilla && codificarSemilla(vuelta.semilla) === codificarSemilla(SEMILLA),
  vuelta?.semilla ? codificarSemilla(vuelta.semilla) : 'ninguna');

// Un codigo de sala se dicta en mayusculas y se teclea como sea.
const enMinusculas = leerInvitacion('#sala=abc123&clave=x');
check('un codigo en minusculas se entiende igual',
  enMinusculas?.sala === 'ABC123', enMinusculas?.sala);

// --- quien juega sin aleatorizar ---
const sinSemilla = leerInvitacion(
  soloElFragmentoDe(enlaceDeInvitacion({ sala: 'ZZZ999', clave: 'x', semilla: null })),
);
check('sin semilla el enlace sigue valiendo para entrar',
  sinSemilla?.sala === 'ZZZ999' && sinSemilla?.semilla === null,
  JSON.stringify(sinSemilla));

// --- lo que NO se da por bueno ---
check('sin nada en la direccion no hay invitacion', leerInvitacion('') === null);
check('ni con un fragmento que no es una invitacion', leerInvitacion('#hola') === null);
// Un enlace a medias no es una invitacion incompleta: es ninguna. Enseñar el
// cartel y luego no poder entrar es peor que no enseñarlo.
check('el codigo sin contrasena no vale', leerInvitacion('#sala=ABC123') === null);
check('la contrasena sin codigo tampoco', leerInvitacion('#clave=x') === null);
check('ni una contrasena vacia', leerInvitacion('#sala=ABC123&clave=') === null);
check('ni un codigo que no tiene seis caracteres',
  leerInvitacion('#sala=ABC12&clave=x') === null);
check('ni uno con caracteres que no existen en un codigo',
  leerInvitacion('#sala=ABC-23&clave=x') === null);

// Una semilla ilegible SI deja pasar: el codigo y la contrasena siguen
// sirviendo para entrar en la sala, y es mejor entrar y avisar de que no se pudo
// rehacer el mundo que quedarse fuera.
const semillaRota = leerInvitacion('#sala=ABC123&clave=x&semilla=esto-no-es-una-semilla');
check('una semilla ilegible no tira la invitacion, solo se queda sin mundo',
  semillaRota !== null && semillaRota.semilla === null, JSON.stringify(semillaRota));

// --- el mensaje que se pasa por el chat ---
const mensaje = textoDeInvitacion(inv);
const primeraLinea = mensaje.split('\n')[0];
check('el mensaje empieza por el enlace, que es lo unico que hay que pulsar',
  primeraLinea.startsWith('Juega conmigo: https://'), primeraLinea);
// No es redundancia: un enlace puede llegar cortado por el chat, y quien lo
// recibe puede tener ya la pagina abierta y solo necesitar teclearlos.
check('y lleva ademas el codigo y la contrasena escritos',
  mensaje.includes('Sala: ABC123') && mensaje.includes('Contrasena: un secreto'));
check('y avisa de que hace falta su propia copia del juego',
  /tu propia copia del juego/.test(mensaje));
// La frontera de siempre: por aqui no se reparten juegos.
check('el mensaje no lleva nada del juego, solo como rehacerlo',
  mensaje.includes('EMUPOKE1'), 'solo la semilla');

// En localhost el enlace no sirve de nada: apunta al ordenador de quien copia,
// no al de su amigo. Entonces se manda solo lo que se puede teclear.
check('localhost no se comparte', direccionCompartible('localhost') === false);
check('ni 127.0.0.1', direccionCompartible('127.0.0.1') === false);
check('y un dominio de verdad si', direccionCompartible('pokemeeting.example') === true);

const antes = globalThis.location.hostname;
globalThis.location.hostname = 'localhost';
const enLocal = textoDeInvitacion(inv);
check('en localhost no se manda un enlace que no vale',
  !enLocal.includes('http'), enLocal.split('\n').join(' | '));
check('pero si el codigo y la contrasena, que si valen',
  enLocal.includes('Sala: ABC123') && enLocal.includes('Contrasena: un secreto'));
globalThis.location.hostname = antes;

// --- y se borra de la barra de direcciones ---
//
// Ahi dentro va la contrasena de la sala: queda a la vista de quien pase por
// detras y en el historial del navegador.
globalThis.location.hash = '#sala=ABC123&clave=x';
olvidarInvitacion();
check('la invitacion se quita de la direccion',
  reemplazada === 'https://pokemeeting.example/', String(reemplazada));
check('y no deja una entrada nueva en el historial, para que atras no la devuelva',
  typeof globalThis.history.pushState === 'undefined');

console.log(
  fallos === 0 ? '\nEL ENLACE LLEVA LA SALA Y EL MUNDO, NO EL JUEGO' : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

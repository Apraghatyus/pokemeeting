// Las cuentas, de punta a punta.
//
// Contra el servicio de verdad y su base de datos de verdad. No hay dobles:
// lo que se quiere comprobar es justamente lo que pasa cuando algo se escribe
// en PostgreSQL y se vuelve a leer, y eso con un simulacro no se prueba.
//
// Hace falta el servicio levantado con DATABASE_URL puesta:
//
//   DATABASE_URL=postgres://... npm run dev:cuentas
//   npm run test:cuentas
//
// Lo que mas importa de aqui son tres cosas, y ninguna es "se puede entrar":
//
//   1. Que no se puede entrar cuando no se debe, y que al fallar NO se dice si
//      el usuario existe.
//   2. Que subir dos veces lo mismo no duplica nada. Es lo que permite entrar
//      desde el movil y desde el portatil sin acabar con el historial doble.
//   3. Que lo que sube son numeros y motes. Si algun dia alguien mete ahi un
//      byte de una ROM, esta prueba tiene que ponerse roja.

const RAIZ = process.env.CUENTAS_URL ?? 'http://127.0.0.1:8789';

let fallos = 0;
const check = (que, bien, detalle = '') => {
  console.log(`${bien ? 'OK  ' : 'MAL '}  ${que}${detalle ? `  -> ${detalle}` : ''}`);
  if (!bien) fallos += 1;
};

/** La galleta de sesion, que aqui hay que llevar a mano. */
let galleta = null;

const pedir = async (ruta, opciones = {}) => {
  const respuesta = await fetch(`${RAIZ}${ruta}`, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      ...(opciones.sinCabecera ? {} : { 'X-Emupoke': '1' }),
      ...(galleta ? { Cookie: galleta } : {}),
      ...opciones.headers,
    },
  });

  const puesta = respuesta.headers.getSetCookie?.() ?? [];
  for (const linea of puesta) {
    const [par] = linea.split(';');
    if (par?.startsWith('emupoke_sesion=')) {
      galleta = par.endsWith('=') ? null : par;
    }
  }

  const cuerpo = await respuesta.json().catch(() => ({}));
  return { estado: respuesta.status, cuerpo };
};

// Un nombre distinto en cada pasada: la base es de verdad y las cuentas de la
// vez anterior siguen ahi.
const USUARIO = `probador${Date.now().toString(36)}`;
const CLAVE = 'una-contrasena-larga';

// --- que este vivo ------------------------------------------------------
const salud = await pedir('/health');
if (salud.estado !== 200) {
  console.error(
    `\nEl servicio de cuentas no responde en ${RAIZ}.\n\n` +
      '  DATABASE_URL=postgres://... npm run dev:cuentas\n',
  );
  process.exit(1);
}
check('el servicio responde y llega a su base', salud.cuerpo.ok === true);

// --- lo que no se admite ------------------------------------------------
const corto = await pedir('/registro', {
  method: 'POST',
  body: JSON.stringify({ usuario: 'ab', clave: CLAVE }),
});
check('un usuario de dos letras no vale', corto.estado === 400, corto.cuerpo.error);

const claveCorta = await pedir('/registro', {
  method: 'POST',
  body: JSON.stringify({ usuario: USUARIO, clave: '1234' }),
});
check('una contrasena corta no vale', claveCorta.estado === 400, claveCorta.cuerpo.error);

const conEspacios = await pedir('/registro', {
  method: 'POST',
  body: JSON.stringify({ usuario: 'con espacios', clave: CLAVE }),
});
check('un usuario con espacios no vale', conEspacios.estado === 400, conEspacios.cuerpo.error);

// Sin la cabecera que solo puede poner la propia pagina. Un formulario de otro
// sitio llega hasta aqui, y aqui es donde se para.
const sinCabecera = await pedir('/entrar', {
  method: 'POST',
  sinCabecera: true,
  body: JSON.stringify({ usuario: USUARIO, clave: CLAVE }),
});
check('una peticion de fuera de la pagina se rechaza', sinCabecera.estado === 403);

// --- crear la cuenta ----------------------------------------------------
const alta = await pedir('/registro', {
  method: 'POST',
  body: JSON.stringify({ usuario: USUARIO, clave: CLAVE, apodo: 'El Probador' }),
});
check('se crea la cuenta', alta.estado === 201, JSON.stringify(alta.cuerpo).slice(0, 80));
check('y queda la sesion abierta', galleta !== null);
check('con el apodo que se pidio', alta.cuerpo.cuenta?.apodo === 'El Probador');

const yo = await pedir('/yo');
check('y el servidor sabe quien soy', yo.cuerpo.cuenta?.usuario === USUARIO, yo.cuerpo.cuenta?.usuario);

// El mismo nombre en mayusculas es la misma persona: si no, dos cuentas
// distintas se verian iguales en el ranking.
const repetido = await pedir('/registro', {
  method: 'POST',
  body: JSON.stringify({ usuario: USUARIO.toUpperCase(), clave: CLAVE }),
});
check('el mismo usuario en mayusculas ya esta cogido', repetido.estado === 409, repetido.cuerpo.error);

// --- subir lo de este navegador ----------------------------------------
const PARTIDA = {
  fichero: 'Pokemon - Edicion Rojo Fuego (Spain)-aleatoria-prueba.gba',
  nombre: 'La de prueba',
  juego: 'Rojo Fuego',
  generacion: 3,
  baseCrc32: 'aabbccdd',
  crc32: '11223344',
  semilla: `prueba-${USUARIO}`,
  ajustes: '320NDgAAAA...',
  cambiado: ['Pokemon iniciales'],
  creada: Date.now() - 86_400_000,
  jugada: Date.now(),
};

const FINAL = {
  id: `${PARTIDA.fichero}:derrota:propio`,
  partida: PARTIDA.fichero,
  cuando: Date.now(),
  resultado: 'derrota',
  porElEnlace: false,
  medallas: 3,
  equipo: [
    { especie: 25, mote: 'CHISPA', nivel: 34, movimientos: [45, 129, 272, 0], caido: true },
    { especie: 6, mote: 'MEH', nivel: 36, movimientos: [52, 89, 263, 181], caido: false },
  ],
};

const subida = await pedir('/subir', {
  method: 'POST',
  body: JSON.stringify({ partidas: [PARTIDA], finales: [FINAL] }),
});
check('se sube la partida guardada', subida.cuerpo.partidas?.nuevas === 1, JSON.stringify(subida.cuerpo));
check('y la partida terminada', subida.cuerpo.finales?.nuevos === 1);

// LO QUE DE VERDAD SE VINO A PROBAR: repetirlo no duplica. Entrar desde dos
// aparatos sube dos veces lo mismo, y tiene que quedar como si fuera una.
const otraVez = await pedir('/subir', {
  method: 'POST',
  body: JSON.stringify({ partidas: [PARTIDA], finales: [FINAL] }),
});
check(
  'subirlo otra vez no crea una partida nueva',
  otraVez.cuerpo.partidas?.nuevas === 0 && otraVez.cuerpo.partidas?.actualizadas === 1,
  JSON.stringify(otraVez.cuerpo.partidas),
);
check(
  'ni apunta el final dos veces',
  otraVez.cuerpo.finales?.nuevos === 0 && otraVez.cuerpo.finales?.repetidos === 1,
  JSON.stringify(otraVez.cuerpo.finales),
);

// Una partida descartada: la que se borro antes de ganar o perder. No cuenta
// para el porcentaje, pero se cuenta.
const descartada = await pedir('/subir', {
  method: 'POST',
  body: JSON.stringify({
    partidas: [],
    finales: [{ ...FINAL, id: `${PARTIDA.fichero}:descartada`, resultado: 'descartada', equipo: [] }],
  }),
});
check('una partida descartada tambien se apunta', descartada.cuerpo.finales?.nuevos === 1);

// Y un resultado inventado no entra: la columna tiene su lista cerrada.
const inventado = await pedir('/subir', {
  method: 'POST',
  body: JSON.stringify({
    partidas: [],
    finales: [{ ...FINAL, id: `${PARTIDA.fichero}:loquesea`, resultado: 'loquesea' }],
  }),
});
check('un resultado que no existe se descarta', inventado.cuerpo.finales?.nuevos === 0);

// --- salir y volver -----------------------------------------------------
await pedir('/salir', { method: 'POST' });
const fuera = await pedir('/yo');
check('al salir ya no hay sesion', fuera.cuerpo.cuenta === null);

const malaClave = await pedir('/entrar', {
  method: 'POST',
  body: JSON.stringify({ usuario: USUARIO, clave: 'no-es-esta-ni-de-lejos' }),
});
check('con la contrasena mal no se entra', malaClave.estado === 401);

const noExiste = await pedir('/entrar', {
  method: 'POST',
  body: JSON.stringify({ usuario: `nadie${Date.now()}`, clave: 'no-es-esta-ni-de-lejos' }),
});
// Lo importante no es que falle, es que falle IGUAL: si el mensaje fuera
// distinto, probar usuarios diria cuales existen.
check(
  'y un usuario que no existe falla exactamente igual',
  noExiste.estado === malaClave.estado && noExiste.cuerpo.error === malaClave.cuerpo.error,
  noExiste.cuerpo.error,
);

// --- el limite de intentos ---------------------------------------------
//
// Lo que se comprueba no es que exista un limite: es DE QUE depende. El cupo
// por direccion solo sirve si el proxy de delante esta bien configurado, y si
// no lo esta, todo el mundo llega con la misma direccion. Por eso el que lleva
// el peso es el de la cuenta, que no se puede estropear configurando mal nada.
const VICTIMA = `victima${Date.now().toString(36)}`;
await pedir('/registro', {
  method: 'POST',
  body: JSON.stringify({ usuario: VICTIMA, clave: CLAVE }),
});
galleta = null;

let cortado = 0;
for (let i = 0; i < 12; i += 1) {
  const r = await pedir('/entrar', {
    method: 'POST',
    body: JSON.stringify({ usuario: VICTIMA, clave: `intento-numero-${i}` }),
  });
  if (r.estado === 429) cortado = cortado || i + 1;
}
check('probar contrasenas contra una cuenta se corta', cortado > 0 && cortado <= 11, `al intento ${cortado}`);

// Y LO QUE DE VERDAD IMPORTA: que cortar a esa cuenta no deja fuera a nadie
// mas. Con un unico cupo por direccion -y un proxy mal configurado- esto
// seria que una persona equivocandose cierra la puerta a todas las demas.
const otraPersona = await pedir('/entrar', {
  method: 'POST',
  body: JSON.stringify({ usuario: USUARIO, clave: CLAVE }),
});
check(
  'pero no deja fuera a los demas, que es lo que pasaria con un cupo comun',
  otraPersona.estado === 200,
  `${otraPersona.estado}`,
);
galleta = null;

const vuelta = await pedir('/entrar', {
  method: 'POST',
  body: JSON.stringify({ usuario: USUARIO.toUpperCase(), clave: CLAVE }),
});
check('con la contrasena bien se vuelve a entrar', vuelta.estado === 200);
check('y se entra escribiendo el usuario como sea', vuelta.cuerpo.cuenta?.usuario === USUARIO);

console.log(
  fallos === 0 ? '\nLAS CUENTAS FUNCIONAN' : `\n${fallos} COMPROBACIONES FALLIDAS`,
);
process.exit(fallos === 0 ? 0 : 1);

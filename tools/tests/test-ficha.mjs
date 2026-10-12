// La ficha de entrenador: perfil, foto, contraseña y amigos.
//
// Contra el servicio de verdad y su base de datos. Lo que mas se comprueba
// aqui no es que funcione, sino las reglas que lo hacen util:
//
//   - El TAG existe para que el apodo NO tenga que ser unico. Dos personas
//     pueden llamarse igual y distinguirse, y eso se prueba creando dos.
//   - Cambiar la contraseña EXIGE la de ahora, aunque ya haya sesion abierta.
//     Una pestaña olvidada en un ordenador ajeno no puede servir para quedarse
//     con la cuenta.
//   - Y al cambiarla se cierran las demas sesiones, que es justo para lo que
//     se cambia una contraseña.
//   - Una amistad es UNA fila, no dos: no puede existir a medias.
//
// Uso: node tools/tests/test-ficha.mjs
const RAIZ = process.env.CUENTAS_URL ?? 'http://127.0.0.1:8789';

let fallos = 0;
const check = (que, bien, detalle = '') => {
  console.log(`${bien ? 'OK  ' : 'MAL '}  ${que}${detalle ? `  -> ${detalle}` : ''}`);
  if (!bien) fallos += 1;
};

/** Un navegador de mentira: guarda su galleta y la manda. */
const sesion = () => {
  let galleta = null;
  return async (ruta, opciones = {}) => {
    const r = await fetch(`${RAIZ}${ruta}`, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        'X-Emupoke': '1',
        ...(galleta ? { Cookie: galleta } : {}),
      },
    });
    for (const linea of r.headers.getSetCookie?.() ?? []) {
      const [par] = linea.split(';');
      if (par?.startsWith('emupoke_sesion=')) galleta = par.endsWith('=') ? null : par;
    }
    const cuerpo = await r.json().catch(() => ({}));
    return { estado: r.status, cuerpo };
  };
};

const sello = Date.now().toString(36);
const CLAVE = 'una-contrasena-larga';

const salud = await fetch(`${RAIZ}/health`).catch(() => null);
if (!salud?.ok) {
  console.error(`\nEl servicio de cuentas no responde en ${RAIZ}.\n`);
  process.exit(1);
}

// --- dos personas con el MISMO apodo ------------------------------------
const APODO = `Gemelo ${sello.slice(-4)}`;
const ana = sesion();
const beto = sesion();

const altaAna = await ana('/registro', {
  method: 'POST',
  body: JSON.stringify({ usuario: `ana${sello}`, clave: CLAVE, apodo: APODO }),
});
const altaBeto = await beto('/registro', {
  method: 'POST',
  body: JSON.stringify({ usuario: `beto${sello}`, clave: CLAVE, apodo: APODO }),
});

check('se crean dos cuentas con el mismo apodo',
  altaAna.estado === 201 && altaBeto.estado === 201,
  `${altaAna.estado} y ${altaBeto.estado}`);

const tagAna = altaAna.cuerpo.cuenta?.tag;
const tagBeto = altaBeto.cuerpo.cuenta?.tag;
check('cada una recibe su tag de cuatro cifras',
  /^\d{4}$/.test(tagAna ?? '') && /^\d{4}$/.test(tagBeto ?? ''), `${tagAna} y ${tagBeto}`);
// ESTO es para lo que existe el tag: el apodo no tiene por que ser unico.
check('y son distintos, que es para lo que sirve', tagAna !== tagBeto);

// --- la ficha -----------------------------------------------------------
const perfil = await ana('/perfil');
check('la ficha trae el apodo y el tag',
  perfil.cuerpo.perfil?.apodo === APODO && perfil.cuerpo.perfil?.tag === tagAna);
check('y las cifras, aunque esten a cero',
  perfil.cuerpo.perfil?.partidas === 0 && perfil.cuerpo.perfil?.victorias === 0);
check('sin porcentaje, que con cero partidas no significa nada',
  perfil.cuerpo.perfil?.porcentaje === null);

const guardado = await ana('/perfil', {
  method: 'POST',
  body: JSON.stringify({ lema: 'Una ruta mas. Un intento mas.', favorito: 94 }),
});
check('se puede poner lema y Pokemon favorito',
  guardado.cuerpo.perfil?.lema === 'Una ruta mas. Un intento mas.' &&
    guardado.cuerpo.perfil?.favorito === 94,
  JSON.stringify({ lema: guardado.cuerpo.perfil?.lema, favorito: guardado.cuerpo.perfil?.favorito }));

// Un numero de especie que no existe no se guarda: lo que entra en la base
// tiene que poder enseñarse.
const inventado = await ana('/perfil', { method: 'POST', body: JSON.stringify({ favorito: 9999 }) });
check('un favorito que no existe no se guarda', inventado.cuerpo.perfil?.favorito === null);

// --- la foto ------------------------------------------------------------
// Un PNG de un pixel, que es lo mas pequeño que se puede mandar de verdad.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const foto = await ana('/avatar', { method: 'POST', body: JSON.stringify({ imagen: PNG }) });
check('se sube la foto de perfil', foto.estado === 200, JSON.stringify(foto.cuerpo));

const bajada = await fetch(`${RAIZ}/avatar/${encodeURIComponent(`${APODO}#${tagAna}`)}`);
check('y se puede volver a pedir', bajada.ok && bajada.headers.get('content-type') === 'image/png',
  `${bajada.status} ${bajada.headers.get('content-type')}`);

const noFoto = await ana('/avatar', { method: 'POST', body: JSON.stringify({ imagen: 'hola' }) });
check('lo que no es una imagen se rechaza', noFoto.estado === 400);

// --- amigos -------------------------------------------------------------
const aNadie = await ana('/amigos/solicitar', {
  method: 'POST',
  body: JSON.stringify({ apodo: 'NoExisteNadieAsi', tag: '0000' }),
});
check('no se puede añadir a quien no existe', aNadie.estado === 409, aNadie.cuerpo.error);

const aMiMismo = await ana('/amigos/solicitar', {
  method: 'POST',
  body: JSON.stringify({ apodo: APODO, tag: tagAna }),
});
check('ni a uno mismo', aMiMismo.estado === 409, aMiMismo.cuerpo.error);

const pedir = await ana('/amigos/solicitar', {
  method: 'POST',
  body: JSON.stringify({ apodo: APODO, tag: tagBeto }),
});
check('se manda la solicitud', pedir.estado === 200, JSON.stringify(pedir.cuerpo.amigos ?? []));

const deBeto = await beto('/amigos');
check('le llega a quien va dirigida', deBeto.cuerpo.solicitudes?.length === 1,
  `${deBeto.cuerpo.solicitudes?.length} solicitudes`);
check('diciendo de quien es',
  deBeto.cuerpo.solicitudes?.[0]?.tag === tagAna, deBeto.cuerpo.solicitudes?.[0]?.tag);

// Lo que NO puede pasar: que el que la manda ya la tenga por amiga.
const deAna = await ana('/amigos');
check('pero no son amigos hasta que se acepte', (deAna.cuerpo.amigos ?? []).length === 0);

const aceptada = await beto('/amigos/responder', {
  method: 'POST',
  body: JSON.stringify({ id: deBeto.cuerpo.solicitudes[0].id, aceptar: true }),
});
check('al aceptar, son amigos', (aceptada.cuerpo.amigos ?? []).length === 1);

// Y LO QUE DE VERDAD IMPORTA DE COMO ESTA GUARDADO: una amistad es una sola
// fila, asi que no puede existir a medias. Si A tiene a B, B tiene a A.
const anaDespues = await ana('/amigos');
check('y lo son por los dos lados, no por uno',
  (anaDespues.cuerpo.amigos ?? []).length === 1 &&
    anaDespues.cuerpo.amigos[0].tag === tagBeto,
  JSON.stringify(anaDespues.cuerpo.amigos));

// --- presencia ----------------------------------------------------------
check('un amigo que no ha dado señales sale como desconectado',
  anaDespues.cuerpo.amigos[0].estado === 'desconectado',
  anaDespues.cuerpo.amigos[0].estado);

await beto('/presencia', { method: 'POST', body: JSON.stringify({ juego: null }) });
const conBeto = await ana('/amigos');
check('al dar señales, disponible', conBeto.cuerpo.amigos[0].estado === 'disponible',
  conBeto.cuerpo.amigos[0].estado);

await beto('/presencia', { method: 'POST', body: JSON.stringify({ juego: 'Rojo Fuego' }) });
const jugando = await ana('/amigos');
check('y jugando, en partida con el juego puesto',
  jugando.cuerpo.amigos[0].estado === 'en-partida' &&
    jugando.cuerpo.amigos[0].juego === 'Rojo Fuego',
  `${jugando.cuerpo.amigos[0].estado} / ${jugando.cuerpo.amigos[0].juego}`);

// --- la contraseña ------------------------------------------------------
const sinLaVieja = await ana('/clave', {
  method: 'POST',
  body: JSON.stringify({ actual: 'me-la-invento', nueva: 'otra-contrasena-larga' }),
});
// Con sesion abierta ya, y aun asi se pide la de ahora: una pestaña olvidada
// en un ordenador ajeno no puede servir para quedarse con la cuenta.
check('cambiar la contraseña exige la de ahora', sinLaVieja.estado === 401, sinLaVieja.cuerpo.error);

const corta = await ana('/clave', {
  method: 'POST',
  body: JSON.stringify({ actual: CLAVE, nueva: '123' }),
});
check('y la nueva tiene que valer', corta.estado === 400, corta.cuerpo.error);

// Una segunda sesion de Ana, para comprobar que se cierra al cambiarla.
const otraDeAna = sesion();
await otraDeAna('/entrar', {
  method: 'POST',
  body: JSON.stringify({ usuario: `ana${sello}`, clave: CLAVE }),
});
check('Ana tiene dos sesiones abiertas',
  (await otraDeAna('/yo')).cuerpo.cuenta?.tag === tagAna);

const NUEVA = 'otra-contrasena-mas-larga';
const cambiada = await ana('/clave', {
  method: 'POST',
  body: JSON.stringify({ actual: CLAVE, nueva: NUEVA }),
});
check('con la de ahora si se cambia', cambiada.estado === 200, JSON.stringify(cambiada.cuerpo));

// LO QUE SE CAMBIA UNA CONTRASEÑA PARA CONSEGUIR: echar a quien estuviera
// dentro. Si las otras sesiones siguieran abiertas, no serviria de nada.
check('y las demas sesiones se cierran',
  (await otraDeAna('/yo')).cuerpo.cuenta === null);
check('pero la tuya sigue abierta', (await ana('/yo')).cuerpo.cuenta?.tag === tagAna);

const conLaVieja = await sesion()('/entrar', {
  method: 'POST',
  body: JSON.stringify({ usuario: `ana${sello}`, clave: CLAVE }),
});
check('la contraseña vieja ya no entra', conLaVieja.estado === 401);
const conLaNueva = await sesion()('/entrar', {
  method: 'POST',
  body: JSON.stringify({ usuario: `ana${sello}`, clave: NUEVA }),
});
check('y la nueva si', conLaNueva.estado === 200);

// --- quitar un amigo ----------------------------------------------------
const quitado = await ana('/amigos/quitar', {
  method: 'POST',
  body: JSON.stringify({ apodo: APODO, tag: tagBeto }),
});
check('se puede dejar de ser amigo', (quitado.cuerpo.amigos ?? []).length === 0);
check('y se va por los dos lados', ((await beto('/amigos')).cuerpo.amigos ?? []).length === 0);

console.log(fallos === 0 ? '\nLA FICHA DE ENTRENADOR FUNCIONA' : `\n${fallos} COMPROBACIONES FALLIDAS`);
process.exit(fallos === 0 ? 0 : 1);

// Abrir sesion dentro de una prueba.
//
// Hace falta desde que las partidas guardadas son de quien inicia sesion: sin
// cuenta se puede aleatorizar y jugar, pero la copia no entra en la lista. Una
// prueba que aleatoriza y luego busca su partida necesita, por tanto, una
// cuenta.
//
// Se crea una nueva cada vez, con el reloj en el nombre: asi dos pasadas no se
// pisan y no hace falta limpiar nada entre una y otra.

/**
 * Crea una cuenta y deja la sesion abierta en esa pagina.
 *
 * Devuelve el usuario, o null si no hay servicio de cuentas levantado. Null no
 * es un fallo de la prueba que llama: significa "aqui no hay cuentas", y cada
 * prueba decide si puede seguir sin ellas.
 */
export const entrarConCuentaNueva = async (page, prefijo = 'prueba') => {
  const usuario = `${prefijo}${Date.now().toString(36)}`;

  const hecho = await page.evaluate(
    async ({ usuario }) => {
      try {
        const salud = await fetch('/cuentas/health');
        if (!salud.ok) return null;
      } catch {
        return null;
      }

      const r = await fetch('/cuentas/registro', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Emupoke': '1' },
        body: JSON.stringify({ usuario, clave: 'una-contrasena-larga', apodo: usuario }),
      });
      return r.ok;
    },
    { usuario },
  );

  if (hecho === null) return null;
  if (!hecho) throw new Error(`No se pudo crear la cuenta de prueba ${usuario}`);

  // La sesion la lee la aplicacion al arrancar, asi que hay que recargar para
  // que se entere: la galleta se puso despues de pintar la pagina.
  await page.reload({ waitUntil: 'load' });
  return usuario;
};

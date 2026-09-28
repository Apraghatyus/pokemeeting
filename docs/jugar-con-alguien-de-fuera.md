# Abrir la partida a alguien de fuera

Para probar con otra persona por internet hace falta un enlace publico y
temporal. El servidor de desarrollo no vale tal cual, por dos motivos que
conviene entender antes de pelearse con ellos.

## Por que no basta con dar tu IP

**Hace falta HTTPS.** mGBA necesita `SharedArrayBuffer`, que el navegador solo
concede en contexto seguro. `localhost` cuenta; una IP por HTTP no. El
emulador ni siquiera arrancaria.

**Vite rechaza hosts desconocidos.** Responde `403 Blocked request` a cualquier
peticion cuyo `Host` no reconozca. Un tunel llega con su propio dominio, asi
que sin permitirlo no se entra.

## Como se hace

Arranca la web en modo tunel, que resuelve lo segundo:

    npm run dev:signaling      (en una terminal)
    npm run dev:tunnel         (en otra)

Y abre el tunel, que resuelve lo primero:

    cloudflared tunnel --url http://localhost:5173

Da una direccion `https://algo-aleatorio.trycloudflare.com` que puedes pasarle
a tu companero. Muere cuando paras el proceso.

Si no tienes cloudflared: `winget install cloudflare.cloudflared`.

### Alternativa: Tailscale Funnel

Si ya usas Tailscale, `tailscale funnel 5173` expone la misma web en
`https://<tu-maquina>.<tu-tailnet>.ts.net` con certificado de verdad, sin
dominio aleatorio. Hay que habilitar HTTPS y Funnel una vez en la consola de
administracion.

## La aleatorizacion tambien funciona por el enlace

Quien entra manda su **propia** ROM y la recibe de vuelta. Eso es procesar su
fichero, no distribuirlo, asi que se permite.

Lo que si cambia es el mensaje. En local la interfaz dice "la ROM no sale de
aqui", y es verdad. Entrando por un enlace compartido eso seria mentira, asi
que se le dice lo que pasa de verdad:

> Para aleatorizar, tu ROM se enviara al ordenador de quien abrio esta
> partida, donde se procesa y se borra al terminar. Si prefieres que no salga
> de tu equipo, juega tal cual.

El cliente sabe cual de los dos mensajes toca mirando de donde viene la pagina:
si la sirve `localhost`, el servicio esta en la misma maquina.

Si prefieres no aceptar ficheros de nadie, arranca con la variable
`RANDOMIZER_LOCAL_ONLY=1` y solo se atendera a quien entre por localhost.

### Cuanto tarda

Una ROM son 16 MB de ida y otros 16 de vuelta, y la vuelta gasta la subida de
**tu** conexion, que suele ser lo mas escaso. Por eso el fichero viaja
comprimido en ambos sentidos: una ROM de GBA baja a algo mas de 5 MB, y
comprimir cuesta medio segundo.

La diferencia medida sobre un tunel real con una subida de unos 64 KB/s: sin
comprimir se agotaban cinco minutos sin terminar; comprimido, **77 segundos**.

## Advertencia

Un tunel rapido es **publico**: cualquiera con el enlace entra. El codigo es
aleatorio y dura poco, pero no lo dejes abierto mas de lo necesario ni lo
publiques en ningun sitio.

Las salas siguen pidiendo contrasena, asi que nadie se mete en tu partida sin
ella, pero el emulador queda accesible.

## Comprobado

La partida compartida completa se verifico a traves de un tunel real de
Cloudflare: el emulador arranca (las cabeceras COOP/COEP sobreviven al paso por
el tunel), la sala se crea, la senalizacion viaja por el WebSocket del mismo
origen y el video llega en ambos sentidos.

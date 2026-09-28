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

## Que cambia en modo tunel

La aleatorizacion **deja de alcanzarse desde fuera**, pero tu la conservas.

Ese servicio corre en *tu* maquina. A traves del tunel, la ROM de la otra
persona viajaria hasta tu ordenador para aleatorizarse y volver. No seria
ilegal, porque es su propio fichero y vuelve a ella, pero la interfaz le dice
"la ROM no sale de aqui" y dejaria de ser verdad.

El filtro es por host: las peticiones que llegan por `localhost` se atienden y
las que llegan por el dominio del tunel reciben un 404. Asi tu sigues
aleatorizando en `http://localhost:5173` mientras tu companero, entrando por el
enlace, ve que no tiene esa funcion. Si el quiere aleatorizar, que ejecute su
propio servicio.

Ojo con esto al probar: si abres **tu propio enlace de tunel** en vez de
localhost, tampoco tendras aleatorizacion, porque para el servidor eres uno mas
de fuera.

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

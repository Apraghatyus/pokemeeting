# Desplegar en un servidor propio

Instructivo para dejar Pokemeeting corriendo en un servidor tuyo, con tu
dominio, sin tuneles temporales.

Lo que hay aqui esta comprobado contra el proyecto tal y como esta: los puertos
son los que usa el codigo, los tiempos estan medidos y la compilacion de
produccion se probo arrancando el emulador con ella.

## Con Docker (lo mas corto)

En `deploy/` hay una version en contenedores que no necesita instalar nada en
la maquina salvo Docker: `deploy/Dockerfile` construye las dos piezas de
servidor (con Java 8, `jjs` y el jar oficial del randomizer) y una web con Caddy
que pone las dos cabeceras y reparte `/signaling` y `/randomizer`. El HTTPS lo
pone lo que este delante (Cloudflare Tunnel, Nginx Proxy Manager...), apuntando
a `http://emupoke-web:80`.

```bash
docker network create cloudflared-net   # si no existe ya
docker compose -f deploy/docker-compose.yml up -d --build
```

Sin Docker, `sudo bash deploy/instalar.sh` hace lo de este documento con Caddy
y un dominio `<ip>.sslip.io`.

## Lo que vas a montar

Son tres piezas, y solo una mira a internet:

```
        internet
           |
    [ proxy inverso ]   <- aqui viven el HTTPS y las dos cabeceras
     /      |      \
ficheros  /signaling  /randomizer
estaticos    :8787       :8788
  (dist)     Node      Node + Java
```

- **La aplicacion** es un monton de ficheros estaticos. No necesita Node para
  servirse.
- **El servidor de salas** empareja a los dos jugadores y se aparta. El
  navegador lo busca siempre en `/signaling` del mismo dominio desde el que se
  sirvio la pagina, asi que el proxy tiene que llevarlo ahi.
- **El servicio de aleatorizacion** es opcional. Sin el, la aplicacion funciona
  entera salvo el menu de aleatorizar.

Lo que **no** hay es base de datos. El servidor no guarda partidas, ni ROMs, ni
guardados: todo eso vive en el navegador de cada jugador. No hay nada que
respaldar.

## Requisitos

| | Para que |
|---|---|
| Node 20 o superior | Las dos piezas de servidor |
| Un dominio con HTTPS | Sin contexto seguro el emulador no arranca |
| ~2 GB de RAM libres | El randomizer pide hasta 4 GB de monton a la JVM |
| Java **8** | Solo si quieres aleatorizar. Ver el aviso de abajo |

### El aviso sobre Java

El servicio necesita `jjs`, el motor de scripts que acompanaba a Java 8. Es lo
que permite construir los ajustes y, sobre todo, fijar la semilla, que es lo
que hace que una partida se pueda rehacer sin guardarla (ver
[randomizer.md](randomizer.md)). En las versiones modernas de Java `jjs` ya no
viene, asi que **no vale cualquier Java**: con un Java 17 el menu de
aleatorizacion respondera que no puede trabajar.

El nombre del paquete cambia segun la distribucion. Lo que importa es que
despues de instalarlo esto encuentre el fichero:

```bash
ls "$(java -XshowSettings:properties -version 2>&1 | sed -n 's/.*java.home = //p')/bin/jjs"
```

El jar del randomizer se descarga aparte, siguiendo
[tools/randomizer/LEEME.md](../tools/randomizer/LEEME.md). No se versiona con
el proyecto a proposito: es software de otra gente, con licencia GPL-3.

## 1. Traer el proyecto y compilarlo

```bash
git clone <tu-repositorio> /opt/emupoke
cd /opt/emupoke
npm ci
npm run build
```

Queda una carpeta `apps/web/dist` de unos 2,8 MB. Dentro va tambien el nucleo
del emulador (`dist/mgba/`), que se copia solo durante la compilacion.

**No uses `npm ci --omit=dev`.** Las dos piezas de servidor ejecutan
TypeScript directamente con `tsx`, que esta entre las dependencias de
desarrollo. Sin ellas el servidor de salas no arranca.

## 2. Las dos piezas de servidor

Dos unidades de systemd. El servicio de aleatorizacion ya escucha solo en
`127.0.0.1`, asi que no hace falta cerrarlo por fuera.

`/etc/systemd/system/emupoke-salas.service`:

```ini
[Unit]
Description=Pokemeeting - servidor de salas
After=network.target

[Service]
WorkingDirectory=/opt/emupoke/apps/signaling
ExecStart=/usr/bin/npm start
Environment=PORT=8787
Restart=always
User=emupoke

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/emupoke-randomizer.service`:

```ini
[Unit]
Description=Pokemeeting - aleatorizacion
After=network.target

[Service]
WorkingDirectory=/opt/emupoke/apps/randomizer
ExecStart=/usr/bin/npm start
Environment=PORT=8788
# Solo si dejaste el jar en otro sitio:
# Environment=UPR_JAR=/opt/randomizer/PokeRandoZX.jar
#
# Cuantas aleatorizaciones a la vez. Por defecto son cuatro, o los nucleos que
# haya si son menos. Subirlo no va mas rapido: medido, pasadas cuatro el
# rendimiento total EMPEORA y lo unico que crece es la espera de cada uno.
# Environment=RANDOMIZER_CONCURRENCIA=4
#
# Cuantos pueden esperar antes de responder "ahora no". Mejor rechazar que
# aceptar a cualquiera y hacerle esperar media hora.
# Environment=RANDOMIZER_MAX_COLA=100
#
# Techo de memoria de cada JVM. El pico real medido son 143 MB.
# Environment=RANDOMIZER_XMX=1024M
Restart=always
User=emupoke

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now emupoke-salas emupoke-randomizer
```

El de aleatorizacion dice al arrancar si encuentra Java y si es de 64 bits, y
con que limites corre. Si avisa de algo sobre Java, el resto no va a funcionar.

### Cuanta maquina pide cada pieza

Si vas a tener mas de un par de jugadores, los numeros medidos estan en
[capacidad.md](capacidad.md). El resumen: las salas aguantan 1000 jugadores en
137 MB, y la unica pieza que pide maquina de verdad es esta de aleatorizar.

Para ver como va la cola en cualquier momento:

```bash
curl -s http://127.0.0.1:8788/cola
# {"atendiendo":2,"enCola":5,"segundosPorCopia":4.1,"limite":4}
```

### Cuidado con el puerto 8787

El servidor de salas escucha en **todas** las interfaces, no solo en local. Si
tu servidor esta expuesto, cierralo por fuera y deja que solo entre por el
proxy:

```bash
sudo ufw allow 80,443/tcp
sudo ufw deny 8787/tcp
```

## 3. El proxy inverso

Aqui se juega el despliegue entero. Tiene que hacer cuatro cosas, y si falla
una, la aplicacion se rompe de formas que no parecen tener relacion:

1. **HTTPS.** Sin contexto seguro no hay `SharedArrayBuffer` ni microfono.
2. **Las dos cabeceras de aislamiento.** `Cross-Origin-Opener-Policy:
   same-origin` y `Cross-Origin-Embedder-Policy: require-corp`. Sin ellas el
   nucleo del emulador arranca y falla en silencio, que es el fallo mas
   desconcertante de todos.
3. **`/signaling` con WebSocket**, cabecera `Upgrade` incluida. El navegador
   construye la direccion el solo a partir del dominio que sirve la pagina:
   siempre `wss://tu-dominio/signaling`.
4. **`/randomizer` con cuerpos grandes.** Una ROM comprimida son unos 5 MB de
   subida y otros tantos de bajada.

### Con Caddy

Es lo mas corto, y saca el certificado el solo:

```caddyfile
tu-dominio.com {
    encode gzip

    header {
        Cross-Origin-Opener-Policy same-origin
        Cross-Origin-Embedder-Policy require-corp
    }

    handle /signaling* {
        uri strip_prefix /signaling
        reverse_proxy 127.0.0.1:8787
    }

    handle /randomizer* {
        uri strip_prefix /randomizer
        reverse_proxy 127.0.0.1:8788
    }

    handle {
        root * /opt/emupoke/apps/web/dist
        try_files {path} /index.html
        file_server
    }
}
```

Caddy entiende el WebSocket sin que haya que decirle nada.

### Con nginx

```nginx
server {
    listen 443 ssl http2;
    server_name tu-dominio.com;

    ssl_certificate     /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

    # Una ROM comprimida ronda los 5 MB; con esto sobra de largo.
    client_max_body_size 64M;

    location / {
        root /opt/emupoke/apps/web/dist;
        try_files $uri $uri/ /index.html;

        # Sin estas dos el emulador no arranca. Van con "always" para que
        # salgan tambien en las respuestas 304, que es cuando mas duele
        # olvidarlas: funciona la primera visita y falla la segunda.
        add_header Cross-Origin-Opener-Policy same-origin always;
        add_header Cross-Origin-Embedder-Policy require-corp always;
    }

    location /signaling {
        rewrite ^/signaling(.*)$ $1 break;
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        # Una sala dura lo que dure la partida, y el canal se queda quieto
        # entre mensaje y mensaje.
        proxy_read_timeout 3600s;
    }

    location /randomizer {
        rewrite ^/randomizer(.*)$ $1 break;
        proxy_pass http://127.0.0.1:8788;
        proxy_set_header Host $host;
        # Aleatorizar tarda unos segundos; el margen es por si el servidor
        # es modesto.
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

## 4. Comprobar que quedo bien

En este orden, porque cada una descarta una capa:

```bash
# 1. Las cabeceras de aislamiento llegan al navegador
curl -sI https://tu-dominio.com | grep -i cross-origin

# 2. El servidor de salas responde
curl -s https://tu-dominio.com/signaling/health

# 3. El de aleatorizacion encuentra Java, el jar y jjs
curl -s https://tu-dominio.com/randomizer/health
```

De la tercera, lo que hay que mirar es `menu.available`. Si viene `false`, tu
Java no trae `jjs`: se podra aleatorizar con un fichero `.rnqs` traido de
fuera, pero sin semilla fija, y esas partidas no se podran rehacer.

Y desde el navegador, la prueba que de verdad cuenta: abrir el dominio, cargar
una ROM y ver el juego moverse. Si la pantalla se queda negra, casi siempre es
el punto 1.

## 5. Actualizar

```bash
cd /opt/emupoke
git pull
npm ci
npm run build
sudo systemctl restart emupoke-salas emupoke-randomizer
```

La aplicacion son ficheros estaticos: en cuanto termina la compilacion, el
proxy ya sirve la version nueva. Los dos servicios solo hace falta reiniciarlos
si cambio su codigo.

Una advertencia al actualizar: si cambias la version del jar del randomizer,
las partidas creadas con la anterior podrian no rehacerse igual. La aplicacion
lo detecta -compara con el CRC de la copia original- y avisa en vez de cargar
un mundo distinto, pero el jugador se queda sin poder rehacer esa partida.

## Sobre las ROMs, que es lo delicado

Este proyecto nunca distribuye juegos, y desplegarlo no cambia eso. Conviene
saber exactamente que pasa en tu servidor:

- **La aplicacion no sube ninguna ROM.** Cada jugador carga la suya y se queda
  en su navegador. Lo que viaja al companero es la imagen de la pantalla, no el
  juego.
- **El servicio de aleatorizacion si recibe ficheros**, pero solo para
  devolverselos a quien los mando. Trabaja en una carpeta temporal que se borra
  en un `finally`, pase lo que pase. Procesar el fichero de alguien y
  devolverselo no es distribuir; entregarselo a un tercero si lo seria, y eso
  no ocurre en ningun camino del codigo.
- **Las semillas no llevan el juego dentro.** Se pueden compartir sin repartir
  nada.

Si aun asi prefieres no recibir ficheros de nadie, quita el bloque
`/randomizer` del proxy: la aplicacion se da cuenta y ofrece jugar tal cual.

## Lo unico que puede fallarte y no depende de ti

Los dos navegadores se conectan directamente entre si, sin pasar por tu
servidor. Para encontrarse usan un STUN publico de Google, que basta en la
mayoria de las redes domesticas.

En redes mas cerradas -algunas corporativas, algunos moviles con NAT
simetrico- esa conexion directa no se establece y hace falta un servidor TURN
que haga de intermediario. No viene montado porque hasta ahora no ha hecho
falta. Si te pasa, se instala `coturn` y se anade a `ICE_SERVERS` en
[apps/web/src/net/peerLink.ts](../apps/web/src/net/peerLink.ts).

El sintoma es reconocible: la sala se crea, los dos entrais, y la pantalla del
companero no llega nunca.

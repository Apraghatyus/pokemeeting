# Desplegar en un servidor propio

Instructivo para dejar Pokemeeting corriendo en un servidor tuyo, con tu
dominio, sin tuneles temporales.

Lo que hay aqui esta comprobado contra el proyecto tal y como esta: los puertos
son los que usa el codigo, los tiempos estan medidos y la compilacion de
produccion se probo arrancando el emulador con ella.

## Con Docker (lo mas corto)

En `deploy/` hay una version en contenedores que no necesita instalar nada en
la maquina salvo Docker: `deploy/Dockerfile` construye las piezas de servidor
(con Java 8, `jjs` y el jar oficial del randomizer) y una web con Caddy que
pone las dos cabeceras y reparte `/signaling`, `/randomizer` y `/cuentas`. El
HTTPS lo pone lo que este delante (Cloudflare Tunnel, Nginx Proxy Manager...),
apuntando a `http://emupoke-web:80`.

```bash
docker network create cloudflared-net   # si no existe ya

# Las contrasenas de la base. Si no quieres cuentas, igualmente hacen falta
# para que el compose arranque; o quita el servicio "base".
cp deploy/.env.ejemplo deploy/.env && chmod 600 deploy/.env
openssl rand -hex 32   # una para cada EMUPOKE_PG_*_CLAVE

docker compose -f deploy/docker-compose.yml up -d --build
```

Antes de abrirlo al mundo, cambia `EMUPOKE_PROXY_FIABLE` por la IP de tu proxy:
de eso depende que el limite de intentos de inicio de sesion sea por persona.
Esta explicado mas abajo, en **La base de datos**.

Sin Docker, `sudo bash deploy/instalar.sh` hace lo de este documento con Caddy
y un dominio `<ip>.sslip.io`.

## Lo que vas a montar

Son cuatro piezas, y solo una mira a internet:

```
        internet
           |
    [ proxy inverso ]   <- aqui viven el HTTPS y las dos cabeceras
     /     |      |     \
ficheros /signaling /randomizer /cuentas
estaticos  :8787      :8788      :8789
  (dist)   Node    Node + Java   Node
                                   |
                              [ PostgreSQL ]  <- no sale a internet
```

- **La aplicacion** es un monton de ficheros estaticos. No necesita Node para
  servirse.
- **El servidor de salas** empareja a los dos jugadores y se aparta. El
  navegador lo busca siempre en `/signaling` del mismo dominio desde el que se
  sirvio la pagina, asi que el proxy tiene que llevarlo ahi.
- **El servicio de aleatorizacion** es opcional. Sin el, la aplicacion funciona
  entera salvo el menu de aleatorizar.

- **El servicio de cuentas** es opcional tambien, y es el unico que guarda
  algo. Sin `DATABASE_URL` no arranca y el resto funciona igual: jugar, verse,
  hablar y aleatorizar nunca han necesitado una cuenta.

**Lo que guarda la base, y lo que no.** Guarda cuentas, partidas terminadas y
los equipos con los que se acabaron: numeros, motes y fechas. **No guarda ROMs,
ni copias aleatorizadas, ni guardados.** De una partida se guarda su *semilla*,
que son cuatro campos de texto con los que su dueno vuelve a generar la copia
desde su propia ROM. Esa linea es la misma de siempre y no se mueve porque
ahora haya base de datos.

Hasta que existio esto, el servidor no guardaba absolutamente nada y no habia
nada que respaldar. Ahora hay **una cosa**: el volumen de PostgreSQL.

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

## La base de datos

Solo hace falta si quieres cuentas. Esta en el `docker-compose.yml` como
servicio `base` y **no publica ningun puerto**: vive en la red interna de
Docker, el proxy no la enruta y desde fuera de la maquina no se llega a ella.

### Montarla

```bash
cp deploy/.env.ejemplo deploy/.env
chmod 600 deploy/.env

# Tres contrasenas, EN HEX. Nada de base64: mete / + = y rompe la DATABASE_URL.
openssl rand -hex 32   # EMUPOKE_PG_ADMIN_CLAVE
openssl rand -hex 32   # EMUPOKE_PG_APP_CLAVE
openssl rand -hex 32   # EMUPOKE_PG_DEV_CLAVE

docker compose -f deploy/docker-compose.yml up -d base
docker compose -f deploy/docker-compose.yml logs -f base
```

El esquema se crea solo: el servicio de cuentas aplica sus migraciones al
arrancar, en orden y cada una en su transaccion. No hay ningun paso manual.

### Tres roles, y por que

`deploy/initdb/10-roles.sh` corre **una sola vez**, en el primer arranque, con
el volumen vacio. Para volver a aplicarlo hay que borrar el volumen.

| Rol | Que puede | Donde se usa |
|---|---|---|
| `emupoke_admin` | Superusuario | Solo por socket, con `docker exec`. Por red esta **rechazado** |
| `emupoke_app` | Dueno de la base `emupoke`, sin superusuario | El servicio de cuentas |
| `emupoke_dev` | Dueno de `emupoke_dev`, y **nada** de la de produccion | Desarrollar. Es la credencial que se comparte |

La gracia del tercero es que se puede pasar a quien este trabajando en el
proyecto sin darle acceso a los datos de nadie. Y la del primero, que una
contrasena de superusuario filtrada no sirve por red: el `pg_hba.conf` que
escribe ese script la rechaza.

### Abrir la base para desarrollar

El acceso de desarrollo es un contenedor aparte con perfil `dev`, **apagado por
defecto**. Va aparte a proposito: asi un fallo suyo no se lleva por delante ni
la base ni la partida de nadie.

```bash
# en el .env: EMUPOKE_PG_BIND=<tu IP de Tailscale>  y  EMUPOKE_PG_PUERTO=5434
docker compose -f deploy/docker-compose.yml --profile dev up -d tunel-dev

# y cuando ya no haga falta
docker compose -f deploy/docker-compose.yml stop tunel-dev
docker compose -f deploy/docker-compose.yml rm -f tunel-dev
```

Escucha **solo en esa IP**, asi que llega quien este en tu tailnet y nadie mas.
Esa es la frontera entera, y es suficiente.

**No le pongas a socat un filtro de origen.** Parece que refuerza y lo que hace
es rechazarlo todo: Docker le entrega las conexiones con la IP de su propia
puerta de enlace, no con la del cliente, asi que el filtro no ve nunca una
direccion del tailnet. El sintoma es desconcertante -el puerto acepta la
conexion y la cierra sin decir una palabra, como si no hubiera nada detras-.

Al conectarte desde fuera, mira **cuantas conexiones** puedes abrir: el rol de
desarrollo admite 5 y el tunel otras 5. El servicio de cuentas abre 10 por
defecto, asi que en desarrollo hay que bajarlo con `CUENTAS_MAX_CONEXIONES=4`.
Pasarse no da un error claro: da esperas que parecen un servidor lento.

### Respaldarla

Es lo unico del proyecto que hay que respaldar, y cabe en un fichero de texto:

```bash
docker exec emupoke-base pg_dump -U emupoke_admin emupoke | gzip > emupoke-$(date +%F).sql.gz
```

### La IP del proxy, que hay que cambiar

En `deploy/Caddyfile` hay un `trusted_proxies` con **una IP de ejemplo**: la de
una instalacion concreta, no la tuya. Es quien puede decir cual es la IP del
visitante. Ponla en `EMUPOKE_PROXY_FIABLE`, en el `.env`:

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' cloudflared
```

Tiene que ser la IP **exacta**, no la subred: por la subred entera entra
tambien el trafico directo al puerto, y entonces cualquiera puede escribir la
cabecera que quiera y decir que viene de donde le convenga.

**Que pasa si no la cambias.** Todos los visitantes se ven con la misma
direccion -la del proxy-, asi que los cupos que van por direccion dejan de
distinguir a nadie. No se cuela nadie por eso; lo que pasa es que esos cupos
se vuelven comunes.

Por eso el limite de intentos de inicio de sesion **no depende de esto**: va
sobre todo por cuenta -diez por cuarto de hora-, que es un dato que manda quien
pregunta y no se puede estropear configurando mal la red. El cupo por direccion
existe, pero es un techo alto, de red de seguridad. Asi, una instalacion a la
que se le olvido esta linea no se cierra sola la puerta: antes bastaba con que
una persona se equivocara diez veces para dejar fuera a las demas.

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

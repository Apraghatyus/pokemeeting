# Cuanto consume y que hace falta para 1000 jugadores

Dimensionado para 1000 jugadores simultaneos, es decir 500 parejas jugando a la
vez.

Todos los numeros de aqui estan **medidos** contra el proyecto tal y como esta,
en una maquina de 12 nucleos, no estimados. Donde algo es una estimacion y no
una medida, lo dice.

---

## El resumen, por si no lees mas

Dos conclusiones, y la segunda es la que importa:

1. **Sostener a 1000 jugadores jugando es casi gratis.** El servidor de salas
   aguanta las 1000 conexiones en **137 MB de memoria** y con la CPU
   practicamente parada, porque el video va directo entre los dos navegadores y
   no pasa por aqui. Eso cabe en la maquina mas pequena que vendan.

2. **Lo que cuesta no es el estado estable, son dos picos.** Aleatorizar, que es
   lo unico que quema CPU de verdad y va a **0,78 por segundo** como techo en doce
   nucleos -o sea unos 21 minutos para mil partidas nuevas-; y el ancho de banda
   del TURN, que es la unica factura que escala con el numero de jugadores y puede
   irse a **8,9 TB al mes**.

Sobre el primero ya se actuo: hay cola con limite, y medido A/B en la misma
maquina el servicio pasó de 0,48 a 0,78 por segundo. **x1,6, no el x2 que
predije**, y la seccion del aleatorizador explica en que me equivoque al
calcularlo.

Y una observacion que cambia el calculo entero, en la seccion siguiente.

---

## Lo primero: 1000 jugadores no son 1000 aleatorizaciones

Es el error de calculo facil, y conviene quitarlo de en medio antes de sumar
nada.

La copia aleatorizada **se guarda en el navegador del jugador** (IndexedDB, hasta
tres partidas a la vez: `MAX_PARTIDAS = 3` en `apps/web/src/core/partidas.ts`).
Un jugador aleatoriza **una vez por partida**, no una vez por sesion. Una Soul
Link se juega durante dias o semanas sobre la misma copia.

O sea que el aleatorizador no tiene carga proporcional a cuanta gente esta
jugando, sino a **cuanta gente empieza una partida nueva**. En estado estable
esta parado. El riesgo esta en el dia de estreno, cuando mil personas entran a la
vez y todas empiezan de cero.

Por eso lo que hay que dimensionar es el pico, no la media. Y por eso el pico
necesita una cola, que es la recomendacion principal de este documento.

---

## Lo que gasta cada pieza

### 1. Los ficheros estaticos

Lo que baja un visitante **nuevo**, ya comprimido:

| Fichero | Con gzip |
|---|---|
| `mgba/mgba.wasm` | 575 KB |
| `assets/index.js` | 92 KB |
| `mgba/mgba.js` | 55 KB |
| `assets/index.css` | 5 KB |
| `index.html` | 0,4 KB |
| **Total** | **729 KB** |

Mil visitantes nuevos de golpe son **711 MB**. Una vez. Con cabeceras de cache
los que vuelven no bajan nada, y los nombres llevan hash, asi que se puede
cachear para siempre sin miedo.

No hace falta Node para servir esto, ni CDN para este volumen. Cualquier proxy lo
hace.

> **Arreglo de un minuto:** la compilacion incluye `mgba/mgba.wasm.map`, 448 KB
> de mapa de depuracion. Solo lo pide el navegador con las herramientas de
> desarrollo abiertas, asi que no esta en los 729 KB, pero no deberia subir al
> servidor de produccion.

### 2. El servidor de salas

Medido abriendo **1000 WebSockets de verdad** y creando 500 parejas:

| | Medido |
|---|---|
| Memoria con 1000 conexiones y 1001 salas | **137 MB** de pico (54 MB en reposo) |
| Emparejar | **23,1 parejas por segundo** |
| Reenviar un mensaje de senalizacion con 1001 salas | **0,38 ms** |
| CPU en estado estable | practicamente cero |
| Ancho de banda | unos pocos KB por emparejamiento |

Esta pieza no es el problema. Aguanta 1000 jugadores de sobra en 1 vCPU.

Dos cosas que conviene saber igualmente:

- **Las 23,1 parejas/s las limita `scrypt`**, no la red: derivar la contrasena de
  la sala cuesta **53 ms de CPU** y se hace dos veces por pareja (al crear y al
  entrar). Son 1000 jugadores en 22 segundos, que esta bien, pero si llegan todos
  de golpe se nota. `scrypt` corre en el grupo de hilos de Node, que por defecto
  son cuatro: subir `UV_THREADPOOL_SIZE` a 8 o 16 lo ensancha sin tocar codigo.
  Y que cueste es deliberado, no un defecto: es lo que protege la sala de alguien.
- **`roomOf` recorre el mapa entero** en cada mensaje de senalizacion
  (`apps/signaling/src/rooms.ts`). Con 1001 salas son 0,38 ms, o sea irrelevante
  hoy. Queda apuntado porque crece con el numero de salas, no con el de mensajes.

### 3. El aleatorizador: aqui esta el cuello de botella

Una aleatorizacion de Rojo Fuego (16 MB, cinco opciones marcadas), por el mismo
camino HTTP que usa el navegador:

| | Medido |
|---|---|
| Tiempo de una sola | **3,5 s** |
| Memoria real de la JVM | **143 MB** de pico |
| Sube el jugador | 5,1 MB (la ROM de 16 MB comprime a 5,1) |
| Baja el jugador | 5,1 MB |

Y lo importante, como escala en paralelo en 12 nucleos:

| A la vez | Total | Por segundo |
|---|---|---|
| 1 | 3,5 s | 0,29 |
| 2 | 4,4 s | 0,45 |
| 4 | 7,4 s | 0,54 |
| 8 | 13,5 s | **0,59** |

**Se estanca en 0,59 por segundo.** Echarle mas concurrencia solo alarga la
espera de cada uno: de 3,5 s a 13,5 s. Durante esas pruebas la CPU estuvo al
**96% de media** y el disco al **6%**, asi que es CPU pura: ni disco ni red.

A 0,59/s, **1000 aleatorizaciones son 28 minutos de cola.** (Ese era el punto
de partida; mas abajo esta lo que quedo despues de arreglarlo.)

#### Y la mitad de ese coste no es del randomizer

Esto es lo mas util que salio de medir. Llamando al jar **por fuera**, sin pasar
por el servicio HTTP, 8 a la vez dan **1,38 por segundo**. El servicio entrega
0,59. O sea que **el servicio se come mas de la mitad de su propia capacidad.**

Desglosando los 3,5 s de una peticion:

| Parte | Coste | ¿Evitable? |
|---|---|---|
| Aleatorizar de verdad | ~2,0 s | No |
| **Una segunda JVM solo para escribir los ajustes** | **1,0 s** | Si: el resultado es determinista y las combinaciones son pocas |
| **`gzipSync` + `gunzipSync` de 16 MB** | **0,46 s** | Si: hoy bloquean el bucle de eventos, o sea que serializan todo el servicio |
| Arrancar una JVM (suelo, medido) | 0,3 s | No |

Esas dos filas ya estan arregladas, y **lo medido no fue lo que predije**: ver la
seccion siguiente.

#### Lo que se arreglo, y en que me equivoque al predecirlo

Las tres cosas estan hechas. Y conviene contar bien el resultado, porque **la
prediccion de que doblaria la capacidad era optimista**:

| | Medido, A/B en la misma maquina |
|---|---|
| Antes (sin cola, gzip sincrono, `-Xmx4096M`) | 0,46 y 0,50 por segundo |
| Despues (cola de 4, gzip asincrono, ajustes en cache, `-Xmx1024M`) | **0,80 y 0,76 por segundo** |

**x1,6, no x2.** Las dos tandas de cada uno se midieron seguidas, misma maquina y
mismo estado, porque entre sesiones las cifras absolutas se mueven facil un 30%.

**Por que me pase al predecir el x2.** Lo saque de que el jar por fuera daba 1,38
y el servicio 0,59, y asumi que la diferencia era toda desperdicio evitable. No
lo era: la llamada directa tampoco descomprimia 5 MB de subida, ni escribia 16 MB
al disco, ni los leia de vuelta, ni comprimia 16 MB de respuesta. Eso es trabajo
real que sigue ahi.

Y de ahi sale la leccion que mas vale guardarse: **en una maquina con la CPU
saturada, pasar trabajo a asincrono no crea capacidad.** Los 389 ms de comprimir
se siguen pagando; lo unico que cambia es que los paga una peticion en vez de
congelar a todas.

Lo que compro cada cambio, separado:

- **Cachear los ajustes** quita trabajo de verdad: de 4,4 s en frio a 2,8 s en
  caliente, medido tres veces seguidas en un proceso recien arrancado. Es la
  unica de las tres que sube el rendimiento.
- **Comprimir fuera del bucle** no da capacidad; da que el servicio siga
  respondiendo. Medido con cuatro copias en marcha, preguntar por la cola tarda
  **2 ms de mediana y 68 ms en el peor caso**. Con `gzipSync` cada respuesta
  congelaba el proceso 389 ms, asi que justo la consulta que dice "faltan X
  minutos" llegaba tarde cuando mas falta hacia. Sin esto, la cola no se podria
  consultar.
- **La cola no cuesta rendimiento: lo protege.** Medido, 8 a la vez dan 0,46 por
  segundo y 4 a la vez dan 0,55: pasado el limite, mas concurrencia va *a peor*.
  Y acota la memoria, que era el riesgo gordo.

Tambien se probo subir `UV_THREADPOOL_SIZE` de 4 a 16, por si los `gzip`
asincronos se estorbaban en el grupo de hilos. **No cambia nada** (0,77 frente a
0,74, o sea ruido). Queda descartado.

Nota menor que no se adopto: limitar los nucleos por copia
(`-XX:ActiveProcessorCount=1`, porque cada JVM dimensiona su recolector para
todos los nucleos de la maquina) dio entre un 12% y un 26% en dos pasadas. La
distancia entre esas dos cifras es ruido de carga, asi que es una ganancia
modesta y no la palanca principal.

#### Lo que esto cambia para el dimensionado

A 0,78 por segundo, **1000 aleatorizaciones son unos 21 minutos** en doce
nucleos, en vez de los 35 de antes. Sigue siendo un pico que hay que gestionar
con la cola, no una cifra que lo haga desaparecer: para bajar de ahi hace falta
mas maquina, no mas codigo.

### 4. El video: lo unico que escala con el numero de jugadores

Medido con las estadisticas de WebRTC de una pareja jugando de verdad:

| | Medido |
|---|---|
| Video que sube un jugador | **1067 kbps** (240 px, 46 fps) |
| Total por jugador y sentido | **~1,1 Mbps** |
| Techo configurado (`maxBitrate`) | 2,5 Mbps |
| Canal de datos (equipos, cada 3 s) | despreciable |

La voz midio 0 porque la prueba usa un microfono falso en silencio. Para Opus en
voz, lo normal son 24–40 kbps: **estimacion, no medida**, y en cualquier caso es
ruido al lado del video.

**Normalmente esto no te cuesta nada**, porque va directo entre los dos
navegadores. El servidor solo paga cuando hay que retransmitir, y de eso va la
seccion siguiente.

---

## El TURN, que es la factura de verdad

WebRTC conecta directo casi siempre, pero con NAT simetrica a los dos lados no
puede, y entonces hace falta un servidor que retransmita. Sin TURN esas parejas
**no llegan a conectar nunca** (es la deuda que ya esta apuntada en
[ideas-pendientes.md](ideas-pendientes.md)).

Lo que cuesta cada pareja retransmitida: el TURN recibe 1,1 Mbps de cada uno y lo
reenvia al otro, o sea **2,2 Mbps de salida por pareja**.

Cuanta gente lo necesita no lo he medido -depende de las redes de tus jugadores,
no del codigo-. La cifra que se maneja en la industria es entre un 8% y un 20%.
Asi que, para 500 parejas:

| Parejas por TURN | Salida sostenida | Al mes (4 h/dia) |
|---|---|---|
| 10% (50) | 110 Mbps | 3,0 TB |
| **15% (75)** | **165 Mbps** | **8,9 TB** |
| 100% (500), el peor caso | 1,1 Gbps | 59 TB |

**La decision que de verdad ahorra dinero esta aqui**, y no es tecnica: montar el
TURN donde el trafico no se pague por GB. En un proveedor que cobra la salida a
~0,09 $/GB, esos 8,9 TB son unos **800 $ al mes**. En una maquina dedicada con 1
Gbps sin medir, los mismos 8,9 TB entran en una cuota fija de dos cifras.

Retransmitir no quema CPU: es reenviar UDP. Un TURN de 2 vCPU mueve varios
cientos de Mbps sin sudar. **Lo que hay que comprar es ancho de banda, no
maquina.**

---

## Que montar

Tres maquinas, y estan separadas por un motivo concreto cada una.

### A. Web y salas — 2 vCPU, 2 GB

Sirve los estaticos y el servidor de salas. Medido: 137 MB con 1000 conexiones.
Los 2 GB son holgura absurda, pero es la talla mas pequena que suele merecer la
pena.

Aqui vive el HTTPS y las dos cabeceras de aislamiento, como explica
[despliegue.md](despliegue.md).

### B. Aleatorizador — 8 vCPU, 8 GB, disco SSD

Separado porque es la unica pieza que puede comerse la maquina entera, y no
quieres que al hacerlo se lleve por delante las salas de 500 partidas en curso.

Con el codigo de hoy, 8 vCPU dan del orden de 0,5–0,8 aleatorizaciones por
segundo: **1000 nuevas partidas son unos 20–30 minutos de cola**, que la cola
gestiona y le cuenta al jugador. Bajar de ahi es cuestion de mas nucleos, no de
mas codigo: los arreglos faciles ya estan hechos.

Memoria: con el limite por defecto de 4 simultaneas y `-Xmx1024M`, el peor caso
autorizado son 4 GB y el real medido ronda los 600 MB. Los 8 GB son para no
pensar.

Las tres variables que la ajustan:

| Variable | Por defecto | Para que |
|---|---|---|
| `RANDOMIZER_CONCURRENCIA` | `min(4, nucleos)` | Cuantas a la vez. Mas de 4 empeora. |
| `RANDOMIZER_MAX_COLA` | `100` | A partir de ahi se responde "ahora no" en vez de aceptar y mentir. |
| `RANDOMIZER_XMX` | `1024M` | Techo de memoria de cada JVM. |

Esta maquina **se puede apagar** sin tumbar nada mas: sin ella la aplicacion
funciona entera menos el menu de aleatorizar. Es la candidata obvia a escalar
sola, o a encenderse solo los dias de estreno.

### C. TURN (coturn) — 2 vCPU, 2 GB, **1 Gbps sin medir**

Lo unico que importa de esta maquina es la tarifa del trafico. Ver arriba.

### ¿Se puede en menos maquinas?

Si, juntando A y B en una de 8 vCPU. Lo que **no** conviene juntar es el TURN con
lo demas, y el motivo no es tecnico: es que quieres poder elegir el proveedor del
TURN por el precio del ancho de banda, que es un criterio distinto al de las
otras dos.

Lo que no hace falta en ningun caso: **base de datos, ni respaldos, ni
almacenamiento**. El servidor no guarda partidas, ni guardados, ni ROMs. Nada que
respaldar, y la linea legal del proyecto intacta: la ROM va y vuelve a quien la
mando, y no se queda.

---

## Cambios: los hechos y los que quedan

### Hechos

1. **Limite de aleatorizaciones simultaneas, con cola.** Es lo que separa "los
   que sobran esperan" de "se cae para todos". Y la cola le dice al jugador por
   donde va: `GET /cola?ticket=`, con el ticket que se inventa el propio cliente,
   porque la respuesta de `/randomize` no llega hasta el final y sin ticket no
   habria con que preguntar justo mientras hace falta. En pantalla sale "hay 3
   esperando antes que ti: unos 2 minutos".
2. **Ajustes en cache.** De 4,4 s a 2,8 s por peticion. Que el orden en que se
   marcan las opciones no cambia el resultado no se supuso: se comprobo, porque
   la cadena de ajustes es media semilla.
3. **Compresion fuera del bucle de eventos.** No da capacidad, da que el servicio
   responda mientras trabaja. Sin esto la cola no se podria consultar.
4. **`-Xmx` de 4096M a 1024M.** El pico real medido son 143 MB. El techo de 4 GB
   no se usaba, pero autorizaba a cada proceso a pedirlo.

Lo vigilan `npm run test:cola` (la clase), `test:cola:servicio` (por HTTP) y
`test:cola:ui` (que el jugador lo vea).

### Lo que queda

- **No subir `mgba.wasm.map`** a produccion: 448 KB de mapa de depuracion.
- **Las salas viven en memoria.** No es de capacidad, pero a esta escala cambia de
  categoria: hoy reiniciar el servidor de salas es una molestia, con 500 partidas
  en curso son 500 partidas cortadas sin reconexion posible. Ya esta apuntado en
  [ideas-pendientes.md](ideas-pendientes.md); con 1000 jugadores sube de
  prioridad.
- **Un TURN**, sin el cual una parte de las parejas no conecta nunca.

---

## Como se midio esto

Para poder repetirlo cuando cambie el codigo:

- **Estaticos**: `npm run build` y `gzip -c` sobre cada fichero de `dist/`.
- **Salas**: 1000 WebSockets reales contra el servidor, 500 parejas creadas y
  emparejadas, memoria del proceso muestreada cada 400 ms.
- **Aleatorizador**: peticiones `POST /randomize` reales con la ROM comprimida,
  en tandas de 1, 2, 4 y 8; CPU y disco con los contadores del sistema; y el jar
  llamado tambien por fuera del servicio para separar su coste del de la JVM.
- **El antes y el despues**: con `git stash` del fichero del servicio, para medir
  las dos versiones seguidas en la misma maquina y con la misma carga. Es la unica
  forma de que la comparacion signifique algo: entre sesiones las cifras
  absolutas se mueven un 30% sin tocar nada.
- **Video**: `RTCPeerConnection.getStats()` de una pareja jugando, envolviendo el
  constructor desde fuera para no tocar el codigo de la aplicacion.

Las cifras salen de una maquina de 12 nucleos. Lo que se traslada a otra maquina
son las **proporciones** (que escalar se estanca pasadas cuatro copias, que
asincrono no crea capacidad en una maquina saturada), no los segundos exactos.

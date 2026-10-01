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
   lo unico que quema CPU de verdad y hoy va a **0,59 por segundo** como techo; y
   el ancho de banda del TURN, que es la unica factura que escala con el numero
   de jugadores y puede irse a **8,9 TB al mes**.

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

A 0,59/s, **1000 aleatorizaciones son 28 minutos de cola.**

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

Arreglar esas dos filas **aproximadamente dobla la capacidad sin comprar nada**.
Es el mejor cambio por esfuerzo de todo el proyecto ahora mismo.

#### Dos riesgos de disponibilidad en el codigo actual

- **No hay ningun limite de concurrencia.** Cada peticion hace `spawn` de una
  JVM, y nada impide que haya 200 a la vez. Con 1000 jugadores entrando no es una
  hipotesis: la maquina se queda sin memoria y caen todas, no solo las que
  sobraban. **Es el riesgo numero uno** y se arregla con una cola y un semaforo.
- **Cada JVM arranca con `-Xmx4096M`.** El pico real medido son 143 MB, y en las
  pruebas funciono perfectamente con `-Xmx512M`. Ese techo de 4 GB no se usa,
  pero autoriza a cada proceso a llegar ahi: 8 procesos son 32 GB autorizados en
  una maquina que no los tiene.

Nota menor: limitar los nucleos por copia
(`-XX:ActiveProcessorCount=1`, porque cada JVM dimensiona su recolector para
todos los nucleos de la maquina) dio entre un 12% y un 26% de mejora en dos
pasadas. La diferencia entre esas dos cifras es ruido de carga, asi que es una
ganancia modesta y no la palanca principal.

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

Con el codigo de hoy, 8 vCPU dan del orden de 0,4–0,6 aleatorizaciones por
segundo: **1000 nuevas partidas son unos 30 minutos de cola**. Con los dos
arreglos de arriba, la mitad.

Memoria: con un limite de 4 a 6 simultaneas y `-Xmx` bajado a 512 MB, son menos
de 3 GB. Los 8 GB son para no pensar.

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

## Antes de comprar hardware, cinco cambios

Ordenados por lo que dan frente a lo que cuestan. Los dos primeros valen mas que
duplicar la maquina B.

1. **Poner un limite de aleatorizaciones simultaneas, con cola.** Hoy no hay
   ninguno. Es lo que separa "los que sobran esperan" de "se cae para todos".
   Y la cola necesita decirle al jugador en que puesto va, porque con 1000
   personas esperar 28 minutos sin saberlo es indistinguible de estar roto.
2. **Cachear el fichero de ajustes.** Es 1 s de los 3,5, el resultado es
   determinista y las combinaciones del menu son pocas.
3. **Comprimir fuera del bucle de eventos.** `gzipSync` de 16 MB son 389 ms en
   los que el servicio entero esta congelado, no solo esa peticion.
4. **Bajar `-Xmx4096M` a 512 MB.** Medido: el pico real son 143 MB y con 512
   funciona. Quita el riesgo de que N procesos autoricen N × 4 GB.
5. **No subir `mgba.wasm.map`** a produccion.

Y una que no es de capacidad pero que a esta escala cambia de categoria: **las
salas viven en memoria**. Hoy reiniciar el servidor de salas es una molestia; con
500 partidas en curso son 500 partidas cortadas sin posibilidad de reconexion.
Ya esta apuntado como deuda en [ideas-pendientes.md](ideas-pendientes.md), pero
con 1000 jugadores sube de prioridad.

---

## Como se midio esto

Para poder repetirlo cuando cambie el codigo:

- **Estaticos**: `npm run build` y `gzip -c` sobre cada fichero de `dist/`.
- **Salas**: 1000 WebSockets reales contra el servidor, 500 parejas creadas y
  emparejadas, memoria del proceso muestreada cada 400 ms.
- **Aleatorizador**: peticiones `POST /randomize` reales con la ROM comprimida,
  en tandas de 1, 2, 4 y 8; CPU y disco con los contadores del sistema; y el jar
  llamado tambien por fuera del servicio para separar su coste del de la JVM.
- **Video**: `RTCPeerConnection.getStats()` de una pareja jugando, envolviendo el
  constructor desde fuera para no tocar el codigo de la aplicacion.

Las cifras salen de una maquina de 12 nucleos. Lo que se traslada a otra maquina
son las **proporciones** (que el servicio se come la mitad de su capacidad, que
escalar se estanca), no los segundos exactos.

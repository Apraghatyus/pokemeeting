# Ideas pendientes

Lo que falta, ordenado por lo que aporta frente a lo que cuesta. Cada entrada
dice también qué la bloquea, que suele ser lo que de verdad decide el orden.

---

## Leer la memoria del juego

**Es el cimiento de casi todo lo demás.** Sin esto no hay intercambios ni nada
que necesite saber qué Pokémon lleva cada uno.

El obstáculo está localizado: mGBA-wasm **no expone lectura ni escritura de
memoria**, ni scripting Lua. Solo control de ejecución, savestates y sistema de
ficheros.

La salida es que un savestate de GBA contiene la EWRAM entera, y el equipo
Pokémon de Rojo Fuego vive ahí. Así que se lee parseando savestates, y se
escribe editando el savestate y recargándolo.

El primer paso concreto es averiguar **en qué desplazamiento del savestate de
mGBA empieza la EWRAM**. Se determina una vez, empíricamente, y a partir de ahí
es aritmética.

Como el Soul Link automático quedó descartado (las reglas las llevan los
jugadores), no hace falta sondear la memoria continuamente: basta leerla en el
momento del intercambio, con los dos juegos en pausa. Eso convierte la lectura
por savestate de solución aceptable en solución cómoda.

---

## Intercambios de Pokémon

Depende de lo anterior. El diseño está razonado en
[intercambios.md](intercambios.md): **nada de emular el cable link**, que exige
sincronía ciclo a ciclo y se corrompe a la mínima, sino mover el bloque de 100
bytes de una partida a otra con confirmación en dos fases.

Queda pendiente de decidir sobre la marcha: validar los índices de especie,
movimientos y objetos contra la ROM **que recibe**, porque un índice fuera de
rango no da un Pokémon raro sino un "Bad Egg" o un cuelgue.

---

## Apodo de jugador

Pequeño y se nota mucho. Ahora la ventana del compañero muestra el nombre de su
fichero de ROM; debería mostrar su nombre. Basta con pedirlo al entrar en la
sala y mandarlo por el canal que ya existe.

---

## Biblioteca de ROMs

Hoy hay que volver a elegir el fichero en cada sesión. Guardarlo en IndexedDB
daría una lista de "mis juegos" y se elegiría una vez.

Ojo con el sitio: ya se guardan hasta tres partidas aleatorizadas de 16 MB cada
una. Antes de añadir más habría que mostrar cuánto ocupa todo y dejar limpiar.

---

## Más de dos jugadores

Hoy el límite son dos, y está tanto en el servidor (una sala tiene anfitrión e
invitado) como en el cliente (una sola conexión).

Para tres o más harían falta cuatro cosas: salas de N, una **malla de
conexiones** en el cliente (cada pareja conectada: 3 enlaces para 3 personas, 6
para 4), varias ventanas pequeñas y mezclar varias voces. Técnicamente va
sobrado, porque el vídeo es de 240×160 y pesa nada.

Lo que hay que decidir antes es **qué se quiere**, porque son dos diseños
distintos:

- **Un grupo jugando**, todos enviando y recibiendo. Malla completa.
- **Dos jugando y varios mirando**. Los espectadores solo reciben, lo que es
  mucho más barato y escala mejor.

---

## Semilla fija en el randomizer

Ahora dos jugadores con los mismos ajustes obtienen aleatorizaciones
**distintas**, porque el randomizer no permite elegir la semilla ni desde su
línea de órdenes ni desde el fichero de ajustes.

Se puede arreglar parcheando su código Java para aceptar `--seed` y compilando
el jar. Es un cambio pequeño, pero obliga a compilar Java y, al ser GPL-3, a
publicar el parche si se distribuye.

Mientras tanto, compartir los ajustes ya sirve para acordar **las mismas
reglas**, aunque cada partida salga diferente.

---

## Servidor TURN

WebRTC conecta directamente entre los dos navegadores usando un servidor STUN
público. Con NAT simétrica eso no basta y la conexión no llega a establecerse.

Un TURN retransmite el tráfico cuando la conexión directa falla. Es la pieza que
falta para que funcione "siempre" y no "casi siempre". Cuesta dinero o montar
uno propio (coturn).

---

## Game Boy Color

Casi gratis: **mGBA ya emula GB y GBC de forma nativa**. El registro de
plataformas ya los contempla. Lo que falta no es el emulador sino el
conocimiento del dominio, porque la segunda generación guarda los Pokémon de
otra manera que la tercera.

---

## Nintendo DS

Otro núcleo entero: melonDS compilado a WebAssembly. Existe, pero es un trabajo
aparte, y además cambia la interfaz: dos pantallas y entrada táctil.

---

## Nintendo 3DS

**Sin vía realista hoy.** No hay núcleo wasm viable, ni por madurez ni por
rendimiento. Queda listado para no perderlo de vista, no como plan.

---

## Ver el personaje del compañero en tu partida (tipo MMO)

La pregunta era si se puede hacer que aparezca el personaje de la otra persona
caminando por tu juego, como en un MMO.

**Con lo que tenemos ahora, no.** Y conviene entender por qué, porque no es
cuestión de esfuerzo sino de que son dos problemas distintos:

1. **Saber dónde está tu compañera** es alcanzable. Sus coordenadas y el mapa en
   el que está viven en la memoria del juego, así que con la lectura de memoria
   de más arriba se pueden leer y enviar por el canal que ya existe.

2. **Dibujarla dentro de tu juego** es otra cosa. El juego no tiene ningún
   concepto de "otro jugador": habría que inyectar código propio en la ROM
   (*hack* en ensamblador de GBA) que dibuje un personaje extra en unas
   coordenadas que le llegan de fuera, y escribir esas coordenadas en memoria
   **en cada fotograma**. Eso último ni siquiera es posible con nuestro acceso
   por savestates; haría falta recompilar mGBA exportando lectura y escritura de
   memoria.

Y las dos personas tendrían que jugar exactamente la misma ROM parcheada.

Los MMO de Pokémon que existen (PokeMMO, Pokémon Revolution) no son emuladores
con red añadida: son **clientes propios** que reimplementan el juego, hechos por
equipos durante años.

**Lo que sí está al alcance**, y da buena parte de la sensación, es un **mapa
compartido fuera del juego**: leer las coordenadas de los dos, dibujar un mini
mapa en la interfaz y ver el punto de cada uno moverse en tiempo real. "Estoy en
Ciudad Celeste, ven" sin escribirlo. Eso sale casi gratis una vez esté la
lectura de memoria, y no toca la ROM.

---

## Deudas técnicas conocidas

- **`jjs` desaparece en Java 15.** El fichero de ajustes del randomizer lo
  escribe la propia clase `Settings` a través de Nashorn, que ya no existe en
  Java moderno. Con una JRE nueva habrá que volver a pedir un `.rnqs` o portar
  el formato.
- **Las salas viven en memoria.** Si se reinicia el servidor de salas,
  desaparecen y no hay reconexión posible; hay que crear una nueva.
- **Sin límite de espacio visible.** Se guardan hasta tres partidas de 16 MB,
  pero no se muestra cuánto ocupa ni se avisa si el navegador se queda sin
  sitio.
- **El ruido de `unwind`.** Al cambiar de ROM, emscripten lanza una excepción
  `unwind` que aparece en la consola. Es normal y no rompe nada, pero ensucia.

# Estado del proyecto y lo que falta

Este fichero se escribe para que **leyéndolo solo** se sepa en qué punto está
esto: qué funciona ya, qué está a medias y qué ni se ha empezado. Si vienes de
nuevo o vuelves después de un tiempo, empieza aquí y no por el código.

Va en tres partes:

1. **Lo que ya funciona**, con la prueba que lo vigila.
2. **Lo que se arregló y por qué**, que vale la pena recordar porque varias de
   esas cosas estaban descritas como imposibles y no lo eran.
3. **Lo que falta**, ordenado por lo que aporta frente a lo que cuesta, y
   diciendo qué lo bloquea, que suele ser lo que de verdad decide el orden.

Las ideas sueltas también se apuntan aunque nadie las vaya a hacer mañana:
cuando llega el momento, lo caro no es escribir el código sino volver a averiguar
qué se sabía y qué había que decidir antes de empezar.

---

## Lo que ya funciona

Inventario de lo que está hecho, para no tener que deducirlo del código. Cada
línea lleva la prueba que lo vigila: si quieres saber si algo sigue en pie,
ejecútala en vez de fiarte de esta lista.

**Jugar**

- Emula **Game Boy Advance y Game Boy Color** con el núcleo de mGBA. Reconoce la
  consola por el contenido del fichero, no por la extensión.
  `test:cabeceras`, `test:gbc`, `test:juegos`
- **Mando táctil** que aparece solo cuando hace falta, decidido por cómo juegas
  y no por qué aparato es, con tres modos (auto, siempre, nunca). `test:mando`
- **Teclas reasignables**, guardadas por posición física del teclado y no por la
  letra. Z es A y X es B, como en cualquier emulador. `test:controles`
- **Avance rápido** conmutable: espacio en escritorio, botón propio en el mando.
  `test:controles`
- **Pantalla completa** que incluye partida, mando y equipo. `test:movil:mando`

**Jugar con alguien**

- **Sala con contraseña**, con el servidor de salas emparejando y apartándose.
  `test:signaling`, `test:session`
- **Vídeo de la partida del otro** a ~55 fotogramas por segundo. `test:fluidez`
- **Voz en directo**, con silencio propio y volumen del compañero aparte del
  juego. `test:voice`, `test:audio`
- **Reconexión automática** si se cae el enlace. `test:reconexion`
- La ventana del compañero se **arrastra a la esquina** que quieras.
  `test:arrastre`
- En móvil, **una pantalla a la vez** y se cambia deslizando. `test:cambio`

**Pokémon**

- **Paneles de equipo en vivo**, con sprite, nivel, tipos y estado, leídos de la
  memoria de la partida. `test:paneles`, `test:equipo`, `test:resumen`
- **Soul Link**: si cae tu Pokémon, se marca su pareja al otro lado, emparejados
  por el mote. `test:soullink`
- **Intercambios por dentro**, incluso entre dos copias aleatorizadas distintas,
  recalculando las estadísticas para la ROM que recibe. Falta la interfaz.
  `test:intercambio`, `test:estadisticas`
- La tabla de caracteres del juego, los dos abecedarios enteros. `test:texto`

**Aleatorizar**

- **Quince opciones**, de los Pokémon salvajes a los objetos de tienda, y cada
  una comprobada contra una ROM de verdad. `test:randomizer:options`
- **Semilla fija**: la misma semilla da la misma ROM byte a byte. `test:semilla`
- **Hasta tres partidas guardadas**, con nombre propio, compartiendo cupo entre
  todos los juegos. `test:partidas`, `test:randomizer:ui`
- **Recuperar una partida desde su semilla** sin haber descargado nada.
  `test:rehacer`
- **Llevársela a otro aparato** en un fichero con el guardado dentro.
  `test:llevarse`
- **Cola con límite** para que varias copias a la vez no tumben el servicio, y
  el jugador ve su puesto. `test:cola`, `test:cola:servicio`, `test:cola:ui`

**Montarlo**

- **Despliegue en servidor propio**, con script reejecutable o con Docker.
  Ver [despliegue.md](despliegue.md).
- **Enlace público temporal** para probar con alguien de fuera, por Cloudflare o
  por Tailscale. Ver [jugar-con-alguien-de-fuera.md](jugar-con-alguien-de-fuera.md).
- **Dimensionado medido** pieza por pieza para 1000 jugadores.
  Ver [capacidad.md](capacidad.md).

---

## Lo que se arregló, y por qué

Esto no es un historial: es lo que costó entender. Varias de estas estaban
descritas como difíciles o imposibles y no lo eran, y otras eran fallos cuya
causa no era la que parecía. Guardar el porqué ahorra volver a investigarlo.

- **Leer la memoria del juego.** Hecho y comprobado contra una partida real: la
  memoria empieza en `0x21000` del estado, el equipo en `0x02024284`, y el
  descifrado devuelve los motes que esa persona escribió.
  Ver [intercambios.md](intercambios.md).
- **Intercambios.** Hecho por dentro, incluso entre dos copias aleatorizadas
  distintas. Falta la parte de interfaz y el protocolo de dos fases.
- **Semilla fija en el randomizer.** Aquí ponía que no se podía sin parchear su
  código. Era falso: su clase `Randomizer` sí acepta una semilla, lo que no la
  expone es su línea de órdenes. Se la llama desde `jjs` y ya.
  Ver [randomizer.md](randomizer.md).
- **Game Boy Color.** Se juega y se aleatoriza Oro, Plata y Cristal. El núcleo
  ya los traía dentro.
- **La transmisión a tirones.** Se capturaba a 30 fotogramas por segundo y el
  juego corre a 60. Medido: llegaban 29,3 y se descartaba uno en ocho segundos,
  o sea que la red iba bien y faltaba la mitad de los fotogramas. Ahora llegan
  55,3. Lo vigila `npm run test:fluidez`.
- **Llevarse la partida a otro aparato.** El `.sav` no bastaba porque no dice en
  qué mundo estás; ahora se descarga un fichero con el guardado y la semilla.
- **Diseño para pantallas pequeñas.** Hecho: una pantalla a la vez y se cambia
  deslizando, el equipo en una tira horizontal, la barra encogida mientras se
  juega y el mando repartido a los lados al girar el teléfono. Medido, que es
  como se encontró el fallo: tumbado la partida se quedaba en 104 píxeles de
  293 porque el ancho se calculaba restando un hueco para la barra y el equipo
  que ahí no existen. Lo vigila `npm run test:movil:mando`.
- **El equipo rival en el panel.** Durante un combate salía el Pokémon del
  contrario. Su equipo ocupa memoria con la misma forma que el tuyo, así que el
  localizador elegía el grupo más largo de bloques seguidos, y contra un
  entrenador con más Pokémon ese grupo es el suyo. Ahora se ancla en la
  dirección documentada del equipo del jugador. `npm run test:equipo:rival`.
- **Pantalla completa.** En móvil dejaba el juego sin botones, porque se pedía
  sobre la pantalla sola y el navegador solo pinta ese elemento; en escritorio
  se quedaba en negro, porque la mesa se ajustaba a su contenido y el contenido
  se medía contra la mesa. Ahora se pide sobre un marco que lleva partida,
  mando y equipo.
- **Cuánto consume y qué hace falta para 1000 jugadores.** Medido pieza por
  pieza. Ver [capacidad.md](capacidad.md).
- **La ñ se comia la s.** La tabla de caracteres tenia la 'ñ' en 0xe7, que es la
  's' -0xd5 es la 'a', mas dieciocho-, asi que todo mote con 's' salia con 'ñ':
  un Pokemon llamado "Huesitos" aparecia como "Hueñitoñ". Lo que lo escondia es
  que los nombres de especie de la ROM van en mayusculas, asi que nada de lo que
  se probaba lo tocaba. La ñ real es 0x29 y la Ñ 0x14, comprobadas buscando
  "pequeño" y "SEÑOR" en la ROM espanola. Lo vigila `npm run test:texto`, que
  recorre los dos abecedarios enteros en vez de mirar letras sueltas.
- **El panel se barajaba solo, y quien pelea.** Eran dos pendientes y resultaron
  ser uno. El panel no leia mal: tercera generacion **intercambia de verdad las
  ranuras del equipo** cuando sacas otro Pokemon, asi que el que entra pasa a ser
  el primero. Se arregla recordando el orden en que aparecieron, identificados
  por personalidad. Y de ahi cae gratis lo otro: si el que pelea esta siempre en
  la ranura 0, iluminar esa ranura es iluminar al que pelea, **sin tener que
  detectar el combate**, que es lo que bloqueaba esto desde el principio.
  `npm run test:orden`
- **La cola del aleatorizador.** No había ningún límite de copias simultáneas,
  que es lo que separa "los que sobran esperan" de "se cae para todos". Con la
  cola, los ajustes en caché y la compresión fuera del bucle de eventos, medido
  A/B en la misma máquina: de 0,48 a 0,78 copias por segundo. Ojo con la lección
  que dejó: **asíncrono no crea capacidad** si la máquina ya va a tope de CPU,
  solo reparte quién espera.
- **Un aviso apagaba media aplicación.** Exportar una partida todavía sin
  guardar llamaba a `fail()`, que además del mensaje pone el emulador en estado
  de error. Eso apagaba toda la barra de botones -piden estar "running"- y de
  paso detenía la lectura del equipo, y nada volvía a limpiarlo. Un mensaje de
  ayuda dejaba la pantalla inservible para siempre. Ahora los avisos son una
  cosa aparte de los fallos: se cierran y se van solos al resolverse.
  `test:controles`
- **El contador de partidas no cuadraba con lo que se veía.** Decía 1/3 y debajo
  solo había dos huecos. No faltaba ninguno: el tercero lo ocupaba una partida
  de otra ROM, y esas solo se enseñaban con el cupo lleno. El tope es de tres en
  total y lo comparten todos los juegos, así que ahora se ven todas, cada una
  diciendo de cuál es. `test:randomizer:ui`
- **Los menús.** El de ajustes y el del randomizer pasaron de una columna de
  botones a dos columnas de tarjetas, con la forma de un diseño que vino de
  fuera y los colores de siempre. De paso: las partidas se pueden **nombrar**
  -antes todas se llamaban por lo que se había aleatorizado y salían con el
  mismo texto recortado- y la pantalla de "partida aleatorizada" dejó de
  spoilear los iniciales. `test:menu`, `test:randomizer:ui`
- **El túnel daba un enlace que no era.** Buscaba cualquier `*.trycloudflare.com`
  en la salida de cloudflared, y ahí aparece también su propio endpoint interno,
  así que a veces anunciaba `api.trycloudflare.com` como si fuera tu enlace. Y
  su comprobación de "modo túnel" no comprobaba nada, porque `fetch` de Node
  descarta la cabecera `Host` por especificación. Las dos cosas daban un enlace
  roto sin avisar. Ver [jugar-con-alguien-de-fuera.md](jugar-con-alguien-de-fuera.md).

---

## Los otros menús

**Lo siguiente.** El de ajustes ya se repasó: reiniciar avisa de lo que se
pierde, exportar e importar dejaron de hablar de extensiones, el avance rápido
salió de ahí porque se usa sobre la marcha, y se puede copiar la semilla en
cualquier momento. Los otros dos no se han tocado.

**El del aleatorizador.** Es el más largo de todos: catorce opciones con su
explicación, la lista de partidas guardadas y el sitio donde pegar una semilla.
En escritorio se lee bien; en un teléfono es un rollo de desplazamiento y no
está claro qué hay que marcar para empezar.

**Los menús en móvil.** Medido en un Pixel 5: el de ajustes son 1590 píxeles de
contenido en una ventana de 727, o sea que hay que bajar 897 para llegar al
final, más de una pantalla entera. Y sus 22 botones miden todos menos de 44
píxeles de alto, que es el mínimo que se suele dar por cómodo para el dedo.

Lo que hay que decidir antes de tocarlos: si en móvil conviene partirlos en
pestañas o en secciones plegadas, porque alargarlos más no arregla nada.

---

## Saber que hay un combate en marcha

Se intentó y se tumbó, que es más útil que no haberlo intentado: el juego copia
al Pokémon que sale a su estructura de combate, así que su personalidad aparece
dos veces en memoria y parecía bastar con buscarla.

No basta. **Esa copia sigue ahí después del combate**, así que decía que el
Bulbasaur seguía peleando mientras el jugador caminaba por el mapa.

**Lo que lo bloqueaba ya no lo bloquea.** Iluminar al que pelea está hecho sin
esto: como el juego sube al que sale a la ranura 0, basta con iluminar esa
ranura. Así que esta entrada deja de ser urgente y pasa a ser lo que falta para
lo demás.

Para qué sigue haciendo falta:

- **La pantalla de fin de partida**, para distinguir "se te cayó el equipo" de
  "estás a mitad de un combate y te quedan tres en la caja".
- **Las medallas y la Liga**, que son banderas del mismo sitio.
- Dejar de decir "al frente" y poder decir "peleando" sin mentir el resto del
  tiempo.

Se encuentra comparando dos estados de la misma partida, uno en mitad de una
pelea y otro caminando, y mirando qué cambia: es el método con el que se
encontró todo lo demás.

**Se intentó automatizarlo y no salió**, y queda apuntado para no repetirlo: se
puede meter un guardado y atravesar la intro a base de pulsar A, pero llegar a
un combate pide navegar por el mapa, y eso desde una prueba es demasiado frágil.
El guardado que había era de una partida recién empezada, sin equipo. Lo que
hace falta es que alguien exporte los dos estados **desde una partida de
verdad**, con el botón de "Exportar estado" que ya está en los ajustes.

---

## Intercambios en la interfaz

El mecanismo está hecho y comprobado; falta la parte que ve el jugador: elegir
el Pokémon, mandar los cien bytes por el canal de datos -que ya está abierto- y
confirmar en dos fases para que nadie duplique ni pierda nada si se corta la
conexión.

Lo que se enseña antes de aceptar ya sabe decirlo `describirTrato`: que entregas
un BULBASAUR y que en la copia del otro esa especie es de otro tipo.

---

## Segunda generación por dentro

Oro, Plata y Cristal se juegan y se aleatorizan, pero no se les lee el equipo:
en segunda generación los Pokémon ocupan 48 bytes, no van cifrados y los motes
viven en listas aparte.

La buena noticia es que el sitio donde encaja ya existe: hay un registro de
lectores y añadir una generación es escribir un módulo al lado, sin tocar ni la
interfaz ni la red.

---

## Apodo de jugador

Pequeño y se nota. La ventana del compañero dice "Tu compañero" porque no
sabemos cómo se llama. Basta con pedirlo al entrar en la sala y mandarlo por el
canal que ya existe.

---

## Mapa de dónde has capturado

En un Soul Link solo se captura una vez por zona, y hoy eso se lleva de memoria
o en un papel aparte. La idea es marcarlo en un mapa: dónde cayó cada Pokémon y
qué rutas te quedan.

**Y lo bueno es que el dato ya lo tenemos.** No hay que apuntarlo a mano ni
adivinarlo: cada Pokémon lleva dentro el sitio donde lo capturaste. Está en la
subestructura `M` de sus cien bytes, que el lector ya localiza -de ahí sale la
bandera de huevo, que vive cuatro bytes más allá-. Son dos campos: el lugar y la
información de origen (nivel al que lo encontraste, juego y bola).

Así que esto es bastante menos trabajo de lo que parece. Lo que falta:

- **Traducir el número de lugar a un nombre.** La tabla está en la ROM, igual
  que los nombres de especie, y se encuentra de la misma forma.
- **Dibujar el mapa.** Aquí sí hay decisión: un mapa de verdad de Kanto pide una
  imagen y las coordenadas de cada zona, mientras que una lista de rutas con su
  Pokémon al lado da casi la misma información por mucho menos.
- **Que valga para los dos.** Por el canal de datos ya viaja el equipo; mandar
  también el lugar es un campo más en el mismo mensaje. Ahí es donde se vuelve
  útil de verdad: ver de un vistazo qué rutas ha gastado cada uno.

Ojo con una cosa: el lugar lo lleva el Pokémon, así que un Pokémon que se muere
se lleva el dato con él. Si el mapa tiene que recordar rutas gastadas aunque la
pareja haya caído, hay que guardarlo por nuestra cuenta según se vea.

---

## Pantalla de fin de partida

Cuando se te cae el equipo entero, un modal que cierre la historia: hasta dónde
llegaste, qué medallas sacaste y, si llegaste a la Liga, en qué combate se acabó.
Las medallas conseguidas a color y las que faltaron en gris o con el borde
punteado, para que se vea de un vistazo lo que quedó por hacer.

Y dos salidas: **seguir jugando** o **reiniciar**.

**La mitad ya está al alcance.** El estado de cada Pokémon se lee en cada
vistazo, debilitado incluido: de ahí sale la lógica del Soul Link. Saber que han
caído los seis es mirar lo que ya se mira.

Lo que falta es lo otro:

- **Las medallas.** Son banderas en la memoria del juego, así que se leen igual
  que el equipo, pero hay que encontrar dónde. El método es el que ya funcionó
  dos veces: dos estados de la misma partida, uno antes y otro después de ganar
  un gimnasio, y mirar qué bit cambió.
- **La Liga.** Igual, pero más fino: hay que distinguir "estoy en el Alto Mando"
  de "voy por el segundo". Probablemente sea un contador y no una bandera.

**Dos trampas que conviene ver antes de empezar**, porque las dos dan un fin de
partida falso:

1. **Las cajas no se leen.** Hoy solo se mira el equipo de seis. En una Nuzlocke
   lo normal es mandar los caídos a la caja, así que el equipo vacío o debilitado
   sí marca el final; pero quien guarde Pokémon sanos en la caja vería "fin de
   partida" teniendo con qué seguir.
2. **El juego no se acaba cuando te caes.** Pierdes y vuelves al Centro Pokémon,
   así que el final no lo decide el juego: lo decide la regla del reto. Esto no
   es leer un dato, es aplicar una norma, y conviene que el modal lo diga en vez
   de dar por hecho que la partida murió.

### Seguir jugando no cuenta

Esto enlaza con las estadísticas, y es la parte que hay que decidir **antes** de
guardar el primer dato: si se puede continuar después de perder, lo que venga
después no puede contar para el historial. Si no, el porcentaje de victorias no
mide nada: bastaría con seguir hasta ganar.

O sea que la partida queda marcada en el momento en que se cae el equipo, y
seguir jugando es jugar, no competir. Decirlo en el propio modal evita la
discusión después.

---

## Estadísticas y perfiles

La idea es tener un sitio con el historial: cuántas partidas aleatorizadas has
jugado, cuántas terminaste y cuántas se fueron al traste, y poder ordenarlas por
el tipo de aleatorización.

**Lo que hay que saber antes de empezar es que esto cambia el proyecto de
categoría.** Hoy el servidor no guarda absolutamente nada: ni partidas, ni
guardados, ni ROMs, ni quién eres. Esa es la razón de que no haya base de datos,
ni copias de seguridad, ni nada que respaldar, y también parte de por qué la
línea legal está limpia. Unos perfiles con historial significan cuentas, datos
personales y una base de datos de verdad.

Hay un punto intermedio que vale la pena considerar antes: **el historial vive
en tu navegador**, sin cuenta y sin servidor. Da estadísticas de tus propias
partidas y las categorías por tipo de aleatorización, que es la mayor parte de
lo que se quiere, y no cambia nada de lo de arriba. Lo que no da es comparar con
tu compañera ni recuperar el historial desde otro aparato.

La otra pregunta, y no es menor: **qué cuenta como victoria y como derrota**. En
una partida aleatorizada no hay un final claro: ¿la Liga?, ¿quedarse sin equipo?,
¿abandonar? Sin decidir eso, el porcentaje no significa nada. Conviene fijarlo
antes de guardar el primer dato, porque cambiarlo después invalida el historial
entero.

Esa pregunta es la misma que plantea la pantalla de fin de partida, un poco más
arriba, y las dos se contestan a la vez: ahí se decide también que seguir
jugando después de caer no cuente.

Las partidas guardadas ya llevan parte de lo que haría falta -nombre, semilla,
ajustes, de qué juego es, qué se aleatorizó y cuándo se jugó-, así que las
categorías por tipo de aleatorización salen casi solas de lo que ya se guarda.

### El panel

La idea es un sitio con el resumen de tu perfil: porcentaje de victorias,
cuántas aleatorizadas has terminado, cuántas se te cayeron, con qué juegos
juegas más y qué opciones sueles marcar.

Casi todo eso sale de dos datos por partida -**cómo acabó** y **cuándo**- más lo
que ya se guarda. O sea que lo caro no es el panel: es acordar qué se apunta, y
apuntarlo desde el principio. Un historial al que le falta el primer año no se
puede reconstruir.

Tres cosas que conviene fijar antes de dibujar nada:

- **Qué cuenta como terminada.** Está arriba y es la decisión que lo gobierna
  todo.
- **Qué pasa con las que siguen abiertas.** Una partida a medias no es ni
  victoria ni derrota, pero si no se cuenta de alguna forma el porcentaje sale
  siempre favorable: solo se cierran las que acaban bien o las que se caen del
  todo, y abandonar no deja rastro.
- **Si el porcentaje se enseña con pocas partidas.** Con tres jugadas, un 33% no
  dice nada y parece que sí. Suele ser mejor enseñar el número crudo hasta tener
  unas cuantas.

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

## Servidor TURN

WebRTC conecta directamente entre los dos navegadores usando un servidor STUN
público. Con NAT simétrica eso no basta y la conexión no llega a establecerse.

Un TURN retransmite el tráfico cuando la conexión directa falla. Es la pieza que
falta para que funcione "siempre" y no "casi siempre". Cuesta dinero o montar
uno propio (coturn).

El síntoma es reconocible: la sala se crea, los dos entráis y la pantalla del
compañero no llega nunca.

---

## Nintendo DS

Hay una prueba hecha que no toca la aplicación
([tools/nds/LEEME.md](../tools/nds/LEEME.md)): el núcleo arranca en el
navegador, va al 82% de la velocidad real y deja sacar estados, que es por donde
se leería el equipo.

Ese 82% hay que leerlo con cuidado: está medido con una ROM de relleno, donde el
emulador casi no trabaja. Hace falta una ROM de verdad para saberlo.

Lo que hay que querer antes de meterlo:

- **La licencia.** Los núcleos de DS y el frontend que los empaqueta son GPL-3.
  El de ahora es MPL-2.0. Meter uno GPL dentro de la aplicación y repartirla la
  convierte entera en GPL-3.
- **Dos pantallas y táctil**, que cambian la colocación, lo que se le envía al
  compañero y el mando en móvil.
- **Los intercambios habría que rehacerlos.** Cuarta generación usa otra
  estructura y el estado sería de otro emulador.

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
   el que está viven en la memoria del juego, que ya se sabe leer.

2. **Dibujarla dentro de tu juego** es otra cosa. El juego no tiene ningún
   concepto de "otro jugador": habría que inyectar código propio en la ROM
   (*hack* en ensamblador de GBA) que dibuje un personaje extra en unas
   coordenadas que le llegan de fuera, y escribir esas coordenadas en memoria
   **en cada fotograma**. Eso último no se puede con el acceso por savestates,
   que cuesta unos milisegundos cada vez; haría falta recompilar mGBA
   exportando lectura y escritura de memoria.

Y las dos personas tendrían que jugar exactamente la misma ROM parcheada.

Los MMO de Pokémon que existen (PokeMMO, Pokémon Revolution) no son emuladores
con red añadida: son **clientes propios** que reimplementan el juego, hechos por
equipos durante años.

**Lo que sí está al alcance**, y da buena parte de la sensación, es un **mapa
compartido fuera del juego**: leer las coordenadas de los dos, dibujar un mini
mapa en la interfaz y ver el punto de cada uno moverse en tiempo real. "Estoy en
Ciudad Celeste, ven" sin escribirlo. No toca la ROM.

---

## Deudas técnicas conocidas

- **`jjs` desaparece en Java 15.** El fichero de ajustes del randomizer lo
  escribe la propia clase `Settings` a través de Nashorn, que ya no existe en
  Java moderno. Y de ahí sale también la semilla fija, así que sin `jjs` las
  partidas dejan de poderse rehacer. Con una JRE nueva habría que portar el
  formato del fichero de ajustes.
- **Las salas viven en memoria.** Si se reinicia el servidor de salas,
  desaparecen y no hay reconexión posible; hay que crear una nueva. Con dos
  jugadores es una molestia; con quinientas parejas serían quinientas partidas
  cortadas de golpe, así que sube de prioridad en cuanto esto crezca.
- **El mapa de depuración del núcleo se sube a producción.** Son 448 KB de
  `mgba.wasm.map` que solo pide el navegador con las herramientas abiertas.
  No hace daño, pero no pinta nada en el servidor.
- **Sin límite de espacio visible.** Se guardan hasta tres partidas de 16 MB,
  pero no se muestra cuánto ocupa ni se avisa si el navegador se queda sin
  sitio.
- **La prueba de paneles falla de vez en cuando.** Una de cada bastantes, y pasa
  al repetirla sin tocar nada: es una carrera, no una rotura. Se midieron las
  búsquedas en la ROM por si eran ellas y no lo son (233 ms los nombres, 52 las
  estadísticas, 16 la tabla de Pokédex).
- **El ruido de `unwind`.** Al cambiar de ROM, emscripten lanza una excepción
  `unwind` que aparece en la consola. Es normal y no rompe nada, pero ensucia.

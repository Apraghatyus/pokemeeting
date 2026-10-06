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
- **El panel en el mismo orden que el juego**, y **borde amarillo al que está
  peleando de verdad**, encontrado por su copia de combate en memoria. Fuera de
  combate no se ilumina a nadie. `test:orden`, `test:combate`, `test:bordes`
- **Cartel de fin de partida, en sus dos finales.** Derrota por el mensaje del
  juego al caer el equipo; victoria por el del Salón de la Fama. Con medallas,
  Liga, equipo y sprites. `test:fin`, `test:derrota`, `test:victoria`,
  `test:fin:ui`
- **Medallas con su imagen de verdad**, las conseguidas a color y las que
  faltaron apagadas. Falta medir dónde vive el byte. `test:medallas`

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
- **A pantalla completa en vertical, el equipo "desaparecia".** No desaparecia:
  quedaba DEBAJO de la partida. La regla de pantalla completa, escrita para
  escritorio, reparte el alto entre la mesa y el mando con `flex: 1`, y lleva dos
  clases y una pseudoclase contra la sola clase de la regla del movil, que ya
  decia lo correcto. Ganaba la de escritorio, el mando se quedaba con casi todo
  el alto y la partida ya no cabia en la mesa. Medido en 360x740: la mesa recibia
  214 pixeles para una partida que pide 229. Es el mismo tipo de fallo que el del
  equipo del companero, dos entradas mas abajo: una regla de escritorio con mas
  especificidad ganando dentro de una @media.
- **Al cambiar de pantalla no cambiaba el equipo.** En movil solo cabe un equipo
  a la vez, y deslizar a la partida del companero seguia ensenando el tuyo. La
  pantalla llevaba su estado dentro del componente y el equipo lo llevaba la
  aplicacion, asi que podian discrepar. Ahora es **un solo estado**: "estoy
  mirando lo suyo" decide las dos cosas, y el boton y el gesto mueven lo mismo.
  Lo vigila `test:cambio`, que ya probaba el gesto y ahora comprueba tambien que
  el equipo lo sigue.
- **En movil, el equipo del companero se quedaba en columna.** Dos fichas
  apiladas en vez de una tira, y eso empujaba el mando fuera de la pantalla. La
  causa no estaba en las clases, que estaban bien: en escritorio su lista crece
  de abajo arriba con `column-reverse`, y esa regla lleva **dos** clases contra
  **una** de la del movil. Las @media no suman especificidad, asi que la de
  escritorio ganaba tambien en el movil. El equipo propio salia bien, que es lo
  que lo hacia dificil de ver. Medido en 360: la lista ocupaba 158 pixeles y las
  fichas estaban a alturas distintas; en tira son 77 y una sola fila.
- **El pie del modal del aleatorizador se salia de la pantalla en movil.** No
  cabia en una fila y no se partia: los botones no encogen -asi debe ser, un
  boton cortado no se puede pulsar- asi que el unico que cedia era el texto de
  creditos, que se estrujaba en cinco lineas de una palabra mientras el boton se
  salia igual por la derecha. Medido en 360: el pie pedia 551 pixeles para un
  modal de 326, y los botones llegaban hasta el 418 con el modal acabando en
  343. Ahora se apila. Las dos cosas las vigila `test:movil:colocacion`, que lee
  lo que calcula el navegador y no las clases, porque ahi no estaba el fallo.
- **El panel no se parecia a la lista del juego, y el borde senalaba al que no
  era.** Los dos fallos tenian la misma raiz: se dio por hecho que tercera
  generacion sube a la ranura 0 al Pokemon que sale a pelear. Sobre esa idea se
  construyo un orden "estable" -para que el panel no se barajara en combate- y un
  resaltado que se limitaba a iluminar la ranura 0, sin tener que detectar el
  combate.
  Lo desmintio una partida: el equipo en el juego era [PEZGATO, A BUENO], el
  panel ensenaba [A BUENO, PEZGATO] y la marca estaba en PEZGATO mientras peleaba
  A BUENO. El juego **no** mueve las ranuras; se apunta aparte cual esta en el
  campo.
  Asi que el orden es el del juego y ya esta -es el unico que el jugador puede
  comprobar mirando la pantalla- y quien pelea se busca de verdad: durante el
  combate el juego guarda una copia de 88 bytes del que esta en el campo, y
  dentro esta su **personalidad**, que ya usamos para identificarlos. O sea que
  no hace falta localizar ninguna direccion nueva, se buscan las personalidades
  que ya conocemos. `test:orden`, `test:combate`.
- **El borde de estado borraba el del que pelea.** Al dormir al Pokemon que
  estaba en el campo se le iba la marca amarilla. Las dos reglas usan box-shadow
  y la del estado va despues en la hoja, asi que ganaba: un fallo de cascada, no
  de logica. Son dos datos distintos -quien pelea y como esta- y los dos tienen
  que verse. `test:bordes` lee el estilo ya calculado por el navegador, que es
  donde se veia, y comprueba los seis estados.
- **El volumen se reiniciaba al cargar otra ROM.** Se vio al aleatorizar: la
  copia nueva arrancaba sonando aunque tuvieras el juego silenciado. Al medirlo
  resulto ser mas viejo y mas gordo de lo reportado -ya pasaba con la **primera**
  ROM de la sesion: la barra decia 70% y el juego sonaba al 100%-, porque para
  mGBA el volumen es una propiedad del juego cargado y `loadGame` lo pone a tope.
  Se arregla volviendo a ponerlo despues de cada carga, en la capa que envuelve
  el nucleo, que es donde estan los dos sitios que cargan juego. El nivel **se
  pasa** en vez de leerlo del nucleo antes de cargar: sin juego cargado
  `getVolume()` devuelve 0, asi que preservarlo asi silenciaba la primera ROM.
  Esa version intermedia llego a escribirse y la delato la medicion, no la
  lectura. `test:volumen` compara lo que suena con lo que dice la barra.
- **El fin de partida saltaba en el combate del laboratorio.** Y es la segunda
  vez que esta regla se equivoca, en la direccion contraria a la primera (ver
  abajo), asi que las dos se cuentan juntas o no se entiende la de ahora. Al
  quitar el minimo de dos Pokemon, la regla paso a ser "si lo que tienes esta
  debilitado, se acabo", y eso incluye el tutorial: el cartel salia encima del
  dialogo del propio rival, en el minuto dos. Lo que separa los dos casos no es
  cuantos Pokemon tienes, es **quien lo dice**: al perder de verdad el juego te
  manda al Centro Pokemon y lo anuncia, y al perder en el laboratorio no pasa
  nada de eso. Asi que ahora hay dos caminos: si lo dice el juego se acaba
  aunque tengas uno solo, y si lo deducimos del equipo caido hacen falta dos
  Pokemon distintos, que es justo lo que el laboratorio no puede darte. El
  precio: en un idioma cuyo mensaje no se reconozca, perder con un solo Pokemon
  no saldria. `test:fin` prueba el mismo equipo por los dos caminos.
- **El fin de partida no saltaba con un solo Pokemon.** La regla exigia haber
  tenido DOS Pokemon distintos, para que el combate del laboratorio quedara
  fuera por construccion. Estaba mal, y lo demostro el primero que lo jugo: salio
  con su inicial a buscar el segundo, se lo debilitaron antes de capturar nada, y
  el cartel no aparecio. Perder antes de la primera captura no es un caso raro,
  es de las formas mas normales de que se acabe una Nuzlocke.
- **Reconocer la derrota por lo que dice el juego.** Mejor señal que mirar la
  vida: al perder, el Centro Pokemon te cura, asi que "todos a cero" dura unos
  segundos y entre dos lecturas se puede escapar. El mensaje "<nombre> fue
  corriendo a un CENTRO PKMN" lo dice el juego en el momento exacto, y se puede
  leer porque lleva tu nombre dentro: para sustituirlo, el juego tiene que armar
  la frase en memoria en vez de pintarla desde la ROM. El ancla elegida
  -"corriendo a un"- aparece **una sola vez** en los dieciseis megas de la ROM.
  `npm run test:derrota`
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

## Las medallas: falta medir la direccion

Lo de alrededor esta hecho: se leen del estado, se dibujan las ocho -las
conseguidas a color y las que faltaron apagadas- y salen en la pantalla de fin
de partida. Lo unico que falta es **donde** vive el byte.

Y no se puede deducir. Las medallas son banderas, bits sueltos, y un byte de
banderas no se distingue de cualquier otro byte: no tiene forma que buscar, al
reves que el equipo, que se encuentra por su checksum. Rojo Fuego y Verde Hoja
ademas **mueven sus bloques de guardado**, asi que tampoco vale una direccion
fija, que es la misma razon por la que el equipo se busca en vez de leerse de
una constante.

Hay herramienta para medirlo: `npm run buscar:medallas -- antes.bin despues.bin`.
Compara dos estados de la misma partida, uno antes y otro despues de ganar un
gimnasio, y se queda con los bytes que cuadran con "las medallas se ganan en
orden y no se pierden" -o sea, los que solo valen 0, 1, 3, 7...-. Con un tercer
estado de otra medalla mas, lo que quede se cae solo.

Para sacar los dos estados: menu ⋮ → Exportar estado, antes de entrar al
combate del lider y despues de ganar.

Mientras no se mida, `leerMedallas` devuelve "no se sabe" y la tarjeta no sale.
Es deliberado: enseñar cero medallas a quien tiene cuatro miente mas que
callarse. Y cuando se mida, hay una comprobacion que protege de medir mal: si el
byte no es un prefijo de bits, se da por desconocido en vez de contar bits de
cualquier sitio.

---

## Distinguir "hay combate" de "lo hubo"

La copia de combate sirve para saber **quién** pelea, y eso ya está hecho: el
juego copia al Pokémon que sale a una estructura de 88 bytes con su personalidad
dentro, y se busca ahí. Lo que esa copia **no** dice es si el combate sigue en
marcha, y está medido: sigue ahí después de acabar, así que decía que el
Bulbasaur seguía peleando mientras el jugador caminaba por el mapa.

Aquí hubo escrito que esto ya no bloqueaba nada, porque "el juego sube al que
sale a la ranura 0". **Eso era falso** y lo desmintió una partida: el equipo era
[PEZGATO, A BUENO], peleaba A BUENO y la ranura 0 seguía siendo PEZGATO. El
resaltado se rehízo buscando la copia, no mirando la ranura.

Lo que falta por esto, hoy:

- **Apagar el borde entre combate y combate. PEDIDO TRES VECES.** Es lo único
  que falta de esa pantalla y lo único que bloquea un comando. Al acabar la pelea la marca se queda sobre el último que
  peleó, porque la copia no se borra. Antes del primer combate de la sesión no se
  ilumina nadie, que es lo correcto; el hueco es el "después".

  **Todo lo demás está puesto.** `enCombate` ya se consulta antes de señalar a
  nadie y `DIRECCION_EN_COMBATE` está vacío a propósito: añadir una entrada ahí
  es lo único que falta. Y mientras esté vacío dice "no lo sé", que no es lo
  mismo que "no hay combate": solo lo segundo apaga la marca, así que un hueco
  no quita lo que ya funciona.

  Hay herramienta: `npm run buscar:combate -- --dentro c1.bin --fuera m1.bin`.
  Busca banderas en los dos sentidos -las que se encienden al entrar en combate y
  las que se apagan- porque las dos existen y no se sabe cuál aparecerá antes.
  Para sacar los estados, menú ⋮ → Exportar estado: uno con el menú de LUCHA en
  pantalla y otro caminando por el mapa. Con dos de cada, de combates distintos y
  de sitios distintos, lo que quede ya es candidato de verdad.
- **La pantalla de fin de partida**, para distinguir "se te cayó el equipo" de
  "estás a mitad de un combate y te quedan tres en la caja".
- **Las medallas y la Liga**, que son banderas del mismo sitio.

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

## El emulador en móviles flojos

Reportado tres veces, dos de ellas por otras personas: el juego va lento, el
vídeo que llega al compañero sale borroso y deformado, y acaba en pantalla en
blanco o en "la página no responde".

**La teoría de que el núcleo es "de 64 bits" no se sostiene, y conviene zanjarla
antes de gastar trabajo ahí.** mGBA aquí es WebAssembly, que es de 32 bits y no
tiene arquitectura propia: el navegador lo traduce al procesador que haya, ARM
incluido. Un móvil no puede "no poder con la arquitectura". Lo que sí puede es no
tener CPU suficiente, que es otra cosa y se arregla en otro sitio.

**Lo que de verdad pasa**, según lo que se ha podido medir y lo que dicen los
avisos del navegador:

- El emulador corre **en el hilo principal**, el mismo que pinta la interfaz. No
  hay ni Worker ni OffscreenCanvas. Por eso el aviso que sale es "la página no
  responde": no es que el emulador vaya lento, es que mientras emula no deja
  respirar a nada más.
- Encima va la codificación del vídeo para el compañero, a 60 por segundo.
- Y cuando el sistema anda justo de memoria, le quita al navegador el contexto de
  vídeo. Eso ya está contemplado: se avisa en vez de dejar un rectángulo blanco
  (`test:sin:video`), pero avisar no es arreglar.

**Lo que NO es.** Tres sospechas medidas y descartadas, para que nadie vuelva a
gastar un rato en ellas:

- **Leer el equipo cada tres segundos**: 12 ms con la CPU frenada seis veces.
- **El rebobinado y el autoguardado del núcleo**, que vienen de fábrica
  encendidos y no se usan en ningún sitio del programa. Parecía el premio gordo
  -rebobinar guarda una instantánea por fotograma- y apagarlos no mueve la aguja:
  2,51 ms de CPU por fotograma con ellos y 2,59 sin ellos, que es ruido. Ojo con
  una trampa al reintentarlo: esos ajustes **no van en la fábrica**, que solo
  acepta el canvas, sino en `setCoreSettings`. Pasarlos al crear el núcleo no da
  error, simplemente no hacen nada, y la primera medición salió "sin efecto" por
  eso y no por lo que se creía.
- **Que el núcleo sea "de 64 bits"**: ver arriba.

**La forma de medirlo**, porque la primera que se intentó no servía: en
fotogramas por segundo el ruido es de ±30% -en la misma configuración salieron
24 y 39- y no se puede concluir nada. Lo que sí se queda quieto es el **tiempo de
CPU por fotograma** (`Performance.getMetrics` → `TaskDuration`, dividido por los
fotogramas que pinta el lienzo): tres medidas seguidas dieron 2,46, 2,46 y 2,52.
Esa es la que vale, y además es la que decide si un teléfono flojo llega.

**La memoria, que es la sospecha viva.** `measureUserAgentSpecificMemory` -que se
puede usar porque la página está aislada- reporta un bloque de **257 MB por cada
hilo** del núcleo más unos 299 MB de la ventana. Casi seguro es la MISMA memoria
del wasm contada una vez por hilo, así que lo real rondará los 300 MB y no el
gigabyte largo que suma la API; conviene comprobarlo antes de citarlo. Aun así,
300 MB en un teléfono de 1,5 GB explica bien tanto el "la página no responde"
como que el sistema le quite el contexto de vídeo. Y ese tamaño viene dentro del
wasm: para bajarlo hay que recompilar mGBA, no se puede desde aquí.

Caminos, de más a menos prometedor:

1. **Llevar el emulador a un Worker con OffscreenCanvas.** Es el arreglo de
   verdad: la interfaz deja de competir con la emulación y se acaban los "no
   responde". Es también el más caro, porque hoy el núcleo recibe un canvas del
   DOM y todo lo demás cuelga de ahí.
2. **Bajar lo que cuesta compartir pantalla en los aparatos flojos.** Ojo: bajar
   a 30 fps ya se probó y se midió, y se descartó porque no se nota como "ir a la
   mitad" sino como tirones. Si se vuelve a intentar, que sea bajando resolución
   antes que fotogramas, y midiendo.
3. **Dejar elegir**: en un móvil que no da abasto, poder apagar el envío de vídeo
   y quedarse solo con el equipo y la voz. Es poco trabajo y devuelve la partida
   a quien hoy no puede jugar.

Cambiar de núcleo es la opción que peor sale: el resto del programa -equipo,
medallas, combate, fin de partida- está construido sobre leer **savestates de
mGBA**. Otro núcleo significa rehacer todo eso.

---

## El cable link: intercambiar y combatir dentro del juego

La idea es que funcionen el intercambio y el combate **del propio juego**, con su
sala de unión y todo. Esto es lo que se ha podido averiguar antes de intentarlo,
porque la respuesta corta es que hay dos caminos y uno de ellos está cerrado por
una razón que no es técnica.

**Qué hace falta de verdad.** Un cable link son dos consolas hablando por el
puerto serie con un ritmo muy fino: los juegos se mandan palabras de 16 bits y se
esperan con plazos contados en fotogramas. Para emularlo entre dos máquinas hacen
falta tres cosas, y las tres a la vez:

1. Que el núcleo deje enchufarle desde fuera lo que "llega por el cable".
2. Que los dos núcleos vayan **en paso cerrado**: ninguno puede adelantarse,
   porque el protocolo mide tiempos. Eso significa que cada uno se para a esperar
   al otro.
3. Que el viaje de ida y vuelta sea lo bastante corto como para que esa espera no
   se note.

**Lo que trae nuestro núcleo, comprobado en el binario**: el registro `SIOCNT`
está, porque es parte del hardware, pero del controlador de enlace de mGBA
-`lockstep`- **no hay ni una aparición**, y el envoltorio de JavaScript no expone
nada de enlace. O sea que con este paquete, tal cual viene, no se puede.

**Camino A: los dos juegos en la misma máquina.** Es como lo hace mGBA de
escritorio, y es el que mejor funciona técnicamente: sin red de por medio, el
paso cerrado es gratis. Y está **descartado por la regla fundacional del
proyecto**: exigiría tener la ROM y la partida del otro en tu ordenador. No se
descarta por difícil, se descarta porque este programa no mueve ROMs.

**Camino B: el cable por la red.** Hay que (i) recompilar mGBA-wasm incluyendo el
controlador de enlace y asomándolo a JavaScript, (ii) pasarle las palabras por el
canal de datos que ya está abierto, y (iii) poner a los dos núcleos en paso
cerrado. Lo caro no es (ii), que ya existe: es (i), que es trabajo en C y
emscripten, y sobre todo (iii).

Y conviene separar los dos usos, porque no cuestan lo mismo:

- **Intercambiar** es un trámite corto y con plazos generosos. Es el candidato
  razonable.
- **Combatir** intercambia datos en cada turno y con plazos mucho más justos.
  Sobre una conexión normal, los dos juegos irían a tirones; y en un teléfono que
  ya va justo -ver la sección de arriba-, el paso cerrado lo hunde del todo.

**Camino C, el que ya está hecho: no emular el cable.** Para intercambiar no hace
falta. El motor está escrito y probado: se copian los cien bytes del Pokémon de
una partida a otra, validando contra la ROM **que recibe** para no crear un Bad
Egg, y en dos fases para que nadie pierda nada si se corta la conexión. Le falta
solo la interfaz. Es legal, es barato y funciona entre dos copias aleatorizadas
distintas, que es justo lo que el cable de verdad NO sabría hacer.

Para combatir no hay equivalente: un combate por cable es un protocolo en vivo y
no se puede falsear editando memoria. Si algún día se quiere combate sin cable,
lo que habría que hacer es un **simulador fuera del juego** -leer los dos equipos
y resolver el combate en JavaScript- con la ventaja de que las estadísticas y los
tipos ya se saben leer de cada ROM, y el inconveniente de que es un proyecto
entero aparte.

**La recomendación**, con lo que se sabe hoy: hacer la interfaz del intercambio
por el camino C, que está a un paso, y no tocar el cable hasta que eso esté en
manos de alguien. El combate por cable es, con diferencia, lo más caro de todo lo
que hay apuntado en este documento.

---

## Intercambios en la interfaz

El mecanismo está hecho y comprobado; falta la parte que ve el jugador: elegir
el Pokémon, mandar los cien bytes por el canal de datos -que ya está abierto- y
confirmar en dos fases para que nadie duplique ni pierda nada si se corta la
conexión.

Lo que se enseña antes de aceptar ya sabe decirlo `describirTrato`: que entregas
un BULBASAUR y que en la copia del otro esa especie es de otro tipo.

**Cuidado con una confusión que ya ha pasado**, y que hay que resolver en la
interfaz y no explicándola: alguien intentó intercambiar **desde dentro del
juego**, en la sala de unión del Centro Pokémon, y se quedó en "Espera unos
instantes" sin encontrar a nadie. Es lo esperable y no se va a arreglar: ahí el
juego busca un **cable link**, y aquí no hay ninguno. Son dos emuladores
independientes, cada uno con su ROM, y entre ellos no viaja nada que el juego
reconozca como cable.

El intercambio de este programa es otra cosa: se editan los cien bytes del
Pokémon en la memoria de cada partida. Por eso, cuando se haga la interfaz, tiene
que estar **fuera del juego** -en la barra, como un botón de intercambiar- y
decir en algún sitio que la sala de unión del juego no sirve. Si no, el primero
que lo intente volverá a perder diez minutos ahí dentro.

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

**Hecha**, en sus dos finales, con el mismo componente: `FinModal` cambia de tono
y de palabras, pero enseña lo mismo. Medallas, Liga, equipo con sprites y dos
salidas, **seguir jugando** o **reiniciar**.

Cómo sabe cada final:

- **Derrota**: el mensaje que suelta el juego al caerte el equipo ("…fue
  corriendo a un CENTRO PKMN…"), con la regla del equipo caído de respaldo.
- **Victoria**: el mensaje del Salón de la Fama. Y de ahí sale gratis la Liga
  entera, porque llegar ahí exige haber pasado por los cinco.

Lo que falta:

- **Las medallas.** Se pintan bien, pero no se leen: falta medir la dirección.
  Ver la sección de arriba.
- **La Liga cuando pierdes.** En una victoria se sabe entera; en una derrota no
  se sabe por dónde ibas, y mientras no se sepa la tarjeta no sale. Hay que
  distinguir "estoy en el Alto Mando" de "voy por el segundo", y probablemente
  sea un contador y no una bandera.
- **Contra quién caíste.** El equipo rival se lee de la memoria (está en
  `0x0202402C` en Rojo Fuego), así que se puede decir "caíste contra X Nv. 62" y
  además sale bien en una partida aleatorizada, que es donde un dato de catálogo
  mentiría. Falta comprobar esa dirección contra una partida de verdad antes de
  fiarse de ella.

### De dónde salen las imágenes, y por qué de ahí

Esto condiciona cualquier pantalla que quiera enseñar dibujos, así que conviene
no volver a investigarlo:

La página corre con **aislamiento cross-origin**, que es lo que el emulador
necesita para usar memoria compartida. A cambio, el navegador **bloquea toda
imagen de fuera que no mande `Cross-Origin-Resource-Policy`**. No se puede
configurar desde aquí: o la manda el servidor de la imagen, o no se ve.

- **Pokémon y medallas**: repositorio de sprites de PokeAPI. Manda la cabecera.
  Las ocho de Kanto son `sprites/badges/1..8` en orden de gimnasio; no se dio por
  supuesto, se descargaron y se miraron (1 gema gris, 2 gota, 5 corazón, 8 hoja,
  y la 9 ya es el ala de Johto).
- **Retratos del Alto Mando**: **no hay**. PokeAPI no tiene entrenadores, y
  Pokémon Showdown, que sí los tiene y buenos, no manda la cabecera. Por eso los
  cinco salen con su número y su nombre. Se descartó poner su Pokémon estrella
  -el Lapras de Lorelei, el Dragonite de Lance- porque en una partida
  aleatorizada llevan otra cosa y el dibujo estaría mintiendo.

`test:fin:ui` vigila las tres cosas cargando las imágenes **desde la página** y
no con una petición desde node: desde fuera las dos fuentes contestan igual de
bien y el bloqueo no se notaría. Una de las comprobaciones es que Showdown
**sigue** sin poderse usar; si algún día empieza a mandar la cabecera, esa
comprobación falla y se puede reconsiderar.

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

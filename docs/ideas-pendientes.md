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
  faltaron apagadas, en una tira al lado del equipo con el **tope de nivel de
  cada gimnasio** debajo de cada una, leído de tu ROM. A quien se pasa del tope
  se le apaga la ficha. `test:medallas`, `test:lideres`, `test:tope:ui`
- **Lo que pasó en cada partida terminada queda apuntado**, aunque todavía no se
  enseñe: cómo acabó, por dónde iba y el equipo exacto con los cuatro
  movimientos de cada Pokémon. Es la materia prima del historial y de los
  perfiles. `test:historial`

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
- **Importar una partida no hacia nada, y en silencio.** El nucleo guarda el
  fichero que le subes con el nombre que trae, pero el juego lee siempre
  `<nombre de la ROM>.sav`. O sea que al importar "mi partida.sav" el fichero se
  quedaba ahi al lado, intacto, y el juego seguia con su guardado vacio: ni
  error, ni aviso, nada. Solo funcionaba si el fichero ya se llamaba igual que la
  ROM, que no es como se llaman ni los que exporta este programa ni los de otros
  emuladores. Se vio al intentar usar una partida de verdad para medir otra cosa:
  en `/data/saves` estaban los dos ficheros, el del juego a ceros y el importado
  al lado con sus 23.623 bytes sin tocar. Ahora se renombra al subirlo.
  `test:importar` comprueba el sistema de ficheros del nucleo, que es donde
  estaba el fallo, y sin el arreglo ve cero bytes con contenido.
- **Silenciar y el volumen tapaban el juego.** Flotan sobre la partida, y en un
  movil acababan justo encima de lo que hay que mirar: con el teclado para poner
  un mote, sobre las letras. Pero no pueden desaparecer del todo o no habria
  forma de silenciar. Ahora se portan como los mandos de un video: aparecen al
  pulsar sobre la partida y se van solos a los cinco segundos. Se pidio para
  movil y despues para escritorio, asi que vale en los dos. Pulsar uno cuenta
  como tocar la partida, de modo que no se esconden mientras los estas usando.
  `test:flotantes` lo mide en las dos medidas leyendo lo que calcula el
  navegador, porque el elemento sigue en el documento todo el rato: lo que
  cambia es si se ve y si se puede pulsar.
- **En un Soul Link podias quedarte sin equipo sin que saltara nada.** Si a tus
  Pokemon les caia la pareja en la partida del companero, para el reto estaban
  muertos -esa es la regla- pero en tu juego seguian en pie, asi que no habia ni
  mensaje de derrota ni nadie debilitado y el cartel no salia nunca. Ahora un
  Pokemon cuenta como caido de dos formas: debilitado en tu partida, o con la
  pareja caida en la del otro.
  Y ahi **no se exige el minimo de dos Pokemon**, a diferencia del camino
  normal. Ese minimo guarda contra el combate del laboratorio, que es cosa de TU
  partida; una pareja caida la reporta el companero desde la suya y exige que
  coincida el mote y que el suyo este de verdad debilitado, que es una condicion
  mucho mas concreta que "mi unico Pokemon esta a cero". Sin eso, un Soul Link
  de un solo Pokemon no acabaria nunca.
  El cartel ademas lo explica: decia "tu equipo ha caido al completo" mientras
  el panel ensenaba un Pokemon con todos sus PS y la etiqueta "Vivo", que es
  justo lo que confundia. Ahora pone "Su pareja cayo" y cuenta lo que paso.
- **"Empezar de nuevo" reiniciaba la misma ROM.** Eso devolvia a la MISMA
  partida desde la pantalla de titulo, que no es empezar de nuevo: en una
  Nuzlocke lo siguiente es otro mundo. Ahora lleva al aleatorizador.
- **Al anfitrion se le caia la sala de repente.** Dos causas, y las dos reales.
  La primera: `disconnected` se trataba igual que `failed`, y no son lo mismo.
  `disconnected` quiere decir "ahora mismo no llegan paquetes" y WebRTC se
  recupera solo de eso continuamente -un salto de wifi a datos, un segundo de
  mala cobertura-, asi que un parpadeo de un segundo tiraba el enlace entero y
  obligaba a rehacer la sala. Ahora se le dan ocho segundos: si vuelve, no se
  entera nadie; si no vuelve, entonces si se da por perdida. Mientras tanto se
  dice "conectando" y la pantalla del companero se queda puesta.
  La segunda: **no habia latido en el socket de senalizacion**. Una sala pasa
  casi todo el rato callada -la senalizacion sirve para presentarse y despues
  hablan directos- y un WebSocket callado lo cierra cualquier intermediario
  **sin avisar**: no llega un `close`, deja de funcionar y punto. Medido: con la
  red cortada, a los 21 segundos la barra seguia diciendo "Conectados". Con un
  ping cada 25 segundos el socket nunca esta callado, y ademas se nota si murio:
  medido, ahora se entera a los 42.
  De camino salio un tercero: al reconectar podia llegar la respuesta a una
  oferta que ya no existia, y aplicarla reventaba la negociacion con un "Called
  in wrong state: stable". Ahora se ignora, igual que ya se ignoraba un
  candidato a destiempo. `test:enlace` fija la decision de fondo.
- **En un movil alto, los botones quedaban flotando con un agujero debajo.** La
  partida y el mando tenian altura fija, asi que el sitio que sobraba no lo usaba
  nadie. Medido: en 360x640 sobraban 35 pixeles -justo cabia, y por eso no se
  habia visto- pero en 360x800 eran 195 y en 412x915, 275. Y ese hueco **no puede
  ir a la partida**: en vertical la limita el ancho, no el alto, asi que por
  mucho alto que haya no crece. Es del mando.
  Se arregla con dos decisiones. Los tamanos pasan a `clamp` con el alto de la
  ventana -el minimo es lo que ya habia, asi que en un telefono pequeno no cambia
  nada, y el maximo evita botones de pantalla completa en una tablet- y las
  piezas de la cruceta pasan a porcentajes, lo que de paso borra cuatro juegos de
  medidas repetidas. Y el mando se pega ABAJO en vez de estirarse: se probo
  estirandolo y quedaba peor, con L y R en el borde de arriba, lejos del pulgar.
  Tambien se quito el `flex: 1 1 auto` de pantalla completa, que con el mando ya
  pegado al fondo dejaba 91 pixeles de claro. `test:movil:colocacion` lo mide en
  tres tamanos y en pantalla completa.
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
- **El panel se reorganizaba al entrar en combate.** Y es la segunda mitad de
  una queja que parecia contraria a la primera. Pedido: que el orden solo cambie
  cuando el jugador reordena su equipo desde el menu, no al entrar en combate ni
  al pulsar POKeMON. Pedido antes: que el panel ensene el mismo orden que la
  lista del juego. Las dos son ciertas, y lo que las concilia es **saber cuando
  hay combate**, que antes no se sabia y ahora si. La regla cabe en una frase:
  fuera de combate manda el juego -asi reordenar a mano se ve- y dentro de
  combate no se mueve nada, porque ahi el juego cambia las ranuras por su cuenta.
  De un juego cuya bandera de combate no este medida se sigue al juego, que es
  lo que deja funcionando lo que el jugador SI controla. `test:orden` lo prueba
  con el ciclo entero: mapa, combate, vuelta al mapa y reordenar a mano.
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

## Las medallas — RESUELTO

**Ya se leen.** Y la solucion no estaba donde se buscaba, asi que conviene dejar
escrito el camino entero.

**Por que no funcionaba.** Se buscaban en la memoria del juego, como el equipo.
Imposible por dos motivos a la vez: son banderas -bits sueltos, sin forma que
buscar- y Rojo Fuego coloca su bloque de guardado donde le cabe. Medido en una
partida real: estaba en `0x0200148c`, dentro del monton. Ninguna direccion fija
podia servir.

**Donde si hay forma: en el FICHERO de guardado.** Son catorce secciones de 4096
bytes, cada una con su identificador y una firma (`0x08012025`) al final, y todo
por duplicado para que un corte a mitad de guardar no se lleve la partida. Se
rehace el bloque pegando las secciones 1 a 4 y el byte de las medallas cae
siempre en `0x0FE4`: las banderas empiezan en `0x0EE0` y la primera medalla es la
bandera `0x820`, que al ir las ocho seguidas desde un multiplo de ocho ocupa un
byte entero.

**Como se comprobo, que es lo que lo cierra.** Habia **tres** sitios que cumplian
la regla de los bits: uno daba 1 medalla, otro 2 y otro 8. La regla sola no
decidia. Se cargo la partida en el emulador y se abrio su **tarjeta de
entrenador**, que decia `MEDALLAS 1` en Mt. Moon. Eso descarto los otros dos: lo
dijo el juego, no una suposicion.

**Lo que cuesta, y hay que saberlo**: el juego escribe el fichero de guardado
cuando el jugador guarda, no al ganar la medalla. Asi que se ven **a fecha del
ultimo guardado**. En una Nuzlocke, donde se guarda cada dos pasos, es poca
diferencia; pero quien gane la octava y mire sin guardar vera siete.

Para leerlas en vivo haria falta localizar el bloque en memoria, y hay camino:
buscando en EWRAM un trozo de las banderas tomado del propio fichero se
encuentra -probado: dio `0x0200148c` y el byte correcto-. No se hizo porque
exige descartar falsos positivos (un trozo de 64 bytes ya dio uno) y porque si
hay progreso sin guardar el trozo no coincide y habria que volver al fichero
igualmente.

**Solo esta Rojo Fuego.** Verde Hoja usa el mismo formato casi con total
seguridad, pero "casi" no basta: con una partida suya y su tarjeta de entrenador
se confirma en un minuto.

---

## Distinguir "hay combate" de "lo hubo" — RESUELTO

**Ya está.** El borde amarillo se enciende al entrar en combate y se apaga al
salir. Lo que faltaba era saber si el combate sigue, porque la copia del Pokémon
que pelea **no se borra** al acabar: por eso la marca se quedaba sobre el último
que peleó mientras se caminaba por el mapa.

**Cómo se sabe ahora.** No es una bandera de "estoy peleando": son dos punteros a
código que el juego deja puestos mientras el combate corre y pone a cero al
salir, en `0x02021644` y `0x020216cc`. Se buscaron punteros a propósito, porque
son de lo poco **comprobable**: no basta con que no sean cero, tienen que valer
exactamente lo que valen. Eso convierte una dirección equivocada en un "no lo sé"
en vez de en un sí inventado.

**Medido contra 22 estados** de dos partidas: 14 dentro de combate y 8 fuera, de
dos combates que no tienen nada que ver y de sitios distintos del mapa. Y con
**dos ROMs**, una aleatorizada y la normal: los dos punteros valieron siempre lo
mismo en los catorce y cero en los ocho, en las dos copias. O sea que el
aleatorizador no mueve ese código, que era la duda razonable.

**Dos caminos descartados por el camino**, que es lo que de verdad ahorra tiempo
a quien venga después:

- Lo que cambia en la parte baja de EWRAM es el **montón**: bloques que el
  combate reserva y libera, reconocibles por su cabecera `0xA3A3`. Cuadra
  perfectamente, pero su dirección depende de lo que se hubiera reservado antes.
- Un byte en `0x0202000a` que parecía una bandera de libro -1 en combate, 0
  fuera, aislado- y **no lo era**: es la parte alta de un puntero que cruza los
  `0x02010000` según cuánto montón se haya pedido. Se vio al mirar los bytes
  crudos alrededor; por la cuenta sola habría pasado por buena.

La clave de la tabla es de **cuatro** letras y no de tres, a diferencia del resto
del proyecto: estos son punteros a código y en otro idioma el código está en otro
sitio. Rojo Fuego en inglés dice "no lo sé", que es lo correcto.

Lo vigilan `test:combate` -la lógica, incluido que un valor cualquiera en esa
dirección no cuente- y `test:borde:combate`, que carga dos estados de verdad en
el navegador y mira la ficha. Los estados no están en el repositorio, son
partidas de alguien: se pasan por línea de órdenes.

Lo que esto **no** resuelve y sigue pendiente: la pantalla de fin de partida
podría usarlo para distinguir "se te cayó el equipo" de "estás a mitad de un
combate", y las medallas y la Liga siguen sin medir.

---

## Reconectar despues de una caida larga

`test:reconexion` deja una comprobacion en rojo, y venia asi de antes: tras
agotar los tres intentos automaticos, el boton de "Reintentar ahora" no rehace
el enlace aunque la red haya vuelto. Se comprobo que falla **igual sin los
arreglos del latido y la gracia**, asi que no es una regresion de aquello.

Lo que se sabe: el anfitrion vuelve a entrar en la sala y el invitado deberia
recibir `peer-joined` y ofrecer. Falta averiguar si lo que falla es el reenganche
en el servidor -la sala quizas ya no le reconoce- o la negociacion en el
navegador que acaba de volver.

Y una advertencia para quien lo mire: **cortar la red con `setOffline` no cierra
una conexion ya establecida**. Los dos navegadores estan en la misma maquina, asi
que el enlace directo sigue vivo. Quien acaba notandolo es el latido del
servidor, a los 42 segundos medidos. Por eso ese banco de pruebas no sirve para
comprobar cosas rapidas de reconexion, y la comprobacion del aviso se dejo como
salto explicito en vez de como un fallo permanente.

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

## Una aplicación propia para el móvil (APK)

La idea: en el móvil se deja de jugar desde el navegador y se juega desde una
aplicación con **su propio emulador, nativo**, que se conecta a la misma partida
compartida que el resto. El teléfono deja de ser un navegador y pasa a ser otro
cliente de la sala.

**Por qué arreglaría lo de arriba.** Todo lo que se midió en la sección anterior
señala al navegador y no al emulador: el núcleo corre en el hilo principal, el
wasm se lleva unos 300 MB, y en un teléfono de 1,5 GB eso acaba en "la página no
responde" o en que el sistema le quita el contexto de vídeo. Un mGBA nativo en
Android no tiene ninguno de esos tres problemas: en un J7 va a velocidad plena.

**Y por qué aun así no es lo primero que hay que hacer.** Porque significa un
**segundo cliente completo**. El emulador es la parte fácil -ya existe, nativo y
mantenido-; lo caro es todo lo demás, que hoy vive en el navegador y habría que
rehacer en la aplicación: entrar en la sala por el servidor de señalización,
montar el WebRTC con su vídeo, su voz y su canal de datos, leer el equipo de la
partida, las medallas, el tope de nivel, el Soul Link, los intercambios y las
reglas de fin de partida. Dos clientes significa además que cada cosa que se
toque hay que tocarla dos veces, y que una se queda atrás.

**Lo que SÍ se aprovecha tal cual, y no es poco:**

- **El servidor de salas, sin cambiarlo.** Habla WebSocket y JSON; da igual
  quién esté al otro lado.
- **La forma de los mensajes**, que está escrita en `packages/protocol`.
- **Y sobre todo, lo que se sabe de la partida.** Todo `packages/pokemon` -dónde
  vive el equipo, cómo se descifran los cien bytes de un Pokémon, el puntero del
  bloque de guardado, la tabla de entrenadores, las frases que delatan el final-
  son hechos sobre el juego, no sobre JavaScript. Portarlos es traducir, no
  volver a investigar, y esa investigación es la parte cara y ya está pagada.

**Un aviso concreto antes de elegir el emulador nativo.** Tiene que ser mGBA, y
conviene comprobar que su savestate es el mismo formato: el lector de aquí exige
exactamente `0x61000` bytes y conoce de memoria dónde empieza cada región. Si la
versión nativa guarda de otra forma, todo lo del párrafo anterior deja de valer
y se cae en el mismo sitio que avisa la sección de arriba sobre cambiar de
núcleo. Es media tarde comprobarlo y conviene hacerlo antes de escribir nada.

**Lo que NO es un atajo:** envolver la web en un WebView. Es el mismo motor del
navegador con los mismos límites, así que no arregla nada de lo que se midió.
Si se hace una aplicación, el emulador tiene que ser nativo.

**Lo legal no cambia.** La aplicación no puede traer ningún juego dentro: el
jugador elige su fichero, igual que ahora. Y conviene pensar la distribución
antes de empezar, porque fuera de la tienda significa que cada uno instale un
APK a mano, y eso sube bastante el listón para la gente a la que va dirigido.

**El orden sensato:** primero hacer el Worker con OffscreenCanvas de la sección
anterior y volver a medir el tiempo de CPU por fotograma en un teléfono flojo.
Es mucho menos trabajo y puede que baste. Si después de eso un J7 sigue sin
poder, entonces sí: la aplicación es la respuesta, y entonces ya se sabrá con
números cuánto hacía falta.

Lo que sí es barato y ayuda hoy está en la sección anterior: dejar apagar el
envío de vídeo en un móvil que no da abasto, y quedarse con el equipo y la voz.

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

**Lo que trae nuestro núcleo, comprobado dos veces**: en el binario de
`@thenick775/mgba-wasm` 2.5.1 el registro `SIOCNT` aparece, porque es parte del
hardware, pero del controlador de enlace de mGBA -`lockstep`- **no hay ni una
aparición**. Y de las **48 funciones** que el paquete expone a JavaScript,
**ninguna** tiene que ver con el puerto serie. O sea que con este paquete, tal
cual viene, no se puede ni empezar.

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
falta, y además el cable lo haría **peor**: entre dos copias aleatorizadas
distintas, un intercambio por cable entregaría un Pokémon con las estadísticas de
la ROM de origen, y el que lo recibe se lo quedaría así media partida.

Lo que hay escrito y probado, función por función:

- `prepararOferta` saca los cien bytes del Pokémon **sin borrarlo**. Mientras el
  otro no confirme, tu partida sigue intacta.
- `aplicarRecepcion` lo mete en la tuya, y hace tres cosas que no son obvias:
  valida los índices contra los límites de **la ROM que recibe** -un movimiento
  que existe en su copia puede no existir en la tuya, y eso no da un Pokémon
  raro, da un Bad Egg-, **recalcula las estadísticas** con la tabla de tu ROM, y
  al terminar vuelve a leer el equipo para comprobar que quedó bien escrito. Si
  algo no cuadra, lanza en vez de dejarte la partida tocada.
- `describirTrato` explica en palabras lo que cambia al cruzar dos copias.

Y el camino de vuelta también existe: el estado modificado se escribe en el
sistema de ficheros del núcleo y se carga, que es lo mismo que hace el menú de
cargar estado.

**Lo que falta, concretamente:**

1. **Cuatro mensajes en el protocolo** (ofrezco / acepto / confirmo / cancelo) con
   su validación. Hoy `PeerMessage` solo tiene `equipo`, pero el canal de datos
   ya está abierto y `peer.send` acepta cualquier JSON.
2. **La pantalla**: elegir el Pokémon, enseñar lo que dice `describirTrato`, y
   confirmar.
3. **Resolver la duplicación**, que es el problema de diseño de verdad y conviene
   verlo antes de escribir nada. Aquí no hay un servidor que arbitre: cada uno
   edita su propia partida. Si A aplica lo de B y la conexión se corta antes de
   que B aplique lo de A, **B se queda con el suyo y A tiene los dos**. Eso es un
   duplicado, y en una Nuzlocke es peor que perder el Pokémon. Lo que hay que
   decidir es el orden de los pasos para que la ventana mala sea "ninguno de los
   dos lo ha aplicado" en vez de "solo uno". Las dos fases del motor están para
   eso, pero el acuerdo entre los dos lados está por escribir.
4. **Un momento seguro para aplicarlo.** Aplicar un intercambio carga un estado
   modificado, y hacerlo en mitad de un combate o de un diálogo es pedir
   problemas. Lo razonable es exigir que las dos partidas estén en el mapa, que
   ahora mismo **ya se sabe comprobar**: `enCombate` existe desde que se arregló
   el borde amarillo.

Para combatir no hay equivalente: un combate por cable es un protocolo en vivo y
no se puede falsear editando memoria.

**La alternativa sin cable sería un simulador fuera del juego**: leer los dos
equipos y resolver el combate en JavaScript, como hacen los simuladores de
internet. Lo que ya se tiene es más de lo que parece: de cada Pokémon se leen sus
**cuatro movimientos** (van en los cien bytes) y de cada especie sus
**estadísticas base y sus tipos**, de la ROM de cada uno, así que funcionaría
también entre copias aleatorizadas distintas. Lo que falta es la **tabla de
movimientos** -potencia, tipo, precisión, efecto-, que está en la ROM y se
localiza igual que las otras dos, y después las mecánicas de combate de tercera
generación enteras: fórmula de daño, prioridades, estados, habilidades, objetos,
críticos y su generador de números. Eso último es el proyecto aparte, y no es
pequeño.

**La recomendación**, con lo que se sabe hoy: hacer la interfaz del intercambio
por el camino C, que está a un paso, y no tocar el cable hasta que eso esté en
manos de alguien. El combate por cable es, con diferencia, lo más caro de todo lo
que hay apuntado en este documento.

---

## Intercambios — HECHO

Se intercambia desde el boton de la barra, con el Pokemon elegido a mano y sin
tocar la sala de union del juego. El motor ya estaba; lo que se ha anadido es el
protocolo, la pantalla y, sobre todo, el acuerdo entre los dos lados.

**Como se evita el duplicado**, que era el problema de diseno y no la pantalla.
No hay servidor que arbitre, asi que no existe un instante en que los dos
cambios ocurran a la vez. En vez de buscarlo, se mueve el riesgo:

1. Primero viajan las OFERTAS. Nadie toca su partida, asi que cortarse no cuesta
   nada.
2. Cuando los dos tienen las dos ofertas y los dos han dicho que si, cada lado
   tiene ya todo lo que necesita para terminar **por su cuenta**: a partir de
   ahi el companero sobra.
3. Antes de escribir nada se apunta el trato en un diario que sobrevive a cerrar
   el navegador, con los bytes dentro.

Y aplicar es idempotente -escribir el mismo bloque en la misma ranura dos veces
deja lo mismo-, asi que reintentar nunca estropea nada.

**La ventana que queda, dicha y no tapada**: entre que mando mi "si" y recibo el
suyo. Si se corta justo ahi, yo no aplico. Eso es a propósito: **no aplicar es el
lado seguro**, porque deja a los dos con lo suyo. Lo contrario -aplicar por si
acaso- es lo que crea el duplicado.

**Dos cosas que salieron al probarlo de verdad**, y que no se habrian visto de
otra forma:

- El motor llamaba a `localizarEquipo` **sin el codigo del juego**, y eso busca
  por forma y se queda con la tira mas larga que parezca un equipo: la del rival.
  El intercambio decia "hecho" y no cambiaba nada, porque escribia en el equipo
  del entrenador contra el que habias peleado. Es el mismo fallo que tuvo el
  panel en su dia, pero aqui no ensena: escribe.
- El boton estaba atado a tener companero, y rematar un trato a medias se hace
  **sin** companero. El boton de terminarlo quedaba fuera de alcance justo
  cuando hacia falta. Ahora sale con partida.

Lo vigilan `test:trato` -lo que se rechaza por el canal, que es mas importante
que lo que se acepta: lo que entra acaba escrito en la partida de alguien- y
`test:trato:ui`, que monta dos navegadores en una sala, intercambia de verdad y
comprueba los dos equipos antes y despues. Esa prueba incluye el caso que no se
puede provocar a mano: que con un solo "si" **nadie** toque su partida.

Lo que sigue faltando: enseñar lo que dice `describirTrato` sobre como cambia el
Pokemon en la copia del otro. Para eso hace falta su ROM, que no sale de su
ordenador, asi que habria que mandarle a cada uno lo que su propia copia dice.

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

## Cuentas, historial y porcentaje de victorias

La idea es tener un sitio con el historial: cuántas partidas aleatorizadas has
jugado, cuántas terminaste y cuántas se fueron al traste, y poder ordenarlas por
el tipo de aleatorización.

**Parte de esto ya se está recogiendo, aunque no se vea en ningún sitio.** Desde
que una partida se da por terminada se apunta en el navegador qué pasó: si se
ganó o se perdió, si fue por la pareja caída de un Soul Link, cuántas medallas
se llevaban, y el equipo exacto de ese momento **con los cuatro movimientos de
cada Pokémon**. Ver `apps/web/src/core/historial.ts` y `test:historial`.

Se hizo así a propósito y conviene no deshacerlo: una partida terminada no se
vuelve a jugar, así que un historial que empiece a llenarse el día que se
escriba su pantalla nace vacío. Lo que falta por hacer es enseñarlo, no
recogerlo.

**Lo que falta, por orden:**

1. **Manejo de usuarios.** Cuentas, sesión iniciada y un sitio donde vivan los
   datos. Es lo que convierte "mi historial en este navegador" en "mi
   historial". Lee el aviso de abajo antes de empezar: esto cambia el proyecto
   de categoría.
2. **Historial de partidas.** La lista de lo que ya se guarda, de la más
   reciente a la más vieja.
3. **Porcentaje de victorias.** Sale de dos datos que ya se apuntan -cómo acabó
   y cuándo-, pero hay que decidir antes qué cuenta (más abajo).
4. **Cada partida, desplegable.** Al abrir una fila: hasta dónde llegó -las
   medallas-, qué equipo tenía y **qué cuatro movimientos tenía cada Pokémon**.
   Todo eso está ya guardado; lo único que falta es ponerle nombre a los
   números, que se hace con la ROM del jugador igual que en el panel del equipo
   (`encontrarTablaNombres` para las especies; para los movimientos haría falta
   su tabla, que aún no se ha localizado).

**Una cosa que hay que resolver para el desplegable:** los nombres de los
movimientos no están guardados, solo sus números. Eso es deliberado -es la misma
frontera de siempre: por aquí no viaja nada de la ROM- pero significa que para
enseñarlos hace falta tener cargada una copia del juego. Si alguien mira su
historial sin ROM puesta, o se enseñan los números, o se guarda también el
nombre el día que se apunta. Decidirlo antes de dibujar la pantalla.

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

## Dificultad: Normal, Nuzlocke y Nuzlocke nivelada

En el modal del aleatorizador, junto a las opciones, un selector de dificultad.
No cambia la ROM: cambia **las reglas que el programa vigila** y lo que se
apunta en el historial.

**Normal.** Como hasta ahora. Se captura lo que se quiera cuando se quiera y el
nivel máximo de los líderes no afecta a nada. Es lo que hay hoy.

**Nuzlocke.** Tres reglas:

- Solo se puede capturar **el primer Pokémon de cada ruta**. Si se te escapa o
  cae, esa ruta se acabó.
- Un Pokémon **debilitado está muerto**: o al PC o liberado.
- Y de ahí sale la restricción que de verdad cuesta: **no se puede salir de un
  Centro Pokémon ni curar** sin haber sacado antes del equipo a todos los
  debilitados.

**Nuzlocke nivelada**, la más dura. Lo anterior más dos reglas:

- **El tope de nivel por gimnasio**: un Pokémon por encima del tope del líder
  que toca **no se puede usar**.
- **Sin repetir tipo primario**, y esto cuenta para los dos jugadores a la vez.

### Sin repetir tipo primario

La regla: **en el equipo no puede haber dos Pokémon con el mismo tipo primario**,
y en cooperativo tampoco entre los dos equipos. Si tú llevas uno de Agua
primario, tu compañero no puede llevar otro de Agua primario, aunque sean
especies distintas. Uno de los dos se queda en la computadora.

**Solo cuenta el PRIMERO.** Un Roca/Agua tiene de primario Roca, así que no
choca con el Agua de tu compañero: no están compartiendo tipo primario. Es la
diferencia entre que la regla sea jugable o que deje medio equipo fuera.

**Esto está más cerca de lo que parece.** Los tipos ya se leen de la ROM y, lo
que es más importante aquí, **ya viajan por el cable**: cada lado manda los de su
propia copia (`PokemonResumen.tipos`), y eso no es un detalle de implementación
sino lo único que hace que la regla se pueda comprobar. En dos copias
aleatorizadas por separado la misma especie tiene tipos distintos, así que el
tipo primario del Pokémon de tu compañero solo lo sabe su ROM. Ya está resuelto;
comparar `tipos[0]` de los dos equipos es casi todo el trabajo.

Dos cosas a tener en cuenta al escribirlo:

- **Un tipo repetido no es doble.** Cuando los dos valores son iguales el juego
  está diciendo "mono-tipo", y el panel ya lo trata así. Para esta regla da
  igual: el primario es `tipos[0]` en los dos casos.
- **Basta con mirar el equipo**, no el PC. La regla habla de lo que llevas
  encima y la solución es justamente dejar uno en la computadora, así que leer
  solo las seis ranuras -que es lo que ya se hace- es exactamente lo que hace
  falta.

Y la parte difícil es la misma que la de los debilitados: **no poder salir del
Centro Pokémon hasta haberlo arreglado**. Vale lo que se dice más abajo sobre
vigilar e impedir; no es un problema distinto, es el mismo, y conviene
resolverlo una vez para las dos reglas.

### Lo que ya está hecho de esto

Más de lo que parece, y conviene saberlo antes de empezar de cero:

- **El tope de nivel de cada gimnasio se lee de la ROM**, también de una
  aleatorizada. `lideres.ts`, `test:lideres`.
- **A quien se pasa del tope ya se le apaga la ficha** y se le pone cuánto se
  pasa. Hoy es solo un aviso. `test:tope:ui`.
- **Los debilitados se detectan** en cada lectura del equipo, y en un Soul Link
  ya se marca la pareja al otro lado. `test:soullink`.
- **Los tipos de los dos equipos ya están a mano**, cada uno leído de su propia
  ROM y enviados por el canal de datos. Es lo que hace comprobable la regla de
  no repetir tipo primario. `test:paneles`, `test:estadisticas`.
- **Las medallas se leen en vivo**, de la memoria, así que el tope que toca
  cambia en cuanto ganas la medalla. `medallas.ts`, `test:medallas`.
- **Se sabe escribir en la memoria del juego**: los intercambios meten los cien
  bytes de un Pokémon y recargan el estado. `intercambio.ts`. Esto importa para
  lo de abajo.

### El problema de verdad: vigilar no es impedir

Todo lo que hace este programa hoy es **mirar**. Lee la memoria cada pocos
segundos y cuenta lo que ve. Las tres reglas de arriba piden otra cosa: impedir
que el jugador haga algo dentro de su juego. Y ahí hay tres caminos, con precios
muy distintos:

**1. Avisar y apuntar (barato, y encaja con todo lo demás).** El programa
detecta que se rompió una regla, lo dice, y marca la partida como rota en el
historial. No impide nada. Es exactamente lo que ya se hace con la pareja caída
de un Soul Link: *se marca, no se impone*, porque la partida es de quien juega.
Lo que lo hace suficiente es el historial: una Nuzlocke con una regla rota deja
de contar como Nuzlocke, y eso ya duele bastante.

**2. Intervenir en la memoria (caro y delicado).** Se puede. Por ejemplo, poner
a cero las Poké Balls de la mochila mientras la regla diga "aquí ya no se
captura", y devolverlas después. Pero hay que tener claro el riesgo: se está
escribiendo en la partida de alguien, y un fallo ahí no se ve hasta que el
guardado está corrupto. Lo de curar en el Centro Pokémon es peor todavía: eso lo
hace un guion del juego, no un dato, así que no hay un byte que tocar.

**3. Parchear la ROM al aleatorizar (lo más limpio si se llega a hacer).**
Las restricciones se meterían en el propio juego al generarlo, como hace el
randomizer con lo demás. Es mucho más trabajo y hay que estudiarlo.

**Recomendación para cuando se empiece:** hacer el 1 completo antes de pensar en
el 2. Da el 90% del valor y no puede romperle la partida a nadie. El 2 solo
compensa si alguien pide de verdad que el programa le ate las manos.

### Qué rutas están gastadas: el dato ya lo llevan ellos

**No hay que apuntarlo a mano.** Cada Pokémon lleva dentro el sitio donde se
capturó, en la subestructura `M` de sus cien bytes -el lector ya la localiza, de
ahí sale la bandera de huevo-. O sea que la lista de rutas gastadas sale de
mirar el equipo, que es algo que ya se hace cada tres segundos. Está explicado
con más detalle en **"Mapa de dónde has capturado"**, más arriba; las dos cosas
se construyen sobre el mismo dato y conviene hacerlas juntas.

Con eso basta para *contar* y para avisar después. Para avisar **antes** -"aquí
ya capturaste, no lances"- hace falta además saber en qué mapa está el jugador
ahora mismo, y eso todavía no se lee. El camino está abierto: el mapa actual
vive en el bloque de guardado, en la memoria, y ese bloque ya se sabe localizar
siguiendo el puntero de `0x020398ac`, que es como se leen las medallas en vivo.
Ver `medallas.ts`, que explica por qué una dirección fija no vale.

Dos cosas que hay que decidir:

- **Qué cuenta como "una ruta".** Un mapa de GBA no es una ruta: la Ruta 3 son
  varios mapas y una cueva tiene uno por planta, así que contar por mapa da tres
  capturas en una cueva de tres pisos. Las Nuzlocke cuentan por zona, así que
  haría falta una tabla de mapas a zonas, o una regla más tosca pero honesta
  -"por mapa"- diciéndolo claramente.
- **Qué pasa con los que se mueren.** El sitio lo lleva el Pokémon, así que un
  Pokémon liberado se lleva el dato con él y su ruta volvería a parecer libre.
  Hay que apuntarlo por nuestra cuenta según se vea, no deducirlo del equipo de
  ahora. Es el mismo aviso que ya está en la sección del mapa.

### En un Soul Link, la dificultad viene en la invitación

**Si invitas a alguien, la dificultad va fijada desde el enlace.** No es un
detalle de comodidad: dos personas jugando el mismo mundo con reglas distintas
no están jugando la misma partida, y en un Soul Link eso se nota enseguida -uno
suelta a un debilitado y el otro no, y las parejas dejan de cuadrar-.

El camino ya está hecho: el enlace de invitación es corto porque **la semilla la
guarda la sala** y quien lo abre la pide con el código (ver `invitacion.ts` y
`ask-room` en el servidor de salas). La dificultad viaja igual, por el mismo
sitio y con el mismo mensaje. Quien entra la ve antes de aceptar, junto al juego
que hace falta, y no puede cambiarla por su cuenta.

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

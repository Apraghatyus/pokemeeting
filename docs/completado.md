# Lo que ya está hecho

Este fichero es la mitad terminada de la memoria del proyecto. La otra mitad
-lo que falta, lo que está a medias y las ideas sin empezar- vive en
[ideas-pendientes.md](ideas-pendientes.md), y las dos se leen juntas.

**Por qué se guarda lo terminado en vez de borrarlo.** Casi nada de esto era
obvio: varias de estas cosas estaban descritas como imposibles y no lo eran, y
lo que costó no fue escribir el código sino averiguar dónde mirar. Borrar eso
al terminarlo obliga a redescubrirlo el día que se rompa o que haya que hacer
lo mismo en otro juego.

Va en dos partes:

1. **Lo que ya funciona**, con la prueba que lo vigila. Es el inventario: si
   quieres saber si algo sigue en pie, ejecuta su prueba en vez de fiarte de
   esta lista.
2. **Lo que se arregló y por qué**, más lo que se cerró del todo y tiene su
   propia historia que merece la pena no perder.

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
- **Avance rápido** conmutable: espacio en escritorio, botón propio en el mando
  táctil y el gatillo LT en uno físico. `test:controles`, `test:mando:fisico`
- **El mando físico hace también lo que la consola no tenía**: LT adelanta y RT
  abre el mapa, reasignables como el resto. `test:mando:fisico`
- **Pantalla completa** que incluye partida, mando y equipo. `test:movil:mando`
- **Mandos físicos** por la Gamepad API, por posición y no por letra: el botón
  de la derecha es A y el de abajo B, como en la consola. Se reasignan desde
  Ajustes, y al usarlos el mando táctil se aparta. `test:mando:fisico`

**Jugar con alguien**

- **Sala con contraseña**, con el servidor de salas emparejando y apartándose.
  `test:signaling`, `test:session`
- **Vídeo de la partida del otro** a ~55 fotogramas por segundo. `test:fluidez`
- **Voz en directo**, con silencio propio y volumen del compañero aparte del
  juego. `test:voice`, `test:audio`
- **Apagar el envío de vídeo** desde Ajustes, para el móvil que no da abasto: se
  sigue con el equipo y la voz, y al compañero se le dice por qué no ve nada.
  `test:trato`
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
  recalculando las estadísticas para la ROM que recibe, con su pantalla.
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

- **Tres dificultades**, Normal, Nuzlocke y Nivelada, elegidas tras aleatorizar
  y viajando en la semilla. Se vigilan sus reglas (tope, tipo repetido, segunda
  captura en una ruta, revivir) y se avisa en el panel. `test:dificultad`
- **Cuánto ocupa todo**, con aviso antes de quedarse sin sitio, en la lista de
  partidas guardadas.

**Aplicación de Android** (`movil/`)

- **mGBA nativo** por JNI, con imagen por `ANativeWindow` y sonido por AAudio.
  El savestate es el mismo que el de la web, así que `packages/pokemon` se usa
  tal cual. La APK la compila el workflow `APK Android`.
- **Jugar, sala y equipo**: elegir ROM, mando táctil multitoque, Soul Link
  contra el mismo servidor de salas viendo la pantalla del compañero, y el
  equipo de los dos con sprites. En horizontal, como la web.
- **Mandos físicos**, con la misma tabla que la web y reasignables desde su
  panel.
- **A la par con la web**: mandar pantalla y voz, reconexión, medallas, reglas
  de cada dificultad, Soul Link, intercambios, motes, aleatorizar, enlace de
  invitación, cuentas y ranking, estados y `.emupoke`. Ver la sección de la
  aplicación más abajo para lo que le falta (probarla y firmarla).

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

## Cambiarle el mote a un Pokémon desde la página — HECHO

**Lo que hay.** Se pulsa un Pokémon de tu equipo, se escribe el mote nuevo y
queda dentro de la partida. Hasta diez caracteres de la tabla del juego
(`codificarTexto`, el camino de vuelta de `leerTexto`; `test:mote`). No en mitad
de un combate, y solo a lo que capturaste tú, como el Tasador. En una Soul Link
se le cambia también a su pareja en la partida del otro (mensaje `mote`), que se
reconoce por el mote de antes. `apps/web/src/core/mote.ts`.

**Falta comprobarlo jugando** con una partida de verdad.

Lo de abajo es como se planteó.

Pulsar un Pokémon de tu equipo, escribirle otro nombre, y que ese nombre quede
**dentro de la partida**: no una etiqueta nuestra encima del juego, sino el mote
de verdad, el que se ve al abrir el equipo en el emulador.

### La mitad difícil ya está hecha

Esto no parte de cero, y conviene saberlo antes de calcular lo que cuesta. La
evolución al intercambiar dejó resuelto justamente este camino:

- **Escribir el mote en el bloque** ya existe: `escribirMote`, en `gen3.ts`. El
  mote NO va cifrado, así que esta parte ni siquiera toca el checksum.
- **Meter un bloque cambiado en la partida y devolvérsela al emulador** es lo
  que hace el intercambio en cada trato, y está probado contra partidas reales.
- **Esperar a que no haya combate** también: el intercambio ya se niega en
  mitad de uno, porque cargar un estado editado ahí es como se corrompe una
  partida. La misma guarda vale aquí.

### Lo que falta, y no es la escritura

**1. Pasar el texto al juego de caracteres.** Hoy sabemos leerlo -`leerTexto`-
pero no escribirlo: para la evolución se copiaron los bytes de la tabla de
nombres de la ROM, que ya venían en el formato bueno. Con alguien escribiendo
hay que hacer el camino de vuelta, y ahí aparecen las preguntas de siempre: qué
pasa con una letra que no existe en esa tabla, y que el hueco son **10 bytes**,
no diez caracteres de los nuestros.

**2. EL MOTE ES LA LLAVE DEL SOUL LINK.** Esta es la de verdad, y por sí sola
decide cómo se hace lo demás. Dos Pokémon están emparejados porque se llaman
igual: así se sabe que, al caer el de ella, el de él también está muerto. Si uno
de los dos renombra el suyo y el otro no, **la pareja se rompe en silencio** y
el reto deja de funcionar sin que nadie se entere.

O sea que no vale con escribir en tu partida. Hay tres salidas y conviene
elegirla a propósito:

- **Renombrar a los dos a la vez**, mandándoselo al compañero. Es lo que
  mantiene el reto en pie, y encaja con que ya hay un canal abierto entre las
  dos partidas.
- **Dejarlo solo para fuera de una sala**, que es simple y no rompe nada.
- **Avisar y dejar pasar**, que es lo peor de los dos mundos: el aviso se lee
  una vez y el reto se queda roto para siempre.

**3. Decir qué es esto.** En el juego los motes los cambia el Tasador de Motes,
y solo a los Pokémon que capturaste tú: a uno intercambiado no se le puede. Si
nuestra pantalla deja renombrar cualquiera, está haciendo algo que el juego no
deja, igual que la evolución forzada. Se puede hacer, pero se dice: es una
intervención del emulador, no una mecánica del juego.

### Para qué sirve de verdad

En una Soul Link, ponerse de acuerdo en los motes es el primer paso de cada
captura, y hoy se hace con el Tasador: hay que llegar a su casa, en una ciudad
concreta, cada vez. Poder hacerlo desde la página quita ese viaje, que no aporta
nada al reto.

---

## Mapa de dónde has capturado — HECHO

**Lo que hay.** Botón de mapa en la barra de arriba. Un esquema de Kanto (con las
Islas Sete en lista) o de Hoenn, según el juego, con cada zona libre o gastada
-por ti, por tu compañero o por los dos- y dónde está cada uno ahora mismo. Arriba
dice en qué zona estás y si ahí todavía se puede capturar.

- **Dónde estás** se lee de la memoria sin direcciones encontradas a mano
  (`packages/pokemon/src/mapas.ts`): se busca en la ROM la tabla de mapas por su
  forma, y en la memoria la copia de la cabecera del mapa actual, que el juego
  hace al entrar en cada mapa. Vale para los cinco juegos. `test:mapas`, con ROM
  y estado fabricados.
- **Lo gastado** es lo que ya apuntaba la regla de RUTA, más la zona de captura
  de quien va en el equipo.
- **Al compañero** se le manda la zona y lo gastado por el canal de datos
  (mensaje `mapa`).
- Los nombres son los de la versión en español hasta donde se sabe
  (`apps/web/src/core/zonas.ts`); algún sitio pequeño puede no coincidir letra a
  letra.

**Falta comprobarlo con una ROM y una partida reales**: que se encuentre la
tabla, que la zona leída sea la buena y que el esquema cuadre con el juego.

Lo de abajo es como se planteó.


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

## Apodo de jugador — HECHO

Pequeño y se nota. La ventana del compañero decía "Tu compañero" porque no
sabíamos cómo se llama. Se pide al entrar en la sala y viaja por el canal que ya
existía. Y desde que hay cuentas no se pregunta a quien tiene la sesión
iniciada: se usa el apodo de su cuenta, que para eso está. `test:apodo`.

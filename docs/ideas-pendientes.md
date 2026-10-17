# Lo que falta

Este fichero se escribe para que **leyéndolo solo** se sepa qué queda por
hacer: lo que está a medias, lo que ni se ha empezado y lo que se decidió
dejar para más adelante, diciendo qué lo bloquea, que suele ser lo que de
verdad decide el orden.

**Lo ya terminado está en [completado.md](completado.md)**: el inventario de lo
que funciona con su prueba, y la historia de lo que se arregló. Si vienes de
nuevo, empieza por ahí y sigue por aquí.

Las ideas sueltas también se apuntan aunque nadie las vaya a hacer mañana:
cuando llega el momento, lo caro no es escribir el código sino volver a
averiguar qué se sabía y qué había que decidir antes de empezar.

**Algunas secciones de aquí están hechas casi del todo** -las cuentas, el
ranking, la base de datos, la pantalla de fin de partida- y se quedan en este
lado porque todavía les cuelga algo abierto. Lo que sigue abierto se dice en
cada una.

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
3. **Dejar elegir** — **HECHO**: en Ajustes se puede apagar el envío de vídeo y
   quedarse con el equipo y la voz. Al compañero se le dice por qué no ve nada.

Cambiar de núcleo es la opción que peor sale: el resto del programa -equipo,
medallas, combate, fin de partida- está construido sobre leer **savestates de
mGBA**. Otro núcleo significa rehacer todo eso.

---

## Una aplicación propia para el móvil (APK) — HECHA, FALTA PROBARLA Y FIRMARLA

**Dónde está.** En `movil/`: React Native con mGBA nativo. Se hizo saltándose el
orden sensato de abajo (el Worker primero), por decisión explícita. Lo que hay:

- El núcleo es mGBA 0.10.5 compilado con CMake. **Su savestate mide los mismos
  `0x61000` bytes que el de la web**, comprobado, así que el aviso de más abajo
  quedó despejado y `packages/pokemon` se reutiliza sin tocarlo.
- Jugar, sala (Soul Link contra el mismo servidor, viendo la pantalla del
  compañero), equipo de los dos, modo horizontal como el de la web y mandos
  físicos reasignables.
- La APK la compila GitHub Actions y va firmada con la clave de depuración.

**Hecho en la app** (casi a la par con la web, compila y empaqueta, sin probar
en un teléfono):

- Manda su pantalla (pista de WebRTC propia a 30 fps) y su voz, con micro,
  silenciar al compañero y dejar de mandar vídeo. Reconexión sola como la web.
- Medallas, tope de nivel, cartel de fin de partida, dificultades con las
  reglas que se hacen cumplir (centro, revivir, líder, Poké Ball, primera
  captura, tipo repetido), pregunta de Soul Link ligada a la cuenta del
  compañero, intercambios y cambio de mote. Es el mismo código de
  `apps/web/src/core`, con `localStorage` puesto sobre SharedPreferences.
- Aleatorizar desde la app (mismo servicio y cola), lista de partidas con su
  juego, reglas y modo.
- El enlace de invitación de la web abre la app: pregunta a la sala, rehace el
  mismo mundo con tu ROM y entra sola. Desde la sala se comparte el enlace.
- Cuentas: entrar, crear, subir partidas y finales (también al terminar) y ver
  el ranking (abre la web en `#ranking`).
- Estados en tres ranuras y exportar/importar `.emupoke`, el mismo fichero que
  la web: la partida pasa de la web a la app y al revés.

**Lo que le falta a la aplicación:**

1. **Probarla en un teléfono de verdad.** Nadie la ha abierto todavía en un
   móvil: sonido, velocidad en un aparato flojo, vídeo y voz en los dos
   sentidos, mando Bluetooth, enlace de invitación, aleatorizar, importar.
2. **Clave de firma propia y forma de repartirla.** Sigue firmada con la clave
   de depuración. Falta: que el workflow firme con una clave guardada en los
   secretos del repositorio, publicar la APK como Release al etiquetar, y un
   enlace "Descargar la app" en la web. Para que el enlace de invitación abra
   la app sin preguntar hace falta además `/.well-known/assetlinks.json` en el
   servidor con la huella de esa clave (hoy Android pregunta con qué abrirlo).
3. **Detalles menores**: al entrar por enlace, el botón "Compartir invitación"
   no aparece (la contraseña no se guarda en el panel); los estados se pueden
   cargar en Nuzlocke igual que en la web, sin restricción.

Lo de abajo es el razonamiento con el que se planteó, y sigue valiendo.


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

## Segunda generación por dentro

Oro, Plata y Cristal se juegan y se aleatorizan, pero no se les lee el equipo:
en segunda generación los Pokémon ocupan 48 bytes, no van cifrados y los motes
viven en listas aparte.

La buena noticia es que el sitio donde encaja ya existe: hay un registro de
lectores y añadir una generación es escribir un módulo al lado, sin tocar ni la
interfaz ni la red.

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

- ~~**Las medallas.** Se pintan bien, pero no se leen.~~ **Resuelto**: ver
  “Las medallas” en [completado.md](completado.md).
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

> **Lo que ya está hecho:** usuario y contraseña propios, sesión, la ficha de
> entrenador con su número, su foto y el cambio de contraseña, y la subida del
> historial que ya estaba guardado en el navegador. Vive en `apps/cuentas` con
> su base de datos. `test:cuentas`, `test:cuentas:ui`, `test:ficha`.
>
> Lo que sigue de esta sección es la nota de diseño con la que se hizo, y lo
> que queda abierto está dentro.

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

**La pantalla está escrita, pero no se enseña, y es a propósito.** El historial
va a tener **su propia página** el día que haya cuentas, en vez de ser una
tarjeta escondida en Ajustes: es lo que se mira cuando no estás jugando, y ahí
dentro no es donde se busca. Así que `HistorialModal` se queda en el repositorio
sin enchufar a ningún botón -tiene el aviso en su cabecera- y volver a
enchufarlo es un botón.

Lo que **sí sigue funcionando es apuntarlo**, y eso no se puede pausar: una
partida terminada no se vuelve a jugar. `test:historial` comprueba justamente
eso, que se siga guardando ahora que no se ve.

Lo que la pantalla ya resuelve, y no habrá que volver a pensar: la lista de la
más reciente a la más vieja, el porcentaje de victorias y cada fila desplegable
con hasta dónde llegó, qué equipo tenía y **los cuatro movimientos de cada
Pokémon, con su nombre**.

Dos decisiones que se tomaron al hacerlo y conviene no deshacer:

- **El porcentaje solo con cinco partidas o más.** Con tres jugadas un 33% no
  dice nada y parece que sí; hasta entonces se enseña la cuenta cruda.
- **Los nombres los pone la ROM del jugador.** Lo guardado son números, como en
  todo lo demás. Sin ROM puesta se ven los Pokémon pero no cómo se llaman: es el
  precio de no guardar nada del juego. La tabla de nombres de movimiento, que
  aquí se daba por no localizada, **ya se encuentra** (`test:movimientos`).

**Lo que falta: manejo de usuarios.** Cuentas, sesión iniciada y un sitio donde
vivan los datos. Es lo que convierte "mi historial en este navegador" en "mi
historial", y lo que permite comparar con tu compañera o recuperarlo desde otro
aparato. Lee el aviso de abajo antes de empezar: eso sí cambia el proyecto de
categoría.

**Y hay un diseño de cómo sería**, hecho en Lovable: un ranking con todos los
jugadores dentro. Está en la sección siguiente, **"El ranking: la página del
historial, con todos dentro"**, con las dos pantallas guardadas. Ahí se ve por
qué el login no es un accesorio, y qué hace falta empezar a apuntar YA para que
esa página no nazca con las partidas de este año a medias.

El sitio donde vivan es una base de datos, y tiene su propia sección más abajo:
**"La base de datos: llevar todo esto a PostgreSQL"**. Ahí está qué se sube, qué
no, y lo que arrastra consigo.

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

## El ranking: la página del historial, con todos dentro

> **Lo que ya está hecho:** la página existe, con el filtro por juego y por
> dificultad, los tres estados -victoria, derrota y descartada-, las columnas
> separadas de Nuzlocke sola y Soul Link, los sprites de verdad y los
> movimientos de cada Pokémon. `test:ranking`.
>
> Lo que sigue es la nota de diseño con la que se hizo; lo que queda abierto
> está dentro.

Hay un diseño hecho en Lovable y está guardado aquí al lado:
[solo](ranking/solo.png) y [soullink](ranking/soullink.png). Es la página que
ayer se decidió que el historial tendría algún día, y conviene mirarla antes de
escribir una línea: contesta sola varias preguntas que llevaban abiertas.

Lo que enseña: un ranking de jugadores ordenado por porcentaje de victorias, con
un conmutador **SOLO / SOULLINK** arriba del todo, las tres dificultades
explicadas en tarjetas, pestañas para filtrar por dificultad, un buscador, y
cada fila desplegable con sus últimas partidas terminadas -resultado, fecha,
juego, dificultad, hasta dónde llegó, las medallas y el equipo-.

Un detalle del diseño que no es casual: **"27 partidas" es exactamente 18V + 9D**.
O sea que ahí "partidas" son las terminadas. Las descartadas, que no suman ni a
un lado ni a otro, necesitan su propio sitio en la fila.

### El login no es un accesorio, es lo que lo convierte en ranking

Un ranking de una persona es una lista. Esto es lo que hace falta para que las
cuentas valgan la pena, y por eso van juntas: ver
**"Cuentas, historial y porcentaje de victorias"** aquí arriba y **"La base de
datos"** aquí abajo. Mientras no haya con qué decir de quién es cada partida, el
compilado de todos los jugadores no existe.

### Filtro por juego

No está en el diseño y hace falta: por juego, igual que ya hay por dificultad.

Y hay un agujero que lo complica. **Hoy una partida terminada no sabe de qué
juego es.** Lo único que guarda es el nombre del fichero de su copia; el nombre
del juego vive en la partida guardada, que es otra cosa y que **se borra**: solo
caben tres y se van reemplazando. En cuanto alguien borra la copia, la fila del
historial se queda sin juego. Se arregla apuntando el juego -su código, `BPR`,
`BPE`...- en el momento de terminar, que es cuando se sabe seguro.

### Tres estados: victoria, derrota y descartada

Una partida borrada o abandonada antes de llegar a la pantalla de victoria o de
derrota queda **descartada**. No cuenta para el porcentaje, pero se cuenta
aparte: saber cuántas ha descartado alguien dice mucho.

**Y es justo lo que hace que el porcentaje no mienta.** Si descartar fuera
gratis e invisible, en una Nuzlocke bastaría con borrar cada partida que va mal
antes de que el juego la dé por perdida para quedarse en el 100%. Enseñar el
número de descartadas al lado del porcentaje no es un adorno: es lo que lo
sostiene. Un 90% con dos descartadas y un 90% con treinta no son el mismo 90%.

Hay que decidir **cuándo se da una por descartada**, y la respuesta corta es:
solo cuando el jugador la borra a propósito. Lo demás es adivinar. Una partida
que lleva dos meses sin tocarse no está descartada, está parada, y contarla como
descartada castiga a quien juega despacio.

**Esto tampoco se está apuntando hoy.** Borrar una partida guardada no deja
rastro de ninguna clase. Cada una que se borre de aquí al día del ranking es una
descartada que ya no se podrá contar.

### Nuzlocke sola y Nuzlocke en Soul Link son dos cosas distintas

Y tienen que ir separadas, como en el diseño. No es la misma partida: en Soul
Link tu Pokémon muere también cuando muere el de la otra persona, así que son
dos runs que se caen a la vez. Mezclar las dos en un mismo porcentaje hace que
ninguno de los dos números signifique nada.

**El agujero, otra vez, está en lo que se apunta.** Hoy se guarda `porElEnlace`,
que dice **cómo acabó** -si la mató una pareja caída-, no **cómo se jugó**. Una
partida de Soul Link que se pierde por tu propia cuenta se apunta con
`porElEnlace: false` y acabaría contada en SOLO, que es donde no va. Hace falta
guardar el modo al terminar -había compañero conectado o no-, y eso ya se sabe
en ese momento.

De paso: el ranking de Soul Link es **de parejas** -"Juan + Mateo"-, así que la
pareja es la entidad y hay que guardar con quién se jugó. Su apodo ya se conoce
mientras dura la sala. Un apodo no identifica a nadie -se escribe a mano y no se
comprueba-, así que el ranking de parejas de verdad necesita las cuentas; pero
apuntar el apodo ahora es gratis y es lo único que habrá de las partidas de
antes.

### Cuándo una partida es Soul Link, y con quién — HECHO

- **Se pregunta, no se deduce.** Abrir una sala ya no convierte la partida en
  Soul Link. Cuando entra el compañero y la partida está empezando (sin medallas
  y como mucho con el inicial) sale la pregunta: "Sí, Soul Link" o "No, solo
  jugar juntos". Lo elegido se manda al otro (mensaje `soullink`) y vale para
  las dos partidas. Más tarde ya no se ofrece. Sin Soul Link se juega junto pero
  sin parejas: lo que caiga en su partida no toca la tuya.
- **La Soul Link es con quien se empezó.** El servidor de salas comprueba la
  cuenta de cada uno con su sesión (pregunta a `/yo` del servicio de cuentas con
  la galleta del socket) y se la pasa al otro como `peerUsuario`. El apodo no
  vale para esto: lo escribe cada uno. La partida guarda `companeroSoullink`.
- **Con otra persona** se puede jugar junto, pero sin parejas y con un aviso.
- **Para el ranking**, una Soul Link de alguien con cuenta solo cuenta si se
  termina con la misma cuenta con la que se empezó. Si no, el final se apunta en
  el historial con el motivo (`fueraDelRanking`) y no se sube. Sin cuenta no se
  valida nada: tampoco se sube.
- **Decidido así y fácil de cambiar:** si la Soul Link se empezó con alguien
  sin cuenta, no hay a quién comprobar y cuenta igual.

**Falta comprobar** en el servidor real que la galleta llega al socket por el
túnel (Caddy la pasa tal cual; debería).

### El modal de perfil de usuario

Pulsar a alguien en el ranking y ver quien es: su apodo, desde cuando juega,
cuantas partidas lleva, su porcentaje, con que juegos juega mas, que
dificultades elige y cuantas ha descartado. Y, si es tu propio perfil, poder
cambiar el apodo y la contrasena, y borrar la cuenta.

Hoy una fila del ranking se despliega y ensena sus ultimas partidas, que es
otra cosa: eso es "que ha hecho ultimamente" y el perfil es "quien es". Las dos
valen y no se estorban.

Un apunte que conviene decidir antes de dibujarlo: **que ve de ti alguien que
no eres tu**. El correo no, desde luego -ni se pide-. El resto, en un proyecto
que va de jugar con quien conoces, puede verse entero sin problema; pero es una
decision, no un descuido.

---

### Lo que hoy NO se apunta, y hace falta

| Lo que pide el ranking | ¿Se apunta hoy? |
| --- | --- |
| Resultado, fecha, medallas, equipo con movimientos | **Sí** |
| De qué juego es | No. Está en la partida guardada, que se borra |
| Modo: sola o Soul Link | No. Solo se sabe si el final vino por el enlace |
| Con quién se jugó | No |
| Descartadas | No. Borrar no deja rastro |
| Dificultad | **Sí**, desde que existen. Lo de antes cuenta como Normal |
| Hasta dónde llegó, más allá de las 8 medallas | No |

Dos de esas merecen explicación:

- **La dificultad no se puede apuntar porque todavía no se ha hecho** -está en
  la sección siguiente-. Todo lo jugado antes de que exista entrará en el
  ranking como Normal, y no hay forma de arreglarlo después. No es grave, pero
  conviene saberlo antes de que alguien se extrañe.
- **"ALTO MANDO · AGATHA" y "CAMPEÓN" están más allá de las medallas.** Hoy solo
  se lee el byte de las ocho; el Alto Mando y el Salón de la Fama son otra cosa
  que hay que ir a buscar a la partida. Con ocho medallas y sin más dato, lo
  honesto es decir "8 medallas" y no inventarse a qué miembro llegó.

### Por dónde empezar

La página entera necesita cuentas y base de datos, que es lo pesado. Pero **la
mitad barata no espera a nada**: apuntar el juego, el modo, el compañero y las
descartadas son cuatro campos más en lo que ya se guarda al terminar, y es lo
único de esta lista que se pierde para siempre si se deja para luego. El ranking
se puede dibujar el año que viene; las partidas de este mes, no.

---

## La base de datos: llevar todo esto a PostgreSQL

> **Lo que ya está hecho:** PostgreSQL levantado, con sus migraciones
> numeradas que se aplican al arrancar y los ficheros de despliegue en
> `deploy/`. Lo que no sube sigue sin subir: ni ROMs ni partidas.
>
> Lo que sigue es lo que se escribió antes de montarlo, y vale para entender
> por qué está como está.

Con cuentas y perfiles hace falta un sitio donde vivan los datos, y ese sitio es
una base de datos de verdad. Esto es lo que se sabe antes de empezar.

### Lo que hoy se guarda, y dónde

Todo está en el navegador. Nueve claves en `localStorage`:

| Clave | Qué es | ¿A la base de datos? |
| --- | --- | --- |
| `emupoke.partidas` | Las partidas aleatorizadas: nombre, semilla, ajustes, CRC, de qué juego, cuándo se jugó | **Sí.** Es el catálogo de lo que has jugado |
| `emupoke.historial` | Las partidas terminadas: resultado, medallas, equipo y movimientos | **Sí.** Es el motivo de todo esto |
| `emupoke.fin.<partida>` | Si una partida está dada por terminada, y cómo | **Sí**, pegado a su partida |
| `emupoke.trato.<partida>` | El diario de un intercambio a medias | **No.** Es un apaño para que un intercambio cortado no pierda un Pokémon; muere con la sesión |
| `emupoke.apodo` | Cómo quieres que te llamen | **Sí**, pasa a ser parte de la cuenta |
| `emupoke.teclas`, `emupoke.mando`, `emupoke.volumen`, `emupoke.esquina` | Cómo tienes configurado ESTE aparato | **No.** Sincronizar el mando entre el móvil y el PC es empeorarlo |

Y en IndexedDB, por debajo del sistema de ficheros de mGBA: **las copias
aleatorizadas** (16 MB cada una, hasta tres) y **los guardados** de cada una.

### Lo que NO sube, y es la regla que no se negocia

**Las ROMs no salen de tu ordenador.** Ni la original ni las copias
aleatorizadas. Eso es lo que mantiene limpia la línea legal de todo el proyecto
y no cambia porque haya base de datos: una copia aleatorizada es el juego con
otros datos dentro, y subirla sería repartir el juego.

No hace falta, además: una copia se **rehace** desde su semilla, que son cuatro
campos de texto. Es justo para lo que se diseñó así desde el principio.

**Los guardados (`.sav`) son otra cosa y hay que decidirlo aparte.** No son el
juego: son lo que ha hecho el jugador. Guardarlos en el servidor es lo que
permitiría seguir tu partida desde otro aparato, que es de las cosas más útiles
que podría dar una cuenta. Son unos 128 KB cada uno. La decisión no es técnica,
y conviene tomarla a propósito en vez de que salga sola al escribir el esquema.

### El problema de identidad, que es el que muerde

Hoy una partida se identifica por **el nombre del fichero de su copia**
-`Pokemon...-aleatoria-mv24cpl8.gba`-, que se inventa con el reloj al crearla.
Eso vale dentro de un navegador y no vale para nada fuera: el mismo mundo jugado
desde otro aparato tendría otro nombre.

**Lo que identifica una partida de verdad es su semilla**: CRC de la ROM
original, CRC de la copia, el número y los ajustes. Dos personas con la misma
semilla están jugando el mismo mundo, que es lo que hace que el enlace de
invitación funcione. Al llevar esto a la base de datos, la clave tiene que ser
esa, no el nombre del fichero.

Lo mismo con el historial: hoy cada partida terminada se identifica con
`fichero:resultado:enlace`, que es un apaño para no apuntarla dos veces en el
mismo navegador. Como clave de verdad no sirve.

### Un esquema de partida

Cinco tablas bastan para lo que se ha pedido:

- **`usuarios`** — quién eres. Lo mínimo: un identificador, un apodo y cómo
  entras (ver más abajo).
- **`partidas`** — una por mundo jugado: usuario, semilla completa, de qué juego
  es, qué se aleatorizó, cuándo se creó y cuándo se jugó por última vez.
- **`partidas_terminadas`** — resultado -victoria, derrota o **descartada**, ver
  la sección del ranking-, si fue por el enlace, el modo -sola o Soul Link-, con
  quién se jugó, de qué juego era, cuántas medallas y cuándo. Una fila por
  final.
- **`pokemon_del_final`** — el equipo de ese momento: especie, mote, nivel, si
  cayó y sus cuatro movimientos. Puede ir como tabla o como JSON dentro de la
  anterior; con Postgres, `jsonb` es perfectamente razonable aquí porque nunca
  se consulta por dentro, solo se enseña entero.
- **`guardados`** — solo si se decide subir los `.sav`.

Nada de eso lleva un byte del juego: números, textos cortos y fechas.

### Y la migración de lo que ya hay

**Esto es lo que no se puede olvidar.** Se empezó a recoger el historial antes
de tener dónde guardarlo justamente para que el día de las cuentas hubiera algo
que contar. Si al iniciar sesión por primera vez no se sube lo que ya está en el
navegador, todo eso se pierde y el esfuerzo de haberlo guardado antes no sirvió
de nada.

O sea: la primera vez que alguien entra con su cuenta, lo que haya en
`emupoke.partidas`, `emupoke.historial` y `emupoke.fin.*` se manda y se funde
con lo que haya en el servidor. Y conviene que se pueda repetir sin duplicar,
porque la gente entra desde dos aparatos.

### Lo que esto arrastra, y no es poco

Hoy el servidor no guarda absolutamente nada. Pasar a tener base de datos trae
consigo, todo a la vez:

- **Autenticación.** Contraseñas con su cifrado, o entrar con un tercero. Lo
  segundo quita de encima la parte más fácil de hacer mal.
- **Datos personales.** Un apodo y un correo ya lo son. Eso significa poder
  borrar la cuenta y lo que cuelga de ella, y decir en algún sitio qué se
  guarda.
- **Copias de seguridad y migraciones.** Hoy no hay nada que respaldar ni
  esquema que versionar. A partir de aquí, las dos cosas.
- **Un sitio donde corra Postgres**, que hay que actualizar en
  [despliegue.md](despliegue.md) y dimensionar en [capacidad.md](capacidad.md).

**Un apunte sobre las salas:** viven en memoria y se pierden al reiniciar el
servidor -está en las deudas técnicas, más abajo-. Postgres por sí solo no
arregla eso: una sala es un par de WebSockets abiertos, y si el proceso se cae,
las conexiones se caen con él. Guardarlas serviría para que los dos pudieran
volver a entrar en la misma sala, no para que la conexión sobreviva.

**Y la recomendación de orden:** lo que hay hoy en el navegador ya da para el
historial y el porcentaje -de hecho la pantalla está escrita, solo que sin
enchufar hasta que tenga su propia página-. La base de datos no añade una
función nueva, añade que te siga a otro aparato y que puedas compararte con tu
compañera. Vale la pena, pero conviene tener claro que se paga con todo lo de la
lista de arriba.

Y van juntas: la página del historial y las cuentas se hacen de una vez, porque
es la misma pantalla con y sin tus datos dentro.

---

## Dificultad: Normal, Nuzlocke y Nuzlocke nivelada

**Hecho lo que se puede vigilar.** Se elige en la pantalla que sale justo
despues de aleatorizar, al lado del nombre, porque el menu del aleatorizador ya
iba cargado. Se genera la copia de Nuzlocke, que es la de serie; si se elige
Normal se rehace con la misma semilla dejando Revivir en las tiendas, y la
semilla que se ve es siempre la de la copia que se va a jugar. Al empezar queda
fijada: es de la PARTIDA y no se cambia despues. Lo que enciende cada
una vive en `apps/web/src/core/dificultad.ts` y lo vigila `test:dificultad`.

| | Normal | Nuzlocke | Nivelada |
| --- | --- | --- | --- |
| Revivir en las tiendas | Si | No | No |
| Fin de partida al caer el equipo | Si | Si | Si |
| Apagar al que se pasa del tope | No | No | **Si** |
| Avisar de tipo primario repetido (los dos equipos) | No | No | **Si** |
| Avisar de segunda captura en una zona ("RUTA") | No | **Si** | **Si** |
| Avisar de un muerto en pie ("REVIVIDO") | No | **Si** | **Si** |
| El numero del tope bajo las medallas | Se ve | Se ve | Se ve |

Decisiones tomadas, para no volver a discutirlas:

- **El fin de partida es igual en las tres.** Al caer el equipo sale el cartel,
  se puede seguir jugando, y desde ahi **se apaga todo lo que vigila la
  dificultad**: ya no se compite, asi que no hay reglas que cumplir. Lo que
  cuenta para el historial es hasta donde se llego. Ver `acabada` en
  `useFinDePartida.ts`.
- **Se avisa, no se impide.** El tope y el tipo repetido marcan la ficha; quien
  decide a quien guardar es el jugador.
- **Viaja en la semilla**, como sexto campo. Asi la invitacion de un Soul Link
  la fija sola -quien entra la ve antes de aceptar y no la puede cambiar- y la
  receta rehace la copia igual, que importa porque Revivir cambia la ROM. Las
  semillas de cinco campos se leen como antes y se rehacen como se hicieron.
- **Revivir fuera de las tiendas tambien sin "Objetos de tienda".** En una
  Nuzlocke con las tiendas sin aleatorizar se quitan igual, sustituidos por
  otro objeto que esa ROM ya vendia (`quitarRevivir` en `tiendas.ts`).
- **El ranking filtra por dificultad.** Lo jugado antes cuenta como Normal.

**Las dos de Nuzlocke tambien se vigilan**, en `reglasNuzlocke.ts`:

- **Solo el primero de cada ruta.** Cada Pokemon lleva la zona donde se
  capturo (byte 1 de la subestructura M). Es la zona con nombre y no el mapa,
  asi que las plantas de una cueva cuentan como una, que es como se juega. Se
  apunta que Pokemon gasto cada zona, asi que liberarlo no la deja libre. No
  cuentan los huevos, los intercambios del juego, los eventos ni lo que te llega
  por intercambio, que trae la zona de la partida del otro: se reconoce porque
  su entrenador original no eres tu.
- **Debilitado = muerto.** Curarse en el Centro con debilitados es un guion y
  no se ve, pero su resultado si: un Pokemon que estuvo debilitado vuelve a
  estar en pie, por un Revivir o por el Centro. Se apunta quien cayo, asi que
  tambien se pilla si se curo en el PC y vuelve despues. El combate del
  laboratorio no cuenta: hasta haber visto dos Pokemon distintos una caida no
  es muerte, la misma regla que el fin de partida.

Lo que no se puede: impedirlo, y avisar ANTES de lanzar la ball en una zona
gastada, que pide saber en que mapa esta el jugador ahora mismo. Ver "Que rutas
estan gastadas", mas abajo.

Lo que sigue es como se penso antes de hacerlo.

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

### Los objetos de revivir, solo por el suelo — HECHO

**Ya no salen en ninguna tienda.** Si se pueden comprar, revivir es cuestión de
dinero y la regla de "un debilitado está muerto" se queda en un trámite.
Dejándolos solo en el suelo, encontrarse uno tirado en una ruta es un golpe de
suerte de verdad.

Medido en la ROM española: **once de las veintitrés tiendas vendían Revivir** de
serie, y después de aleatorizar no queda ninguno en ninguna.

Dos cosas que conviene recordar de cómo se hizo:

- **Hay dos pasadas, no una.** Quitarlos del catálogo solo los quita de las
  veinte tiendas que tocamos nosotros; las otras tres las aleatoriza el
  randomizer y las ponía igual que el juego. Hay una segunda pasada por las
  veintitrés que cambia el que haya quedado. Sin eso la regla valdría en veinte
  sitios y no en tres, que es como no valer.
- **Los índices 24 y 25 están deducidos, no leídos.** La tienda de Ciudad Verde
  vende `4,13,14,18` y el juego los enseña como Poké Ball, Poción, Antídoto y
  Antiparaliz a 200, 300, 100 y 200: nombres *y* precios cuadran con la tabla de
  objetos de siempre, donde el 24 es Revivir. Lo refuerza la tienda de
  `0x164A4C`, que vende `2,3,19,20,21,24,23,85,84` -una lista de grandes
  almacenes, con el 24 justo donde encaja un Revivir-. Aun así es una deducción:
  mirar la tienda de Ciudad Azulona dentro del juego lo confirma en cinco
  minutos, y hasta entonces queda escrito aquí.

`apps/randomizer/src/tiendas.ts`, `test:tiendas`.

### Las reglas que sí se hacen cumplir

Excepción a "se avisa, no se impide", pedida a propósito. Con el reto vivo:

| Regla | Dificultad | Qué pasa si se rompe |
|---|---|---|
| Al entrar en el Centro con alguien que no deberías llevar, hay que dejarlo en el PC antes de seguir. Se dice al entrar y se queda dicho hasta que se cumple | Nuzlocke, Nivelada | Nada que deshacer: entrar no rompe nada. Lo hacen cumplir las dos de abajo |
| La enfermera no atiende con alguien así en el equipo: un muerto -aunque esté en pie porque se sacó del PC- o, en Nivelada, un tipo primario repetido. De un muerto, la única forma de que vuelva es un Revivir: entonces deja de estar muerto | Nuzlocke, Nivelada | Se vuelve a la entrada del Centro |
| No se sale del Centro con un muerto, también si está en pie por haberlo sacado del PC | Nuzlocke, Nivelada | Se vuelve a justo antes de salir |
| No se sale del Centro con un Pokémon de tipo primario repetido entre los equipos (su ficha sale apagada) | Nivelada | Se vuelve a justo antes de salir |
| No se pelea contra el siguiente líder con alguien por encima de su tope | Nivelada | Se vuelve a antes del combate |
| Solo el primer encuentro de cada zona: si no se captura, se pierde. Si es de una familia que ya llevas en el equipo, no cuenta y vale el siguiente | Nuzlocke, Nivelada | Al empezar el combate se avisa; lanzar una Poké Ball (o capturar) se deshace volviendo al principio de ese combate |

El **mapa** pinta gastada una zona en cuanto tiene su encuentro, se capture o
no: es la misma cuenta que usan las reglas (`zonasGastadas`, en
`reglasEnVivo.ts`). Estuvo contando solo las capturas, y por eso una ruta ya
jugada seguía saliendo libre.

El **tope de nivel no obliga a guardar nada** en el Centro: pasarse del tope no
impide andar por el mundo, impide pelear contra el líder. Eso se decidió al
mover la regla al combate y sigue así.

**Cómo se impide.** El equipo se mira cada tres segundos guardando un estado, y
se conservan los del último minuto. Al romperse una regla se carga uno de esos,
lo bastante atrás para no caer otra vez en lo mismo nada más cargar; si la misma
regla salta otra vez enseguida, se va más atrás. Sale un aviso con el porqué,
también a pantalla completa. No se escribe nada en la partida.

**Cómo se sabe cada cosa**, sin direcciones a mano salvo la de combate:

- **El mapa**: la tabla de mapas se busca por forma. Ojo con los punteros: los
  de GUIONES no están alineados a cuatro (apuntan a datos de guion, byte a
  byte), y exigirles alineación tiraba 41 de los 43 grupos de Rojo Fuego. Con
  eso la tabla no se encontraba y el programa no supo nunca en qué zona estaba
  el jugador, así que no funcionaba nada de lo que cuelga del mapa. La prueba
  no lo vio porque la ROM fabricada salía más limpia que las de verdad; ahora
  `test:mapas` las usa si están en `roms/`.
- **El Centro**: todos comparten disposición por dentro; se aprende en la
  primera cura de la enfermera. Hasta entonces no se vigila ni la de salir ni la
  obligación de guardar al entrar.
- **El rival del combate**: la copia de combate que va justo después de la tuya
  (`rivalEnCombate`). Salvaje si lleva tu número de entrenador, que es como el
  juego crea a los salvajes.
- **El líder**: lo que saca es exactamente uno de su equipo, leído de la ROM
  (`equiposDeLosLideres`). Solo Kanto, como el tope.
- **Los repetidos**: familias evolutivas de la tabla de evoluciones de la ROM
  (`familiasEvolutivas`), que en una aleatorizada es la que vale.
- **Primer encuentro**: empieza a contar con la primera captura (antes no hay Poké
  Balls). Por zona se apunta el primer salvaje en
  `emupoke.encuentros.<partida>`.

- **Lanzar una Poké Ball**: el bolsillo de Poké Balls de la mochila cambia en
  mitad de un combate salvaje (`mochila.ts`). El bloque de guardado se encuentra
  por forma: el mapa actual en su cabecera y el bolsillo a la distancia de cada
  juego. Necesita la bandera de combate, así que hoy solo en Rojo Fuego español.

`apps/web/src/core/reglasEnVivo.ts`, `test:reglas:vivo`.

**Lo que no se ve:** una captura con el equipo lleno va directa al PC, y el PC no
se lee; esa no se puede deshacer. La bandera de combate solo se conoce de Rojo
Fuego en español: en los demás juegos el rival se reconoce igual, por su
personalidad nueva, pero con menos certeza.

**Falta comprobarlo jugando**: todo esto está probado con datos fabricados.

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

## Los avisos, con cara de Pokémon

**Pedido:** que los avisos se parezcan al juego y no a una alerta del
navegador. Hoy son una tarjeta oscura con un círculo rojo y un botón
"Entendido" -lenguaje de aplicación-, encima de una pantalla que es puro píxel.
Lo que se dice está bien; lo que desentona es cómo se dice.

**Dónde está:** `.aviso-regla` y `.avisos` en `styles.css`, y el bloque que los
pinta en `App.tsx`. Son tres y conviene no mezclarlos, porque no dicen lo mismo:

1. **Una regla que se acaba de hacer cumplir** (`--error`). Acabas de aparecer
   donde estabas hace un momento y tienes que saber por qué.
2. **Información** (`--info`): el primer encuentro de una zona, un Revivir que
   devuelve a alguien, "sin Poké Balls esto no cuenta".
3. **El deber del Centro** (`--deber`): lo que falta por hacer para poder
   seguir. Este no se puede quitar y se queda hasta que se cumple.

**La idea:** la caja de texto del juego. Marco doble claro sobre fondo azul o
crema, la tipografía de píxel que ya usa el programa, el texto saliendo a la
velocidad a la que escribe el juego si se quiere ir fino, y el triángulo ▼ en
vez de un botón "Entendido" -se cierra con A o pulsando, como un diálogo-. La
marca de la izquierda, en vez de un círculo con "!", puede ser una Poké Ball
(regla rota), un Poké Ball abierto o un icono de ruta (información) y el PC
(el deber).

**Lo que no se puede perder por el camino**, que es lo que costó dejar bien:

- Se lee **a pantalla completa**: va dentro del marco del juego a propósito.
- Los tres caben a la vez en una columna que crece hacia arriba, y en un móvil
  de 390 píxeles cada uno ocupa varias líneas. No pueden volver a pisarse.
- `role="alert"` en los que interrumpen y `role="status"` en los que informan:
  quien use lector de pantalla se entera igual.
- El deber **no lleva botón de cerrar**. Si se le pone el ▼ del juego, que sea
  solo en los otros dos.
- Los de regla rota duran 9 segundos y los de información 6. Con la caja del
  juego, igual pide pulsar para cerrar en vez de irse solos; entonces hay que
  mirar que no se amontonen al encadenar varios.

`test:deber` fija hoy que los dos carteles se vean a la vez y no se pisen, en
ordenador y en móvil. Ese es el contrato: puede cambiar el color y la forma,
pero esas comprobaciones tienen que seguir en verde.

---

## Pendientes sueltos de las reglas

- **Marcar una ruta a mano como gastada, desde el mapa.** El programa no lo ve
  todo -una ruta jugada antes de que la regla funcionara, un encuentro perdido
  mientras la página estaba cerrada- y hoy no hay forma de decírselo. Un botón
  en la zona enfocada del mapa lo arregla. Que se pueda desmarcar **solo si la
  marcaste tú**: una zona gastada por un encuentro de verdad no se libera.
- **Un Pokémon regalado puede deshacerse como si fuera una segunda captura.**
  El Eevee de Azulona, el Magikarp del vendedor, los fósiles: llegan con el
  sitio donde te los dan, así que si esa zona ya tuvo su encuentro,
  `juzgarCaptura` los toma por una captura prohibida y deshace. Se arregla
  exigiendo que la captura ocurra dentro de un combate salvaje (`enCombate` y
  el rival), que es lo que separa capturar de recibir.

---

## Los otros juegos: qué funciona hoy y qué falta para cada uno

Esto no es una lista de deseos: es el reparto real del trabajo que queda, con
lo que ya está hecho por debajo de cada juego. El orden de abajo es el del
esfuerzo, de menos a más.

**Lo que es común y ya sirve para los cinco de GBA:** leer el equipo, especies,
tipos, movimientos, motes, intercambios, la tabla de evoluciones, la Pokédex
nacional, la tabla de objetos y de tiendas, la tabla de mapas (comprobada
contra las cinco ROMs en `test:mapas`) y el bolsillo de Poké Balls, que tiene
sus distancias para `BPR`, `BPG`, `BPE`, `AXV` y `AXP`.

**Lo que está atado a un juego concreto**, y es lo que hay que repetir:

| Qué | Dónde | Hoy solo |
|---|---|---|
| La bandera de "hay combate" | `combate.ts`, `MARCAS_DE_COMBATE` | `BPRS` (Rojo Fuego español) |
| Las medallas | `medallas.ts` | `BPR` |
| Los líderes y el tope de nivel | `lideres.ts` | Kanto |
| El esquema del mapa | `zonas.ts` | Kanto y Hoenn, los dos hechos |

### Rojo Fuego y Verde Hoja — al 90%

Es el juego de referencia y lo que de verdad está probado. Funciona el
aleatorizador entero, las reglas de las tres dificultades, el mapa, los
intercambios, el Soul Link y el ranking.

Lo que le falta para el 100%:

- **Verde Hoja no tiene confirmadas las medallas.** Usa el mismo formato casi
  con total seguridad, pero "casi" no basta: con una partida suya y su tarjeta
  de entrenador se confirma en un minuto (ver `medallas.ts`).
- **La bandera de combate solo se conoce del español.** En Verde Hoja -y en
  Rojo Fuego en inglés- el rival se reconoce igual por su personalidad, pero
  con menos certeza, y la regla de la Poké Ball necesita la bandera.
- **Bugs visuales sueltos.** Están vistos jugando y hay que irlos apuntando
  aquí según salgan: sin el caso concreto no se puede arreglar ninguno.

### Rubí, Zafiro y Esmeralda — el salto más corto

Son los más parecidos a Rojo Fuego y buena parte ya está: se aleatorizan hoy,
se les lee el equipo, se les encuentra la tabla de mapas y el bolsillo de
balls, y el esquema de Hoenn está dibujado en `zonas.ts`.

Lo que falta es exactamente lo de la tabla de arriba:

1. **La bandera de combate de cada uno.** Son punteros a código, así que cambian
   por juego Y por idioma. El método está escrito en `combate.ts` y se tarda lo
   que se tarde en comparar dos estados, uno en combate y otro fuera.
2. **Las medallas.** Mismo trabajo que costó una tarde en Rojo Fuego: buscar en
   dos estados de la misma partida el puntero que lleva al bloque.
3. **Los ocho líderes de Hoenn y sus topes**, que hoy solo están los de Kanto.
   En Esmeralda el orden de gimnasios cambia respecto a Rubí y Zafiro.

Con eso quedan al nivel de Rojo Fuego sin tocar nada más.

### Game Boy y Game Boy Color: Rojo, Azul, Amarillo, Oro, Plata y Cristal

**Se juegan ya**: el mismo núcleo mGBA emula GB, GBC y GBA, y está comprobado
con una ROM de Game Boy Color escrita a mano (`test:gbc`).

**Segunda generación ya se aleatoriza**: Oro, Plata y Cristal están en la lista
por su código de cuatro letras (`AAU`, `AAX`, `BYT`, `BXT`), español incluido.

**Primera generación no, y el motivo es pequeño:** aquellos cartuchos no traen
código de cuatro letras, así que no se les puede reconocer como a los demás. El
aleatorizador SÍ los sabe hacer -su fichero de posiciones trae Rojo, Azul y
Amarillo, también en español-, pero identifica la ROM por el título interno
("POKEMON RED") más la versión. Nosotros ya leemos ese título de la cabecera
(`romHeader.ts`), así que el trabajo es reconocerlos por título cuando no hay
código, y filtrar las opciones que en primera generación no existen (no hay
habilidades, ni naturalezas, ni objetos equipados, y los tipos son otros).

**Lo que no habría ni así: leer la memoria.** Ni de primera ni de segunda
generación se sabe leer el equipo, así que no hay panel, ni reglas, ni
intercambios, ni Soul Link: solo jugar y aleatorizar. Las estructuras de
segunda generación están descritas en "Segunda generación por dentro", más
arriba; las de primera son otras y más simples, pero hay que escribirlas.

### Nintendo DS: Diamante, Perla, Platino, HeartGold, SoulSilver y Blanco/Negro

**Aquí lo que falta no es el aleatorizador.** El jar ya trae las posiciones de
cuarta y quinta generación, con Diamante, Perla, Platino, HeartGold, SoulSilver
y los Blanco/Negro, en varios idiomas. Lo que no hay es con qué jugarlos.

Todo lo del núcleo -la prueba que ya se hizo, la licencia, las dos pantallas y
los intercambios- está más abajo, en **Nintendo DS**, y no se repite aquí para
no acabar con dos versiones distintas de lo mismo. Resumido: el núcleo arrancó
en el navegador en una prueba aparte, y lo que decide si se mete o no es la
licencia, no la técnica.

---

## Biblioteca de ROMs

Hoy hay que volver a elegir el fichero en cada sesión. Guardarlo en IndexedDB
daría una lista de "mis juegos" y se elegiría una vez.

Ojo con el sitio: ya se guardan hasta tres partidas aleatorizadas de 16 MB cada
una. Lo que ocupa ya se enseña, con aviso al acercarse al tope; antes de guardar
también las ROM habría que contarlas ahí.

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

Que juegos serian y por que el aleatorizador no es el problema: ver **Los otros
juegos**, mas arriba. Esto es el nucleo.

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

**Lo que sí está al alcance — HECHO a nivel de zona**, y da buena parte de la sensación, es un **mapa
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
- ~~**El mapa de depuración del núcleo se sube a producción.**~~ **Resuelto.**
  `sync-core.mjs` ya no lo copia al compilar -y además borra el que hubiera
  dejado un `npm run dev`, que es lo que habría dejado el arreglo sin efecto en
  la máquina donde más se nota-. En desarrollo se sigue copiando, que ahí es
  justo para lo que sirve. Son 456 KB menos en el despliegue.
- ~~**Sin límite de espacio visible.**~~ **Resuelto.** La lista de partidas
  guardadas enseña lo que ocupa el sitio frente a lo que deja el navegador, y
  avisa al pasar del 80%.
- **La prueba de paneles falla de vez en cuando.** Una de cada bastantes, y pasa
  al repetirla sin tocar nada: es una carrera, no una rotura. Se midieron las
  búsquedas en la ROM por si eran ellas y no lo son (233 ms los nombres, 52 las
  estadísticas, 16 la tabla de Pokédex).
  *(Ojo, no confundir con lo otro: `test:paneles` y `test:equipo` fallaban
  SIEMPRE con cualquier partida que no fuera aquella contra la que se
  escribieron. Eso ya está arreglado -ahora leen del propio estado lo que
  esperan-; esto de aquí es otra cosa y sigue viva.)*
- **El ruido de `unwind`.** Al cambiar de ROM, emscripten lanza una excepción
  `unwind` que aparece en la consola. Es normal y no rompe nada, pero ensucia.

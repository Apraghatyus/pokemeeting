# Intercambios entre las dos partidas

Estado: diseno. Sin implementar.

## Por que no emulamos el cable link

Lo primero que uno piensa es emular el cable: que los dos mGBA hablen por el
puerto serie como dos GBA reales. Existe (mGBA lo soporta entre instancias
locales), pero por internet no es viable:

El protocolo serie del GBA en modo multijugador va a 115200 baudios y **cuenta
ciclos**. Los dos juegos tienen que avanzar en paso cerrado, fotograma a
fotograma, esperandose mutuamente. Eso es netplay *lockstep*: cualquier
microcorte en la red congela las dos partidas, y un desajuste de un solo ciclo
corrompe el intercambio a medias, que es la peor forma de fallar en un juego
donde el jugador acaba de entregar su Pokemon.

## Lo que haremos: cirugia sobre el estado

Un Pokemon de tercera generacion es un bloque de **100 bytes** en la estructura
de equipo. No hace falta emular una conversacion entre consolas: basta con mover
ese bloque de una partida a la otra.

El procedimiento, con los dos juegos en pausa:

1. Cada lado hace un savestate y localiza su equipo dentro de la EWRAM.
2. Cada uno extrae los 100 bytes del Pokemon que ofrece.
3. Se intercambian por el canal de datos y se **validan** (ver abajo).
4. Cada uno escribe el bloque recibido en la ranura que dejo libre.
5. Se recargan los estados y ambos juegos siguen.

Es determinista, no depende de la latencia y no puede quedarse a medias si el
protocolo se hace bien.

## La estructura de 100 bytes

    0x00  4  valor de personalidad   <- semilla de todo: genero, naturaleza, orden
    0x04  4  ID del entrenador original
    0x08 10  mote
    0x12  1  idioma
    0x13  1  banderas
    0x14  7  nombre del entrenador original
    0x1B  1  marcas de la caja
    0x1C  2  checksum
    0x1E  2  relleno
    0x20 48  datos cifrados: 4 subestructuras de 12 bytes
    0x50 20  estado de combate: nivel, HP actual, estadisticas (solo en el equipo)

Los 48 bytes cifrados guardan especie, objeto, experiencia, movimientos, EV, IV
y demas, repartidos en cuatro subestructuras. Dos detalles que hay que respetar
o el juego rechaza el Pokemon:

- **El cifrado** es un XOR palabra a palabra con la clave
  `personalidad XOR idEntrenador`.
- **El orden de las cuatro subestructuras** lo decide `personalidad % 24`. No es
  fijo: hay 24 permutaciones posibles y cada Pokemon usa la suya.
- **El checksum** en 0x1C es la suma de las palabras de 16 bits de los 48 bytes
  ya descifrados. Si no cuadra, el juego lo trata como un "Pokemon malo".

Como lo movemos entero y sin tocarlo, cifrado y checksum viajan intactos y
siguen siendo validos en la otra partida. Solo hay que recalcular si alguna vez
decidimos modificar algo por el camino.

## Evitar duplicar Pokemon

Es el riesgo real: si el envio se confirma en un lado y falla en el otro, o el
jugador cierra la pestana a mitad, aparece un Pokemon duplicado o desaparece
uno. Por eso el intercambio es en dos fases y no se da por hecho hasta el final:

1. **Reserva**: los dos anuncian lo que ofrecen y se quedan a la espera. Nadie
   ha borrado nada todavia.
2. **Confirmacion**: cuando los dos han recibido y validado el bloque del otro,
   y solo entonces, cada uno aplica el cambio en su partida.

Si algo falla antes de la confirmacion, los dos vuelven al estado anterior: el
savestate previo sigue ahi, y recargarlo deshace todo limpiamente.

## Limitacion conocida: evoluciones por intercambio

Machoke, Haunter, Kadabra y compania evolucionan porque el juego lo dispara al
terminar la rutina de intercambio real. Moviendo el bloque de datos no pasamos
por esa rutina, asi que **no evolucionan**.

No lo vamos a ocultar. La interfaz lo dira cuando el Pokemon ofrecido sea de los
que evolucionan al intercambiar, y mas adelante podemos ofrecer un boton
explicito de "forzar evolucion" que reescriba la especie, claramente marcado
como lo que es: una intervencion del emulador, no una mecanica del juego.

## Intercambiar entre ROMs randomizadas de forma distinta

Es el caso normal en este proyecto, no una excepcion: cada jugador randomiza su
copia por su cuenta, asi que las dos ROMs tienen datos distintos.

Lo primero que hay que entender es que **el bloque de 100 bytes guarda indices,
no definiciones**. Dice "especie 25", "movimiento 85", "objeto 13". Que es la
especie 25, cuanto ataque tiene y como se llama vive en la ROM, no en el bloque.

Aqui hubo una suposicion equivocada que conviene dejar corregida, porque
cambia lo que hay que decirle al jugador.

**Lo que se creia:** que un Pokemon intercambiado entre dos aleatorizaciones
llegaria convertido en otra especie, porque el numero de especie significaria
cosas distintas en cada ROM.

**Lo que pasa de verdad**, comprobado generando dos copias aleatorizadas de la
misma ROM y comparandolas: la tabla de nombres queda **identica** en las dos.
El randomizer no renombra especies, cambia sus datos. Un Bulbasaur llega como
Bulbasaur.

Lo que si cambia:

> El Pokemon conserva su nombre, su mote, sus IV y su experiencia, pero pasa a
> tener las **estadisticas, el tipo y la habilidad** que esa especie tenga en la
> ROM que lo recibe. Un Bulbasaur con 45 de PS en una copia puede tener 30 en
> la otra.

Medido sobre dos copias reales:

| | original | copia A | copia B |
|---|---|---|---|
| Nombre de la especie 1 | BULBASAUR | BULBASAUR | BULBASAUR |
| Sus PS base | 45 | 30 | 53 |

Sigue siendo lo mismo que pasaria con dos cartuchos randomizados y un cable
link de verdad, y sigue habiendo que decirlo. Pero decirlo bien.

### Lo que si puede romper de verdad

Un indice fuera de rango no da un Pokemon raro: da un "Bad Egg" o cuelga el
juego. Antes de inyectar nada hay que validar contra la ROM **que recibe**:

| Comprobacion | Por que |
|---|---|
| Checksum correcto tras descifrar | Demuestra que el bloque llego integro |
| Especie dentro del limite de la ROM receptora | Un hack puede tener mas o menos especies que el otro |
| Todos los IDs de movimiento validos | Igual que la especie |
| ID de objeto valido | Idem |
| Nivel entre 1 y 100 | Un nivel fuera de rango corrompe la tabla de estadisticas |

Si algo no pasa la validacion, el intercambio **se rechaza entero** y se explica
por que. Nunca se inyecta un bloque dudoso: el coste de equivocarse es la
partida del jugador.

### Ensenar lo que va a pasar antes de aceptar

Se puede hacer mejor que avisar en general. Cada jugador puede leer de su propia
ROM la tabla de nombres de especies, asi que al ofrecer un intercambio puede
decirle al otro **como se llama esa especie en su juego**.

El dialogo de intercambio entonces muestra las dos caras:

    Entregas:  PIKACHU   (especie 25)
    El recibe: GOLEM     (especie 25 en su copia)

Asi la sorpresa es una decision, no un accidente. Y leer la tabla de nombres de
la ROM en vez de llevarla codificada es lo mismo que ya hace falta para que los
nombres salgan bien en una ROM randomizada o traducida.

## Lo que ya esta comprobado contra una partida real

Todo lo de arriba dejo de ser teoria. Sobre una partida de Rojo Fuego espanol
con un Bulbasaur llamado CCC y un entrenador llamado AAA:

| Pieza | Resultado |
|---|---|
| La memoria dentro del estado | empieza en `0x21000` |
| El equipo del jugador | `0x02024284`, encontrado por checksum, sin saber la direccion |
| El contador del equipo | `0x02024029`, valia 1 |
| El equipo rival | `0x0202402C` |
| Descifrado | mote "CCC", entrenador "AAA", nivel 6, movimientos 33 y 45 |
| Tabla de nombres de la ROM | `0x24164C`, confirmada con cuatro nombres conocidos |

Y la mitad dificil, escribir en la partida de alguien, tambien: se inyecto un
Pikachu de nivel 22 llamado REGALO en la segunda ranura y **el juego lo
acepto**, con su sprite, su nivel, sus PS y su simbolo de genero, junto al
Bulbasaur intacto.

### Una trampa que costo encontrar

En la subestructura de misceláneo, la palabra en el desplazamiento 4 guarda los
seis IV en sus treinta primeros bits **y la bandera de HUEVO en el bit 30**.
Rellenarla con `0x7FFFFFFF` creyendo poner los IV al maximo enciende esa
bandera, y el Pokemon aparece en el equipo sin nivel ni PS porque el juego lo
trata como un huevo. Lo correcto es `0x3FFFFFFF`.

## Un intercambio de verdad, entre dos copias aleatorizadas

Este es el escenario que importa, y ya esta hecho: dos aleatorizaciones
distintas de la misma edicion, cada una con su ROM y su partida.

Se generaron dos copias de Rojo Fuego espanol con el randomizer del propio
proyecto, con semillas distintas, y se cruzaron un Bulbasaur y un Charmander.
Cada lado leyo de su partida lo que entregaba y escribio en su partida lo que
recibia; ningun lado toco el estado del otro.

| | jugador A | jugador B |
|---|---|---|
| ROM | `becc1ebf` | `57466f14` |
| entrega | BULBASAUR "CCC" Nv6 | CHARMANDER Nv5 |
| esa especie, en su copia | Tierra, 45/40/19/25/88/102 | Volador, 38/70/29/61/67/44 |
| esa especie, en la del otro | Dragon, 60/37/38/86/69/29 | Siniestro, 47/45/45/49/51/73 |

Las dos partidas se cargaron despues en el emulador, cada una con su ROM, y el
menu del equipo enseña lo que tiene que ensenar: A tiene un CHARMANDER de nivel
5 con 19 PS, y B tiene el Bulbasaur del otro, con su mote CCC intacto, nivel 6 y
24 PS.

### Lo que se aprendio por el camino

Que el juego acepte el Pokemon no basta: **hay que rehacerle las estadisticas**.

Un Pokemon guarda sus estadisticas ya calculadas, y el juego solo las rehace
cuando sube de nivel o evoluciona. El Charmander llego con 18 PS maximos, que
son los que le salen en la copia de B, donde su especie tiene 38 de PS base; en
la copia de A esa especie tiene 47, y le tocaban 19. Sin recalcular, un Pokemon
intercambiado arrastra los numeros de la partida de origen durante media
aventura, y nadie entiende por que.

La formula esta comprobada de la unica forma que vale: recalculando las seis
estadisticas de un Pokemon que creo el propio juego, con los datos base de su
propia ROM, y comprobando que salen exactamente las que ya tenia guardadas.
Eso es `tools/tests/test-estadisticas.mjs`, y sale seis de seis.

Lo que **no** hace el intercambio es curar. Un Pokemon herido llega herido, con
los PS en la misma proporcion; uno debilitado llega debilitado. Curar de regalo
seria un cambio en la partida que nadie ha pedido.

### Como repetirlo

```
npm run dev:randomizer          # en otra terminal
npm run dev                     # y en otra

npx tsx tools/memoria/preparar-companero.mjs <estado.bin> <romB.gba> 0x202402C estado-B.bin
npx tsx tools/memoria/intercambiar.mjs estado-A.bin romA.gba 0 estado-B.bin romB.gba 0 .
node    tools/tests/probar-intercambio.mjs romA.gba tras-intercambio-A.bin romB.gba tras-intercambio-B.bin .
```

`intercambiar.mjs` comprueba ademas donde cayeron los cambios: todos los bytes
distintos tienen que estar dentro de la ranura intercambiada y del contador del
equipo. Si aparece uno fuera, algo se salio de su sitio y el intercambio no es
de fiar.

## Lo que falta

Conectarlo a la interfaz y al canal de datos, que ya esta abierto y sin usar:
elegir el Pokemon, mandar los cien bytes, confirmar en dos fases para que nadie
duplique ni pierda nada si se corta la conexion, y ensenar antes de aceptar lo
que `describirTrato` ya sabe decir.

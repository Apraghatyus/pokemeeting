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

## Primer paso de implementacion

Antes que nada hay que resolver una incognita concreta: **en que desplazamiento
del fichero de savestate de mGBA empieza la EWRAM**. Se determina una sola vez,
de forma empirica: guardar un estado con una partida conocida, buscar en el
fichero la firma del equipo y fijar el desplazamiento. A partir de ahi, leer y
escribir memoria del juego es aritmetica.

# Flujo de una partida compartida

Estado: implementados los pasos 1 a 6 salvo la biblioteca local de ROMs.
Pendientes: Soul Link e intercambios.

## Roles

- **Anfitrion**: crea la sala y comparte codigo y contrasena.
- **Invitado**: entra con ese codigo y contrasena.

Mas alla de crear la sala, los dos son simetricos: cada uno corre su propia
emulacion, en su propia maquina, con su propia ROM.

## 1. Entrada y eleccion de ROM

Al abrir la pagina el nucleo del emulador empieza a cargar de inmediato, antes
de que el jugador elija nada, para que el coste del wasm ya este pagado.

El jugador elige su ROM de dos maneras:

- **Fichero nuevo**: la arrastra o la selecciona.
- **Mi biblioteca**: ROMs que ya uso antes en este navegador. *(Pendiente:
  hoy hay que volver a elegir el fichero en cada sesion.)*

### Por que la biblioteca es local y no del servidor

La idea original era poder "escogerla si esta en el servidor". Eso es
exactamente la distribucion que hace ilegal a un emulador: alojar la ROM para
que otra persona la descargue.

La biblioteca resuelve la misma incomodidad sin incurrir en ello: la ROM se
guarda en **IndexedDB, dentro del navegador del propio jugador**. Se elige una
vez y en los siguientes arranques aparece en una lista. Nunca sale de su
maquina, y el servidor jamas la ve.

Para el companero, la sala publica *que* ROM hace falta (titulo, codigo de juego
y CRC32), no la ROM.

## 2. Crear sala (anfitrion)

1. El anfitrion pulsa "Jugar con un amigo".
2. El servidor genera un **codigo de sala** corto y legible en voz alta.
3. El anfitrion escribe una **contrasena** y se la pasa a su amigo por donde
   quiera.

La contrasena no es ceremonia: el codigo de sala es corto y por tanto adivinable,
y lo que protege es el video de la partida de alguien. El servidor guarda solo
un hash con sal, nunca la contrasena.

Al crearse, la sala registra el **requisito de ROM**: codigo de juego, revision,
CRC32 y titulo interno de la ROM del anfitrion.

## 3. Unirse (invitado)

El invitado pega el codigo, escribe la contrasena y carga su ROM. Entonces se
comparan las dos ROMs:

| Caso | Que hacemos |
|---|---|
| Mismo codigo de juego y mismo CRC32 | Todo correcto, sin avisos |
| Mismo codigo de juego, CRC32 distinto | **Avisar y dejar continuar**: es lo normal en un Soul Link randomizado, donde cada uno juega su propia aleatorizacion |
| Codigo de juego distinto | **Bloquear**: los perfiles de memoria no coinciden y el Soul Link leeria basura |

## 4. Conexion

El servidor solo hace de **senalizacion**: empareja a los dos, valida la
contrasena e intercambia los mensajes de WebRTC. Despues se aparta y los dos
navegadores hablan directamente.

Por ese canal directo van dos cosas:

- **Un canal de datos** (fiable y ordenado) para eventos de Soul Link,
  intercambios y estado de la partida.
- **Un track de video por cada jugador**, capturado del canvas del emulador.

## 5. Durante la partida

Cada uno juega la suya. En el panel lateral ve la del otro en directo.

Una expectativa que conviene fijar: el video tiene entre 100 y 300 ms de
latencia. Sirve para **acompanar** a tu companero, no para controlar su partida
ni para nada que dependa de reaccionar al instante.

## 6. Estados de la sala

    sin-sala -> creando -> esperando-companero -> conectada
                                   ^                  |
                                   +-- reconectando <-+
                                                      |
                                                   cerrada

Si a alguien se le cae la conexion, su emulacion **sigue corriendo**. Solo se
cae el video y el canal de datos; los eventos de Soul Link ocurridos mientras
tanto se encolan y se envian al reconectar.

## Pendiente de este flujo

- Biblioteca local de ROMs en IndexedDB, para no reelegir el fichero cada vez.
- Reconexion automatica: hoy, si se cae el enlace, hay que volver a entrar.
- Servidor TURN para los casos de NAT simetrica, donde STUN no basta.
- Soul Link sobre el canal de datos, que ya esta abierto y sin usar.
- Intercambios (ver `intercambios.md`).

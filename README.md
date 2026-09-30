# Emupoke Together

Un emulador de Game Boy Advance que corre en el navegador, pensado para jugar a
Pokémon acompañado: cada jugador corre su propia partida en su propio ordenador
y ve la del otro en directo, con voz.

Nació de una idea concreta: montar partidas **Soul Link** entre dos personas sin
pelearse con programas de captura, emuladores de escritorio y llamadas por
separado. Todo en una pestaña.

## Lo que hace hoy

- **Emula Pokémon de GBA** en el navegador, con el núcleo de mGBA.
- **Dos jugadores en una sala** protegida por contraseña: cada uno ve la partida
  del otro en una ventana pequeña, intercambiable con la grande.
- **Voz en directo** entre los dos, con silencio propio y volumen del compañero
  independiente del juego.
- **Aleatoriza la ROM** con catorce opciones a elegir, desde los Pokémon
  salvajes hasta los objetos de las tiendas.
- **Guarda hasta tres partidas aleatorizadas** y deja elegir cuál continuar.
- **Se juega desde el móvil**, con mando táctil.
- **Reconexión automática** si se cae el enlace, con reintento manual después.

## Lo que este proyecto NO hace, a propósito

**No distribuye ROMs.** Cada jugador carga su propia copia desde su ordenador, y
nunca se envía a nadie. Eso es lo que separa un emulador de una infracción, y
condiciona decisiones por todo el código:

- La sala le dice a tu compañero **qué** ROM necesita (título y CRC32), no se la
  manda.
- El servicio de aleatorización devuelve la ROM **a quien la envió**, y a nadie
  más.
- Si alguien entra por un enlace compartido, la interfaz le dice que su fichero
  viajará al ordenador del anfitrión antes de que decida.

## Cómo se arranca

Necesitas Node 20 o superior.

```bash
npm install
npm run dev:all
```

Eso levanta las tres piezas y deja la aplicación en **http://localhost:5173**.
Arrastra tu ROM y listo.

Para jugar con alguien de fuera hace falta un enlace público; está explicado en
[docs/jugar-con-alguien-de-fuera.md](docs/jugar-con-alguien-de-fuera.md).

Para aleatorizar hace falta descargar un programa aparte; está explicado en
[tools/randomizer/LEEME.md](tools/randomizer/LEEME.md).

### Los comandos

| Comando | Qué hace |
|---|---|
| `npm run dev:all` | Las tres piezas a la vez |
| `npm run dev` | Solo la web |
| `npm run dev:signaling` | Solo el servidor de salas |
| `npm run dev:randomizer` | Solo la aleatorización |
| `npm run dev:https` | La web con HTTPS, necesario para el móvil |
| `npm run dev:tunnel` | La web aceptando visitantes de fuera |
| `npm run tunnel` | Abre el enlace público |
| `npm run typecheck` | Comprueba los tipos de todo |

## Cómo está montado

```
apps/web          la aplicación: emulador, sala, voz, interfaz
apps/signaling    empareja a los dos jugadores y se aparta
apps/randomizer   puente hacia el randomizer de escritorio (Java)
packages/protocol lo que se dicen el navegador y el servidor
packages/pokemon  conocimiento del dominio: qué es cada ROM
tools             pruebas y utilidades
docs              las decisiones y por qué se tomaron
```

### Tres decisiones que explican casi todo

**El emulador es mGBA compilado a WebAssembly.** Se eligió por compatibilidad:
las ROMs aleatorizadas y los hacks funcionan donde otros núcleos fallan. Tiene
un coste: usa hilos, así que la página necesita aislamiento *cross-origin*
(`COOP`/`COEP`), y eso a su vez obliga a servir por HTTPS fuera de `localhost`.

**El servidor solo hace de presentador.** Empareja a los dos jugadores,
comprueba la contraseña y se aparta: el vídeo, la voz y los datos van
directamente de un navegador al otro por WebRTC. Nada de eso pasa por ningún
servidor nuestro.

**El randomizer es un programa Java de escritorio** y no puede correr en el
navegador. Por eso hay un servicio local que hace de puente y ejecuta su modo de
línea de órdenes. No se distribuye su `.jar`: es de terceros y con licencia
GPL-3.

## Las pruebas

No hay pruebas unitarias de adorno: casi todas arrancan un navegador de verdad y
comprueban cosas que solo se pueden comprobar así.

| Comando | Qué comprueba |
|---|---|
| `npm run smoke -- <rom>` | Que la ROM arranca y el emulador dibuja |
| `npm run test:roms` | Qué parejas de ROMs pueden compartir sala |
| `npm run test:signaling` | El protocolo de salas, sin navegador |
| `npm run test:session -- <rom>` | Dos navegadores conectados, con vídeo |
| `npm run test:voice -- <rom>` | La llamada, en ambas direcciones |
| `npm run test:reconexion -- <rom>` | Que vuelve sola al caerse la red |
| `npm run test:mobile -- <rom>` | Mando táctil en un móvil emulado |
| `npm run test:audio -- <rom>` | Que suena, y que el volumen lo altera |
| `npm run test:randomizer -- <rom>` | El servicio de aleatorización |
| `npm run test:randomizer:options -- <rom>` | Que **cada** opción cambia la ROM |
| `npm run test:randomizer:ui -- <rom>` | El menú de aleatorización |
| `npm run test:partidas -- <rom>` | Las partidas guardadas y su tope |
| `npm run test:semilla -- <rom>` | Que la misma semilla da la misma ROM |
| `npm run test:receta -- <rom>` | Recuperar una partida sin haberla descargado |
| `npm run test:gen3` | El descifrado de un Pokémon de tercera generación |
| `npm run test:estadisticas -- <estado> <rom>` | Que las estadísticas se calculan como el juego |

La mayoría necesita la aplicación levantada. Todas piden una ROM porque no hay
ninguna en el repositorio.

Han encontrado bastantes fallos que una lectura del código no habría visto: un
micrófono que funcionaba en un solo sentido, un volumen que arrancaba mudo, una
ventana que desaparecía sin forma de recuperarla. Merece la pena mantenerlas.

## Qué falta

Las ideas pendientes, con lo que costaría cada una, están en
[docs/ideas-pendientes.md](docs/ideas-pendientes.md).

Los intercambios ya funcionan por dentro: leer la memoria del juego, sacar un
Pokémon de una partida, meterlo en otra con sus estadísticas rehechas para la
ROM que lo recibe, y que el juego lo acepte. Está probado entre dos copias
aleatorizadas distintas de la misma edición, que es como se juega esto, y
contado en [docs/intercambios.md](docs/intercambios.md). Lo que falta es
conectarlo a la interfaz y al canal de datos, que ya está abierto.

El Soul Link sigue siendo cosa de los jugadores: las reglas las lleváis
vosotros, el programa no las impone.

## Documentación

- [docs/flujo-de-partida.md](docs/flujo-de-partida.md) — cómo funciona una
  partida de principio a fin
- [docs/intercambios.md](docs/intercambios.md) — cómo se harán los intercambios
  y por qué no emulando el cable link
- [docs/randomizer.md](docs/randomizer.md) — la integración con el randomizer
- [docs/jugar-con-alguien-de-fuera.md](docs/jugar-con-alguien-de-fuera.md) —
  abrir un enlace público
- [docs/ideas-pendientes.md](docs/ideas-pendientes.md) — lo que falta

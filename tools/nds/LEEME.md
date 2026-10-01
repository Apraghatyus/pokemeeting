# El nucleo de Nintendo DS

Para jugar a cuarta y quinta generacion -Diamante, Perla, Platino, HeartGold,
SoulSilver, Blanco, Negro- hace falta un emulador de DS, que es otro programa
distinto del que corre Game Boy y Game Boy Advance.

Aqui no viene ninguno, igual que no viene el jar del randomizer. Se instala
aparte, y conviene leer esto antes de hacerlo.

## Como se prueba

```bash
npm i --no-save @emulatorjs/emulatorjs @emulatorjs/core-desmume
node tools/nds/probar-nds.mjs <tu-rom.nds>
```

El `--no-save` es deliberado: deja el nucleo instalado para probarlo sin
meterlo en las dependencias del proyecto. Mientras solo se este probando, eso
es justo lo que se quiere.

La prueba monta una pagina aparte con el nucleo, la sirve con las mismas
cabeceras de aislamiento que usa la aplicacion, carga tu ROM y mide a cuantas
imagenes por segundo va. No toca la aplicacion.

## Lo que hay que decidir antes de meterlo de verdad

### La licencia

Los dos emuladores de DS que se pueden usar en navegador, melonDS y DeSmuME,
son **GPL**. El frontend que los empaqueta, EmulatorJS, es **GPL-3.0**.

El nucleo que usamos hoy para Game Boy Advance, mGBA, es MPL-2.0, que no tiene
ese efecto. Meter un nucleo GPL dentro de la aplicacion y repartirla significa
que la aplicacion entera pasa a ser GPL-3.

No es un impedimento, es una consecuencia: hay que quererla. Por eso el nucleo
se instala con `--no-save` mientras se este decidiendo.

Es el mismo cuidado que se tiene con el randomizer, que se llama como programa
aparte y nunca se redistribuye.

### La BIOS

melonDS necesita tres ficheros de la consola -`bios7`, `bios9` y `firmware`-
que tiene que aportar cada jugador. DeSmuME no: los emula por su cuenta. Por
eso la prueba usa DeSmuME, porque pedirle a cada jugador tres ficheros mas,
ademas de su ROM, es mucho pedir.

A cambio DeSmuME es menos preciso. Si algun juego diera problemas, melonDS es
la alternativa, con ese coste.

### Las dos pantallas y el tactil

Un DS tiene dos pantallas y la de abajo es tactil. Eso cambia tres cosas de la
aplicacion que hoy dan por hecho que hay una sola: la colocacion de la partida
propia y la del companero, lo que se captura para enviarle al otro, y el mando
en movil.

### El rendimiento

Es lo que de verdad decide, y por eso la prueba lo mide. DS cuesta mucho mas
que Game Boy Advance, y la aplicacion esta pensada para que dos personas jueguen
a la vez, cada una emulando lo suyo y ademas enviando video. Si en un portatil
normal no llega a velocidad jugable, no merece la pena seguir.

## Lo que ya se sabe

El frontend expone lo que esta aplicacion necesita, que no era evidente:

- `getState()` y `loadState()`, que es por donde se leeria el equipo, igual que
  se hace hoy en Game Boy Advance.
- `simulateInput()` para el mando, `setVolume` y compania.
- Se puede servir todo desde nuestro propio dominio con `EJS_pathtodata`, sin
  depender de su CDN. Importa porque con el aislamiento cross-origin que exige
  el emulador, lo que venga de otro dominio sin las cabeceras correctas se
  bloquea.

Lo que **no** sirve de lo ya hecho: todo el trabajo de memoria. Cuarta
generacion guarda los Pokemon de otra forma -136 bytes y otro cifrado- y el
estado seria de DeSmuME, no de mGBA. Los intercambios habria que rehacerlos
enteros.

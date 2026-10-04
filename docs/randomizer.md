# Integrar el Universal Pokemon Randomizer ZX

Estado: **implementado** para ocho juegos, en cualquiera de sus idiomas:

- Segunda generacion, Game Boy Color: Oro, Plata y Cristal.
- Tercera generacion, Game Boy Advance: Rubi, Zafiro, Esmeralda, Rojo Fuego y
  Verde Hoja.

De los ocho, los unicos jugados de verdad por aqui son Rojo Fuego y Verde Hoja.
El resto los acepta el randomizer -esta comprobado contra el propio jar, no
supuesto- pero nadie ha llegado a terminar una partida con ellos: la interfaz
lo dice cuando cargas uno.

El menu se adapta a lo que ese juego tiene. En segunda generacion no existen
las habilidades, asi que esa casilla no aparece; y si llegara pedida de todos
modos, el servicio la aparta y lo cuenta en el resumen, en vez de decir que la
ha cambiado.

## Como se usa

1. Descarga `PokeRandoZX.jar` y dejalo en `tools/randomizer/`
   (instrucciones en `tools/randomizer/LEEME.md`).
2. Arranca todo con `npm run dev:all`.
3. Carga tu ROM. Al hacerlo se pregunta como quieres jugar.
4. Marca lo que quieras aleatorizar y pulsa "Aleatorizar y jugar".

La copia aleatorizada arranca sola. No se descarga nada, y es a proposito.

### Volver a tu partida otro dia

Cargas tu ROM original de siempre y la partida aparece en la lista, con lo que
aleatorizaste y cuando la creaste. Un clic y sigues donde lo dejaste: la copia y
su guardado viven en el navegador, persistidos entre sesiones.

Solo cuando esa copia ya no esta -porque el navegador tiro sus datos, o porque
estas en otro ordenador- hace falta la **semilla**: una linea de texto que se da
al crear la partida y que dice con que semilla y que ajustes se genero. Con esa
linea y tu ROM original se vuelve a generar el mismo mundo, identico, y se
comprueba comparandolo con el que se creo aquel dia. Si no coincidiera, se avisa
en vez de cargarlo, porque un mundo parecido pero distinto estropearia tu
guardado sin que se notara hasta mucho despues.

La semilla tambien sirve para darle a tu companero exactamente el mismo mundo.
Lo que no lleva dentro es el juego: sin la ROM original no vale para nada, que
es justo lo que permite compartirla sin repartir nada que no se pueda repartir.

### Con un fichero de ajustes propio

Los ajustes finos se exportan desde la interfaz de escritorio del randomizer, en
un fichero `.rnqs`. Si no tienes ninguno, se puede generar uno de partida sin
abrirla:

    jjs -cp tools/randomizer/PokeRandoZX.jar tools/randomizer/generar-ajustes.js -- ajustes.rnqs

(`jjs` viene con Java 8. El script rellena cuatro campos que un `Settings`
recien creado deja a null y que harian fallar el guardado.)

## Como esta montado

Un servicio local, `apps/randomizer`, que escucha **solo en 127.0.0.1**.
Recibe tu ROM y los ajustes, ejecuta el jar por linea de ordenes, devuelve el
resultado y borra los temporales en un `finally`.

El navegador lo alcanza por `/randomizer`, que el servidor de desarrollo
redirige al puerto 8788.

## Lo que se comprobo en el repositorio

Repositorio: <https://github.com/Ajarmar/universal-pokemon-randomizer-zx>

**Tiene modo de linea de comandos**, que es lo que hace viable automatizarlo:

    java -jar PokeRandoZX.jar cli -s <ajustes.rnqs> -i <entrada.gba> -o <salida.gba> [-l]

- `-s` fichero de ajustes, `-i` ROM de origen, `-o` ROM resultante
- `-l` guarda el registro de la aleatorizacion
- `-d` y `-u` son para juegos de 3DS, no nos afectan

**Licencia GPL-3.0.** Conviene *no* empaquetar el jar dentro del proyecto: que
cada usuario descargue el oficial y lo apuntemos por configuracion. Llamarlo
como proceso aparte no contagia la licencia; redistribuirlo si obliga a cumplir
la GPL.

## La semilla: se puede fijar, pero no desde la linea de ordenes

Su linea de ordenes escoge una semilla al azar en cada ejecucion y solo la
cuenta despues, en el registro. El fichero de ajustes tampoco guarda ninguna.

Durante un tiempo esto se dio por un callejon sin salida, con dos salidas
posibles: aceptar que cada jugador tuviera su mundo, o parchear el jar y cargar
con la GPL. Hay una tercera, que es la que se usa:

**La clase `Randomizer` si acepta una semilla.** El metodo es
`randomize(fichero, registro, semilla)`, y lo unico que no la expone es su
interfaz de linea de ordenes. Asi que se la llama directamente desde `jjs`, el
motor de scripts que ya viene con Java 8 y que este servicio usaba de todos
modos para construir los ajustes. Sin parches, sin recompilar y sin
redistribuir nada suyo: el jar lo sigue descargando cada usuario.

El guion vive en [apps/randomizer/src/semilla.ts](../apps/randomizer/src/semilla.ts)
y replica la misma secuencia que su CLI: buscar que generacion reconoce la ROM,
cargarla, ajustar los ajustes a esa ROM y aleatorizar.

Comprobado con `npm run test:semilla`: con la misma ROM, los mismos ajustes y
la misma semilla sale una copia **identica byte a byte**; con otra semilla, una
distinta. Se compara el hash del fichero entero, porque aqui un solo byte
distinto ya es otro juego.

### Para que sirve poder fijarla

Para no tener que guardar la ROM generada en ningun sitio. Una partida
aleatorizada se describe con tres cosas -la ROM original, la semilla y los
ajustes- y con eso se vuelve a generar cuando haga falta. Eso es la **semilla**,
y es lo que se le ofrece al jugador en vez de un boton de descarga.

Tambien deja que dos jugadores tengan el mismo mundo, si se pasan la semilla.
No es obligatorio: cada uno puede seguir jugando el suyo.

### Un detalle que costo encontrar

`ResourceBundle.getBundle` falla bajo jjs con el cargador de clases por
omision, aunque el fichero este dentro del jar. Hay que pedirle el paquete de
textos al cargador del propio jar.

Y la cadena de ajustes que el randomizer escribe en su registro lleva delante
el numero de version, asi que `Settings.fromString` la rechaza. La que vale es
la que devuelve `ajustes.toString()`, sin ese prefijo.

## Donde esta la linea legal

Que un jugador mande **su propia ROM** a un servicio y la reciba de vuelta
randomizada es procesar su propio fichero: no hay problema.

Que el servidor le mande **a la otra persona** una ROM derivada de esa es
distribucion, que es justo lo que este proyecto evita por diseno.

La diferencia no es tecnica sino de destinatario. Si se implementa, el servicio
debe cumplir tres cosas:

- Escuchar solo en local, no publicado a internet.
- No guardar nada: fichero temporal, devolver, borrar en un `finally`.
- Nunca entregar a un usuario un fichero originado por otro.

Lo que si puede viajar entre los dos jugadores sin problema son **los ajustes**
y, si algun dia existe, **la semilla**: son configuracion, no el juego.

## Nota de entorno

La maquina de desarrollo tiene Java 8 (`1.8.0_481`). UPR ZX probablemente exija
una version mas moderna; hay que comprobarlo al conectarlo.

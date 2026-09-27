# Integrar el Universal Pokemon Randomizer ZX

Estado: investigado y **aparcado**. Nada implementado.

Se retoma despues del Soul Link y los intercambios. Esto queda escrito para no
repetir la investigacion.

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

## El obstaculo: no se puede fijar la semilla

Revisado `Settings.java`: **el fichero de ajustes no guarda ninguna semilla**, y
el CLI tampoco acepta un parametro para fijarla. Cada ejecucion genera una
aleatorizacion nueva.

Consecuencia directa: con el jar oficial, dos jugadores con los mismos ajustes
obtienen **partidas distintas**. No hay forma de reproducir la misma.

Salidas posibles, si algun dia se retoma:

1. **Aceptar que cada uno juegue la suya.** Funciona sin tocar nada y encaja con
   el Soul Link; la comprobacion de compatibilidad ya trata un CRC distinto como
   aviso y no como error.
2. **Parchear el CLI** para aceptar `--seed`. Es un cambio pequeno, pero obliga a
   compilar el jar y, al ser GPL-3, a publicar el parche si se distribuye.

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

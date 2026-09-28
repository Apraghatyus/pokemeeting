# Aqui va el Universal Pokemon Randomizer ZX

Descarga la ultima version desde:

    https://github.com/Ajarmar/universal-pokemon-randomizer-zx/releases

Del zip, deja aqui el fichero **PokeRandoZX.jar**. Debe quedar asi:

    tools/randomizer/PokeRandoZX.jar

## Por que no viene incluido

El randomizer es software de otra gente, con licencia GPL-3.0. Llamarlo como
programa aparte no obliga a nada, pero redistribuir su jar dentro de este
proyecto si obligaria a cumplir la GPL. Es mas limpio que cada uno descargue el
oficial.

Por eso este fichero esta en .gitignore: nunca se sube al repositorio.

## Requisito

Java 8 o superior, de **64 bits**. Para comprobarlo:

    java -version

La salida debe mencionar "64-Bit". Si dice 32-bit, el randomizer no arrancara.

## Ruta alternativa

Si prefieres tener el jar en otro sitio, apunta a el con la variable de entorno
`UPR_JAR` antes de arrancar el servicio.

# Herramientas

Todo lo que se ejecuta a mano y no forma parte de la aplicacion.

    tools/
      tests/       lo que comprueba que algo funciona
      memoria/     leer y escribir la memoria de una partida
      randomizer/  donde va el jar del randomizer (no se versiona)
      dev.mjs      levanta las tres piezas a la vez
      tunnel.mjs   abre un enlace publico temporal

La division es por lo que haces con ellas, no por el tema que tocan: en
`tests/` esta lo que responde "¿esto funciona?" y en el resto lo que responde
"hazme esto". Por eso `probar-intercambio.mjs` vive en `tests/` aunque hable de
intercambios, y `intercambiar.mjs` vive en `memoria/` aunque hable de lo mismo:
uno comprueba y el otro hace.

## tests/

Casi todas piden una ROM como argumento, porque en este repositorio no hay
ninguna y nunca la habra. La lista completa, con que comprueba cada una, esta
en el [README](../README.md#las-pruebas).

Las que abren un navegador necesitan la aplicacion levantada (`npm run
dev:all`). Las de pura logica -`test:roms`, `test:gen3`- no necesitan nada.

Las capturas que dejan van a la carpeta que se les pase como ultimo argumento;
si no se les pasa ninguna, caen en la raiz del proyecto, y por eso los `.png`
estan en el `.gitignore`.

## memoria/

Herramientas para mirar por dentro de una partida: volcar un estado, localizar
el equipo, leer un Pokemon descifrado, moverlo a otra partida. Trabajan sobre
ficheros de estado exportados desde la propia aplicacion, no sobre la partida
en marcha.

Empiezan casi siempre por `analizar-savestate.mjs`, que dice que hay y donde.

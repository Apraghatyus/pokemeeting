# Pokemeeting para Android

La misma partida compartida que la web, pero con el emulador **nativo**: mGBA
compilado para el telefono en vez de WebAssembly en un navegador. Es la
respuesta a lo que se midio en los moviles flojos (ver "El emulador en moviles
flojos" en `docs/ideas-pendientes.md`): el nucleo ya no corre en el hilo que
pinta la interfaz, ni se lleva 300 MB de wasm, ni compite con el navegador.

## Que hace esta primera version

- Elegir tu ROM del telefono y jugar, con mando tactil multitoque y sonido.
- Leer tu equipo cada tres segundos, con `packages/pokemon`, igual que la web.
- Entrar en una sala de `emupoke.aguaquim.com`, ver el equipo del otro y las
  parejas caidas del Soul Link. Se puede jugar con alguien que este en la web.
- Ver la pantalla del companero si la manda.
- Jugar tumbado: la partida a todo el alto y el mando flotando en las esquinas,
  como en la web.
- Mandos Bluetooth o USB, con la misma tabla que la web
  (`apps/web/src/core/mandoFisico.ts`): el boton de la derecha es A y el de
  abajo B, como en la consola. Se suman al mando tactil.

Y ya a la par con la web: mandar tu pantalla y tu voz, reconexion,
dificultades y sus reglas, Soul Link, intercambios, motes, aleatorizar, enlace
de invitacion, cuentas y estados (ver `docs/ideas-pendientes.md`).

## Como esta montado

```
App.tsx, src/          la interfaz (React Native)
  equipo.ts            savestate nativo -> packages/pokemon -> equipo
  sala.ts              el mismo protocolo que la web (packages/protocol)
  Mando.tsx            una sola superficie que mira todos los dedos
android/app/src/main/
  cpp/nucleo.cpp       mGBA sin nada de Android: se puede probar en un PC
  cpp/puente.cpp       hilo de emulacion, ventana nativa y AAudio
  java/.../mgba/       el modulo y la vista que ve React Native
```

**Lo que se comparte con la web, sin copiarlo:** `packages/pokemon`,
`packages/protocol` y `apps/web/src/core/romHeader.ts`. Metro los resuelve desde
fuera de la carpeta (ver `metro.config.js`). Funciona porque el savestate de
mGBA nativo es el mismo bloque de 0x61000 bytes que el del nucleo de la web:
esta fijado en el codigo de mGBA con un `static_assert`.

**La ROM no sale del telefono.** Se copia a la carpeta privada de la app para
poder abrirla por ruta, y por la sala solo viaja su huella.

## Compilar

La APK la compila GitHub Actions en cada cambio (`.github/workflows/apk.yml`)
y queda para descargar en la pestaña Actions. En local hace falta el SDK y el
NDK de Android:

```bash
cd movil
npm install
cd android && ./gradlew assembleRelease
```

Necesita Android 8 o superior (por AAudio).

## Probar en el telefono con Expo (dev client)

Expo Go, la app de la tienda, NO sirve: no trae el emulador ni la pantalla por
WebRTC, que son codigo nativo de esta app. Lo que se usa es un *dev client*:
esta misma app compilada en modo desarrollo, que en vez de llevar el
JavaScript dentro lo pide al ordenador. Cada cambio en `App.tsx` o `src/` se
ve en el telefono al guardar, sin volver a compilar.

1. **Instalar la APK de desarrollo, una vez.** En GitHub, pestaña Actions →
   *APK Android* → la ultima ejecucion en verde → artefacto
   `pokemeeting-dev-client-apk`. Se instala como **Pokemeeting Dev**, al lado
   de la normal. Solo hay que reinstalarla si cambia algo nativo (Kotlin, C++,
   una dependencia nativa).
2. **Arrancar el servidor en el ordenador:**

   ```bash
   cd movil
   npm install
   npm start          # telefono y ordenador en la misma wifi
   npm run start:tunel  # si no estan en la misma red
   ```

3. **Abrirlo en el telefono:** escanear el QR que sale en la terminal con la
   camara, o abrir Pokemeeting Dev: lista los servidores que encuentra en la
   red, y tambien deja escribir la direccion (`http://IP-del-ordenador:8081`).

Con el servidor abierto, sacudir el telefono saca el menu de desarrollo
(recargar, ver errores, rendimiento). La APK normal no lleva nada de esto.

package com.aguaquim.emupoke.mgba

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.oney.WebRTCModule.PistaDelEmulador
import com.oney.WebRTCModule.WebRTCModule
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors
import java.util.zip.CRC32
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

/**
 * El emulador visto desde JavaScript.
 *
 * LAS ROMS SE QUEDAN EN EL TELEFONO. Se copian a la carpeta privada de la app
 * para poder abrirlas por ruta -el selector del sistema da un content:// que mGBA
 * no sabe leer- y no salen de ahi. Igual que en la web, cada uno trae la suya.
 */
class MgbaModule(private val contexto: ReactApplicationContext) :
    ReactContextBaseJavaModule(contexto), ActivityEventListener {

  override fun getName() = "Mgba"

  /** Para no leer ni copiar dieciseis megas en el hilo de la interfaz. */
  private val trabajo = Executors.newSingleThreadExecutor()
  private var esperandoRom: Promise? = null
  /** Lo que espera al selector de ficheros: abrir uno cualquiera o guardarlo. */
  private var esperandoFichero: Promise? = null
  private var esperandoGuardar: Pair<Promise, ByteArray>? = null
  /** La red va aparte: aleatorizar tarda minutos y no puede frenar el juego. */
  private val red = Executors.newSingleThreadExecutor()
  /** El fichero de guardado de la partida que corre, para leerlo desde JavaScript. */
  private var guardadoActual: File? = null

  init {
    contexto.addActivityEventListener(this)
    Mando.iniciar(contexto)
    // Lo que el mando tenga que contar llega a JavaScript como evento.
    Mando.avisar = { nombre, datos ->
      if (contexto.hasActiveReactInstance()) {
        contexto
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(nombre, Arguments.createMap().apply { datos.forEach { (k, v) -> putString(k, v) } })
      }
    }
  }

  /** Que boton del mando va a cada entrada, con nombres legibles. */
  @ReactMethod
  fun mandoFisico(promesa: Promise) {
    promesa.resolve(Arguments.createMap().apply { Mando.descripcion().forEach { (k, v) -> putString(k, v) } })
  }

  /** El siguiente boton que se pulse en el mando ira a esta entrada. Null para dejarlo. */
  @ReactMethod fun aprenderBoton(entrada: String?) = Mando.aprender(entrada)

  @ReactMethod fun restaurarMando() = Mando.restaurar(contexto)

  @ReactMethod fun mandoTactilVisible() = Mando.tactilVisible()

  // Necesarios para emitir eventos con la arquitectura de siempre.
  @ReactMethod fun addListener(nombre: String) {}

  @ReactMethod fun removeListeners(cuantos: Int) {}

  private val carpetaRoms
    get() = File(contexto.filesDir, "roms").apply { mkdirs() }

  private val carpetaGuardados
    get() = File(contexto.filesDir, "guardados").apply { mkdirs() }

  /** Abre el selector de ficheros del sistema y copia la ROM elegida. */
  @ReactMethod
  fun elegirRom(promesa: Promise) {
    val actividad = currentActivity
    if (actividad == null) {
      promesa.reject("sin-actividad", "La app no esta en primer plano")
      return
    }
    esperandoRom = promesa
    val intent =
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          // Las ROMs no tienen un tipo MIME reconocido: se deja elegir cualquier
          // fichero y se comprueba despues por su contenido.
          type = "*/*"
        }
    actividad.startActivityForResult(intent, PEDIR_ROM)
  }

  override fun onActivityResult(actividad: Activity, peticion: Int, resultado: Int, datos: Intent?) {
    if (peticion == PEDIR_FICHERO) {
      recibirFichero(resultado, datos)
      return
    }
    if (peticion == GUARDAR_FICHERO) {
      escribirFicheroElegido(resultado, datos)
      return
    }
    if (peticion != PEDIR_ROM) return
    val promesa = esperandoRom ?: return
    esperandoRom = null
    val uri = datos?.data
    if (resultado != Activity.RESULT_OK || uri == null) {
      promesa.resolve(null)
      return
    }
    trabajo.execute {
      try {
        val nombre = nombreDe(uri)
        val destino = File(carpetaRoms, nombre)
        contexto.contentResolver.openInputStream(uri).use { entrada ->
          requireNotNull(entrada) { "No se pudo abrir el fichero" }
          destino.outputStream().use { salida -> entrada.copyTo(salida) }
        }
        promesa.resolve(Arguments.createMap().apply {
          putString("ruta", destino.absolutePath)
          putString("nombre", nombre)
        })
      } catch (error: Exception) {
        promesa.reject("copia", error.message, error)
      }
    }
  }

  override fun onNewIntent(intent: Intent) {}

  private fun nombreDe(uri: Uri): String {
    contexto.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst()) {
        val nombre = c.getString(0)
        // Sin barras: el nombre acaba en una ruta de la carpeta privada.
        if (!nombre.isNullOrBlank()) return nombre.replace('/', '_')
      }
    }
    return "rom-${System.currentTimeMillis()}.gba"
  }

  /** Las ROMs que ya se trajeron, para no tener que elegirlas cada vez. */
  @ReactMethod
  fun romsGuardadas(promesa: Promise) {
    val lista = Arguments.createArray()
    carpetaRoms.listFiles()?.sortedByDescending { it.lastModified() }?.forEach { f ->
      lista.pushMap(Arguments.createMap().apply {
        putString("ruta", f.absolutePath)
        putString("nombre", f.name)
      })
    }
    promesa.resolve(lista)
  }

  /** El fichero entero en base64. Para la ROM: de ella salen nombres y tipos. */
  @ReactMethod
  fun leerBase64(ruta: String, promesa: Promise) {
    trabajo.execute {
      try {
        promesa.resolve(Base64.encodeToString(File(ruta).readBytes(), Base64.NO_WRAP))
      } catch (error: Exception) {
        promesa.reject("lectura", error.message, error)
      }
    }
  }

  /** Carga una ROM. Su guardado vive al lado, con el mismo nombre y .sav. */
  @ReactMethod
  fun cargar(ruta: String, promesa: Promise) {
    trabajo.execute {
      val base = File(ruta).nameWithoutExtension
      val guardado = File(carpetaGuardados, "$base.sav")
      guardadoActual = guardado
      val ok = Nativo.cargar(ruta, guardado.absolutePath)
      Nativo.jugando = ok
      promesa.resolve(ok)
    }
  }

  @ReactMethod
  fun cerrar() {
    Nativo.jugando = false
    Nativo.teclasFisicas(0)
    Nativo.cerrar()
  }

  @ReactMethod fun pausar(si: Boolean) = Nativo.pausar(si)

  @ReactMethod fun teclas(bits: Int) = Nativo.teclas(bits)

  @ReactMethod fun reiniciar() = Nativo.reiniciar()

  /** El estado de la maquina, para leer el equipo con packages/pokemon. */
  @ReactMethod
  fun estado(promesa: Promise) {
    trabajo.execute {
      val datos = Nativo.estado()
      promesa.resolve(datos?.let { Base64.encodeToString(it, Base64.NO_WRAP) })
    }
  }

  @ReactMethod
  fun cargarEstado(base64: String, promesa: Promise) {
    trabajo.execute { promesa.resolve(Nativo.cargarEstado(Base64.decode(base64, Base64.DEFAULT))) }
  }

  /**
   * La pantalla del emulador como pista de WebRTC, para mandarla al companero.
   * Devuelve lo mismo que `getDisplayMedia`: `{streamId, track}`.
   */
  @ReactMethod
  fun pistaDePantalla(promesa: Promise) {
    val webrtc = contexto.getNativeModule(WebRTCModule::class.java)
    if (webrtc == null) {
      promesa.reject("sin-webrtc", "WebRTC no esta disponible")
      return
    }
    PistaDelEmulador.crear(webrtc, promesa)
  }

  /** El fichero de guardado de la partida que corre, en base64, o null si no hay. */
  @ReactMethod
  fun guardado(promesa: Promise) {
    trabajo.execute {
      val fichero = guardadoActual
      promesa.resolve(
          if (fichero != null && fichero.exists()) Base64.encodeToString(fichero.readBytes(), Base64.NO_WRAP)
          else null)
    }
  }

  // ------------------------------------------------------------ ficheros ---

  /** El codigo de juego de una ROM (cuatro letras en 0xAC), sin leerla entera. */
  @ReactMethod
  fun codigoDeJuego(ruta: String, promesa: Promise) {
    trabajo.execute {
      try {
        java.io.RandomAccessFile(ruta, "r").use { f ->
          val bytes = ByteArray(4)
          f.seek(0xac)
          f.readFully(bytes)
          promesa.resolve(String(bytes, Charsets.US_ASCII))
        }
      } catch (error: Exception) {
        promesa.resolve("")
      }
    }
  }

  /** CRC32 de un fichero, en el mismo formato que la web: ocho cifras hex. */
  @ReactMethod
  fun crc32(ruta: String, promesa: Promise) {
    trabajo.execute {
      try {
        val crc = CRC32()
        File(ruta).inputStream().use { entrada ->
          val trozo = ByteArray(1 shl 16)
          while (true) {
            val leidos = entrada.read(trozo)
            if (leidos < 0) break
            crc.update(trozo, 0, leidos)
          }
        }
        promesa.resolve(String.format("%08x", crc.value))
      } catch (error: Exception) {
        promesa.reject("crc", error.message, error)
      }
    }
  }

  /** Pone el guardado de una ROM antes de abrirla: para traer una partida. */
  @ReactMethod
  fun escribirGuardado(nombreRom: String, base64: String, promesa: Promise) {
    trabajo.execute {
      try {
        val base = File(nombreRom).nameWithoutExtension
        File(carpetaGuardados, "$base.sav").writeBytes(Base64.decode(base64, Base64.DEFAULT))
        promesa.resolve(true)
      } catch (error: Exception) {
        promesa.reject("guardado", error.message, error)
      }
    }
  }

  private val carpetaEstados
    get() = File(contexto.filesDir, "estados").apply { mkdirs() }

  /** Guarda el estado de ahora en una ranura de esa ROM. */
  @ReactMethod
  fun guardarRanura(nombreRom: String, ranura: Int, promesa: Promise) {
    trabajo.execute {
      val datos = Nativo.estado()
      if (datos == null) {
        promesa.resolve(false)
        return@execute
      }
      File(carpetaEstados, "${File(nombreRom).nameWithoutExtension}.ss$ranura").writeBytes(datos)
      promesa.resolve(true)
    }
  }

  /** Carga el estado de una ranura. False si esta vacia. */
  @ReactMethod
  fun cargarRanura(nombreRom: String, ranura: Int, promesa: Promise) {
    trabajo.execute {
      val fichero = File(carpetaEstados, "${File(nombreRom).nameWithoutExtension}.ss$ranura")
      promesa.resolve(fichero.exists() && Nativo.cargarEstado(fichero.readBytes()))
    }
  }

  /** Que ranuras tienen algo, con su fecha en milisegundos. */
  @ReactMethod
  fun ranuras(nombreRom: String, promesa: Promise) {
    val base = File(nombreRom).nameWithoutExtension
    val mapa = Arguments.createMap()
    for (n in 1..3) {
      val f = File(carpetaEstados, "$base.ss$n")
      if (f.exists()) mapa.putDouble(n.toString(), f.lastModified().toDouble())
    }
    promesa.resolve(mapa)
  }

  /** Abre un fichero cualquiera con el selector del sistema: {nombre, base64}. */
  @ReactMethod
  fun abrirFichero(promesa: Promise) {
    val actividad = currentActivity
    if (actividad == null) {
      promesa.reject("sin-actividad", "La app no esta en primer plano")
      return
    }
    esperandoFichero = promesa
    actividad.startActivityForResult(
        Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "*/*"
        },
        PEDIR_FICHERO)
  }

  private fun recibirFichero(resultado: Int, datos: Intent?) {
    val promesa = esperandoFichero ?: return
    esperandoFichero = null
    val uri = datos?.data
    if (resultado != Activity.RESULT_OK || uri == null) {
      promesa.resolve(null)
      return
    }
    trabajo.execute {
      try {
        val bytes = contexto.contentResolver.openInputStream(uri).use { requireNotNull(it).readBytes() }
        promesa.resolve(Arguments.createMap().apply {
          putString("nombre", nombreDe(uri))
          putString("base64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        })
      } catch (error: Exception) {
        promesa.reject("lectura", error.message, error)
      }
    }
  }

  /** Guarda unos bytes donde elija el jugador, con el selector del sistema. */
  @ReactMethod
  fun guardarFichero(nombreSugerido: String, base64: String, promesa: Promise) {
    val actividad = currentActivity
    if (actividad == null) {
      promesa.reject("sin-actividad", "La app no esta en primer plano")
      return
    }
    esperandoGuardar = promesa to Base64.decode(base64, Base64.DEFAULT)
    actividad.startActivityForResult(
        Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
          addCategory(Intent.CATEGORY_OPENABLE)
          type = "application/octet-stream"
          putExtra(Intent.EXTRA_TITLE, nombreSugerido)
        },
        GUARDAR_FICHERO)
  }

  private fun escribirFicheroElegido(resultado: Int, datos: Intent?) {
    val (promesa, bytes) = esperandoGuardar ?: return
    esperandoGuardar = null
    val uri = datos?.data
    if (resultado != Activity.RESULT_OK || uri == null) {
      promesa.resolve(false)
      return
    }
    trabajo.execute {
      try {
        contexto.contentResolver.openOutputStream(uri).use { requireNotNull(it).write(bytes) }
        promesa.resolve(true)
      } catch (error: Exception) {
        promesa.reject("escritura", error.message, error)
      }
    }
  }

  // --------------------------------------------------------- aleatorizar ---

  /**
   * Aleatoriza una ROM con el servicio de la web y guarda la copia.
   *
   * El mismo formato que la web (apps/web/src/net/randomizer.ts): un cuerpo con
   * [4 bytes: largo del JSON][JSON][ROM], comprimido con gzip, y la respuesta
   * con la ROM nueva y sus datos en las cabeceras. Se hace aqui y no en
   * JavaScript para no pasar dieciseis megas por el puente dos veces.
   *
   * Devuelve {ruta, nombre, seed, ajustes, resumen, reproducible}; ajustes y
   * resumen tal cual llegan, en base64.
   */
  @ReactMethod
  fun aleatorizar(rutaBase: String, peticion: String, nombreNuevo: String, origen: String, promesa: Promise) {
    red.execute {
      try {
        val rom = File(rutaBase).readBytes()
        val cabecera = peticion.toByteArray(Charsets.UTF_8)
        val cuerpo = ByteArrayOutputStream()
        GZIPOutputStream(cuerpo).use { gz ->
          DataOutputStream(gz).use { d ->
            d.writeInt(cabecera.size)
            d.write(cabecera)
            d.write(rom)
          }
        }
        val conexion = URL("$origen/randomizer/randomize").openConnection() as HttpURLConnection
        conexion.requestMethod = "POST"
        conexion.doOutput = true
        conexion.connectTimeout = 30_000
        // Con cola puede tardar minutos.
        conexion.readTimeout = 15 * 60_000
        conexion.setRequestProperty("content-type", "application/octet-stream")
        conexion.setRequestProperty("x-body-encoding", "gzip")
        conexion.setFixedLengthStreamingMode(cuerpo.size())
        conexion.outputStream.use { it.write(cuerpo.toByteArray()) }

        val codigo = conexion.responseCode
        if (codigo !in 200..299) {
          val detalle = conexion.errorStream?.use { String(it.readBytes()) } ?: ""
          val mensaje = Regex("\"message\"\\s*:\\s*\"([^\"]*)\"").find(detalle)?.groupValues?.get(1)
          promesa.reject("aleatorizar", mensaje ?: "El servicio respondio $codigo")
          return@execute
        }
        val crudo = conexion.inputStream.use { it.readBytes() }
        val nueva =
            if (conexion.getHeaderField("x-body-encoding") == "gzip") GZIPInputStream(crudo.inputStream()).use { it.readBytes() }
            else crudo
        val destino = File(carpetaRoms, nombreNuevo)
        destino.writeBytes(nueva)
        promesa.resolve(Arguments.createMap().apply {
          putString("ruta", destino.absolutePath)
          putString("nombre", destino.name)
          putString("seed", conexion.getHeaderField("x-seed"))
          putString("ajustes", conexion.getHeaderField("x-settings"))
          putString("resumen", conexion.getHeaderField("x-summary"))
          putBoolean("reproducible", conexion.getHeaderField("x-reproducible") == "1")
        })
      } catch (error: Exception) {
        promesa.reject("aleatorizar", error.message ?: "No se pudo hablar con el servicio", error)
      }
    }
  }

  /** Un identificador nuevo, para el puesto en la cola. */
  @ReactMethod(isBlockingSynchronousMethod = true)
  fun nuevoTicket(): String = UUID.randomUUID().toString()

  private companion object {
    const val PEDIR_ROM = 4711
    const val PEDIR_FICHERO = 4712
    const val GUARDAR_FICHERO = 4713
  }
}

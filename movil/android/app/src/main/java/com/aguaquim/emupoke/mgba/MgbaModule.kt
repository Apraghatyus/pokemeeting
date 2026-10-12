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
import java.io.File
import java.util.concurrent.Executors

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

  init {
    contexto.addActivityEventListener(this)
  }

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
      val guardado = File(carpetaGuardados, "$base.sav").absolutePath
      promesa.resolve(Nativo.cargar(ruta, guardado))
    }
  }

  @ReactMethod fun cerrar() = Nativo.cerrar()

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

  private companion object {
    const val PEDIR_ROM = 4711
  }
}

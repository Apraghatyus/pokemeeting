package com.aguaquim.emupoke.mgba

import android.content.Context
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import org.json.JSONArray
import org.json.JSONObject

/**
 * Mandos fisicos: Bluetooth o USB, de Xbox, de PlayStation, de Switch o genericos.
 *
 * Es la misma tabla que la web (apps/web/src/core/mandoFisico.ts) y con el mismo
 * criterio: POR POSICION, no por letra. El boton de la derecha es A y el de abajo
 * B, que es donde estan en una Game Boy Advance. Android los nombra como un mando
 * de Xbox -BUTTON_A abajo, BUTTON_B a la derecha-, de ahi que parezcan cruzados.
 *
 * Los botones se pueden reasignar desde la app, igual que en la web, y el mapa se
 * guarda en el telefono. Los sticks y los gatillos analogicos van fijos.
 *
 * Va directo al hilo del emulador, sin pasar por JavaScript: un boton no puede
 * esperar a que la interfaz este libre.
 */
object Mando {
  /** Las entradas del GBA con los mismos nombres que la web, y su bit en el nucleo. */
  val ENTRADAS =
      linkedMapOf(
          "Up" to (1 shl 6),
          "Down" to (1 shl 7),
          "Left" to (1 shl 5),
          "Right" to (1 shl 4),
          "A" to (1 shl 0),
          "B" to (1 shl 1),
          "L" to (1 shl 9),
          "R" to (1 shl 8),
          "Start" to (1 shl 3),
          "Select" to (1 shl 2),
      )

  private val POR_DEFECTO: Map<String, List<Int>> =
      mapOf(
          "A" to listOf(KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_BUTTON_Y), // derecha, y arriba de sobra
          "B" to listOf(KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_BUTTON_X), // abajo, e izquierda
          "L" to listOf(KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_L2),
          "R" to listOf(KeyEvent.KEYCODE_BUTTON_R1, KeyEvent.KEYCODE_BUTTON_R2),
          "Select" to listOf(KeyEvent.KEYCODE_BUTTON_SELECT),
          "Start" to listOf(KeyEvent.KEYCODE_BUTTON_START),
          "Up" to listOf(KeyEvent.KEYCODE_DPAD_UP),
          "Down" to listOf(KeyEvent.KEYCODE_DPAD_DOWN),
          "Left" to listOf(KeyEvent.KEYCODE_DPAD_LEFT),
          "Right" to listOf(KeyEvent.KEYCODE_DPAD_RIGHT),
      )

  /** La mitad del recorrido, como en la web: un stick gastado no camina solo. */
  private const val ZONA_MUERTA = 0.5f
  private const val PREFERENCIAS = "mando"

  @Volatile private var mapa: Map<String, List<Int>> = POR_DEFECTO
  @Volatile private var aprendiendo: String? = null
  /** Si ya se ha dicho a la interfaz que se juega con mando, para no repetirlo. */
  @Volatile private var avisado = false

  /** Para contarle cosas a JavaScript: que se ha usado el mando, o un boton aprendido. */
  var avisar: ((String, Map<String, String>) -> Unit)? = null

  private var deBotones = 0
  private var deEjes = 0

  fun leer(contexto: Context) {
    val crudo = contexto.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE).getString("mapa", null)
    mapa =
        try {
          val json = JSONObject(crudo ?: return)
          ENTRADAS.keys.associateWith { entrada ->
            json.optJSONArray(entrada)?.let { a -> List(a.length()) { a.getInt(it) } }
                ?: POR_DEFECTO.getValue(entrada)
          }
        } catch (_: Exception) {
          POR_DEFECTO
        }
  }

  private fun guardar(contexto: Context) {
    val json = JSONObject()
    for ((entrada, codigos) in mapa) json.put(entrada, JSONArray(codigos))
    contexto.getSharedPreferences(PREFERENCIAS, Context.MODE_PRIVATE).edit().putString("mapa", json.toString()).apply()
  }

  /** El mapa con nombres legibles, para enseñarlo. */
  fun descripcion(): Map<String, String> =
      ENTRADAS.keys.associateWith { entrada -> mapa[entrada].orEmpty().joinToString(" · ") { nombreDe(it) } }

  fun aprender(entrada: String?) {
    aprendiendo = entrada?.takeIf { it in ENTRADAS }
  }

  fun restaurar(contexto: Context) {
    mapa = POR_DEFECTO
    aprendiendo = null
    guardar(contexto)
  }

  /** Al volver a enseñar el mando tactil: la siguiente vez que se use el fisico se avisa otra vez. */
  fun tactilVisible() {
    avisado = false
  }

  private lateinit var contextoApp: Context

  fun iniciar(contexto: Context) {
    contextoApp = contexto.applicationContext
    leer(contextoApp)
  }

  private fun nombreDe(codigo: Int): String =
      when (codigo) {
        KeyEvent.KEYCODE_BUTTON_A -> "Abajo"
        KeyEvent.KEYCODE_BUTTON_B -> "Derecha"
        KeyEvent.KEYCODE_BUTTON_X -> "Izquierda"
        KeyEvent.KEYCODE_BUTTON_Y -> "Arriba"
        KeyEvent.KEYCODE_BUTTON_L1 -> "LB"
        KeyEvent.KEYCODE_BUTTON_R1 -> "RB"
        KeyEvent.KEYCODE_BUTTON_L2 -> "LT"
        KeyEvent.KEYCODE_BUTTON_R2 -> "RT"
        KeyEvent.KEYCODE_BUTTON_START -> "Start"
        KeyEvent.KEYCODE_BUTTON_SELECT -> "Select"
        KeyEvent.KEYCODE_DPAD_UP -> "Cruceta ↑"
        KeyEvent.KEYCODE_DPAD_DOWN -> "Cruceta ↓"
        KeyEvent.KEYCODE_DPAD_LEFT -> "Cruceta ←"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "Cruceta →"
        else -> KeyEvent.keyCodeToString(codigo).removePrefix("KEYCODE_")
      }

  private fun bitDe(codigo: Int): Int {
    var bits = 0
    for ((entrada, codigos) in mapa) if (codigo in codigos) bits = bits or ENTRADAS.getValue(entrada)
    return bits
  }

  private fun esMando(origen: Int) =
      origen and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD ||
          origen and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK ||
          origen and InputDevice.SOURCE_DPAD == InputDevice.SOURCE_DPAD

  private fun usado() {
    if (avisado) return
    avisado = true
    avisar?.invoke("mandoFisicoUsado", emptyMap())
  }

  /** Devuelve true si el boton era del juego (o se estaba aprendiendo) y ya se ha usado. */
  fun tecla(evento: KeyEvent): Boolean {
    if (!esMando(evento.source)) return false

    // Aprendiendo un boton nuevo: este se lo queda, y deja de hacer lo que hiciera.
    val entrada = aprendiendo
    if (entrada != null) {
      if (evento.action == KeyEvent.ACTION_DOWN) {
        val codigo = evento.keyCode
        mapa = ENTRADAS.keys.associateWith { e -> if (e == entrada) listOf(codigo) else mapa[e].orEmpty() - codigo }
        aprendiendo = null
        if (::contextoApp.isInitialized) guardar(contextoApp)
        avisar?.invoke("mandoAprendido", mapOf("entrada" to entrada, "boton" to nombreDe(codigo)))
      }
      return true
    }

    if (!Nativo.jugando) return false
    val bit = bitDe(evento.keyCode)
    if (bit == 0) return false
    deBotones =
        when (evento.action) {
          KeyEvent.ACTION_DOWN -> deBotones or bit
          KeyEvent.ACTION_UP -> deBotones and bit.inv()
          else -> deBotones
        }
    Nativo.teclasFisicas(deBotones or deEjes)
    if (evento.action == KeyEvent.ACTION_DOWN) usado()
    return true
  }

  /** Los sticks, la cruceta que algunos mandos mandan como eje, y los gatillos analogicos. */
  fun movimiento(evento: MotionEvent): Boolean {
    if (!Nativo.jugando || evento.source and InputDevice.SOURCE_JOYSTICK != InputDevice.SOURCE_JOYSTICK) {
      return false
    }
    if (evento.action != MotionEvent.ACTION_MOVE) return false
    var bits = 0
    val x = evento.getAxisValue(MotionEvent.AXIS_X) + evento.getAxisValue(MotionEvent.AXIS_HAT_X)
    val y = evento.getAxisValue(MotionEvent.AXIS_Y) + evento.getAxisValue(MotionEvent.AXIS_HAT_Y)
    if (x <= -ZONA_MUERTA) bits = bits or ENTRADAS.getValue("Left")
    if (x >= ZONA_MUERTA) bits = bits or ENTRADAS.getValue("Right")
    if (y <= -ZONA_MUERTA) bits = bits or ENTRADAS.getValue("Up")
    if (y >= ZONA_MUERTA) bits = bits or ENTRADAS.getValue("Down")
    val izquierdo = maxOf(evento.getAxisValue(MotionEvent.AXIS_LTRIGGER), evento.getAxisValue(MotionEvent.AXIS_BRAKE))
    val derecho = maxOf(evento.getAxisValue(MotionEvent.AXIS_RTRIGGER), evento.getAxisValue(MotionEvent.AXIS_GAS))
    if (izquierdo > ZONA_MUERTA) bits = bits or ENTRADAS.getValue("L")
    if (derecho > ZONA_MUERTA) bits = bits or ENTRADAS.getValue("R")
    deEjes = bits
    Nativo.teclasFisicas(deBotones or deEjes)
    if (bits != 0) usado()
    return true
  }
}

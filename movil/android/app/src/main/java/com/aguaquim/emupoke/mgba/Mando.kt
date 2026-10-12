package com.aguaquim.emupoke.mgba

import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent

/**
 * Mandos fisicos: Bluetooth o USB, de Xbox, de PlayStation, de Switch o genericos.
 *
 * Es la misma tabla que la web (apps/web/src/core/mandoFisico.ts) y con el mismo
 * criterio: POR POSICION, no por letra. El boton de la derecha es A y el de abajo
 * B, que es donde estan en una Game Boy Advance. Android los nombra como un mando
 * de Xbox -BUTTON_A abajo, BUTTON_B a la derecha-, de ahi que parezcan cruzados.
 *
 * Va directo al hilo del emulador, sin pasar por JavaScript: un boton no puede
 * esperar a que la interfaz este libre.
 */
object Mando {
  private const val A = 1 shl 0
  private const val B = 1 shl 1
  private const val SELECT = 1 shl 2
  private const val START = 1 shl 3
  private const val DERECHA = 1 shl 4
  private const val IZQUIERDA = 1 shl 5
  private const val ARRIBA = 1 shl 6
  private const val ABAJO = 1 shl 7
  private const val R = 1 shl 8
  private const val L = 1 shl 9

  /** La mitad del recorrido, como en la web: un stick gastado no camina solo. */
  private const val ZONA_MUERTA = 0.5f

  private var deBotones = 0
  private var deEjes = 0

  private fun bitDe(codigo: Int): Int =
      when (codigo) {
        KeyEvent.KEYCODE_BUTTON_B, KeyEvent.KEYCODE_BUTTON_Y -> A // derecha, y arriba de sobra
        KeyEvent.KEYCODE_BUTTON_A, KeyEvent.KEYCODE_BUTTON_X -> B // abajo, e izquierda
        KeyEvent.KEYCODE_BUTTON_L1, KeyEvent.KEYCODE_BUTTON_L2 -> L
        KeyEvent.KEYCODE_BUTTON_R1, KeyEvent.KEYCODE_BUTTON_R2 -> R
        KeyEvent.KEYCODE_BUTTON_SELECT -> SELECT
        KeyEvent.KEYCODE_BUTTON_START -> START
        KeyEvent.KEYCODE_DPAD_UP -> ARRIBA
        KeyEvent.KEYCODE_DPAD_DOWN -> ABAJO
        KeyEvent.KEYCODE_DPAD_LEFT -> IZQUIERDA
        KeyEvent.KEYCODE_DPAD_RIGHT -> DERECHA
        else -> 0
      }

  private fun esMando(origen: Int) =
      origen and InputDevice.SOURCE_GAMEPAD == InputDevice.SOURCE_GAMEPAD ||
          origen and InputDevice.SOURCE_JOYSTICK == InputDevice.SOURCE_JOYSTICK ||
          origen and InputDevice.SOURCE_DPAD == InputDevice.SOURCE_DPAD

  /** Devuelve true si el boton era del juego y ya se ha usado. */
  fun tecla(evento: KeyEvent): Boolean {
    if (!Nativo.jugando || !esMando(evento.source)) return false
    val bit = bitDe(evento.keyCode)
    if (bit == 0) return false
    deBotones =
        when (evento.action) {
          KeyEvent.ACTION_DOWN -> deBotones or bit
          KeyEvent.ACTION_UP -> deBotones and bit.inv()
          else -> deBotones
        }
    Nativo.teclasFisicas(deBotones or deEjes)
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
    if (x <= -ZONA_MUERTA) bits = bits or IZQUIERDA
    if (x >= ZONA_MUERTA) bits = bits or DERECHA
    if (y <= -ZONA_MUERTA) bits = bits or ARRIBA
    if (y >= ZONA_MUERTA) bits = bits or ABAJO
    val izquierdo = maxOf(evento.getAxisValue(MotionEvent.AXIS_LTRIGGER), evento.getAxisValue(MotionEvent.AXIS_BRAKE))
    val derecho = maxOf(evento.getAxisValue(MotionEvent.AXIS_RTRIGGER), evento.getAxisValue(MotionEvent.AXIS_GAS))
    if (izquierdo > ZONA_MUERTA) bits = bits or L
    if (derecho > ZONA_MUERTA) bits = bits or R
    deEjes = bits
    Nativo.teclasFisicas(deBotones or deEjes)
    return true
  }
}

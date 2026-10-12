package com.aguaquim.emupoke.mgba

import android.view.Surface

/**
 * Las llamadas al emulador en C++ (puente.cpp).
 *
 * Una sola partida a la vez: no hay punteros que pasar ni que liberar.
 */
object Nativo {
  init {
    System.loadLibrary("emupoke")
  }

  /** Carga una ROM con su fichero de guardado y arranca el hilo que emula. */
  external fun cargar(rom: String, guardado: String): Boolean

  /** Para el hilo y suelta el altavoz. El guardado ya esta escrito en disco. */
  external fun cerrar()

  external fun pausar(si: Boolean)

  /** Botones pulsados como bits: A, B, Select, Start, derecha, izquierda, arriba, abajo, R, L. */
  external fun teclas(bits: Int)

  /** Lo que pulsa un mando fisico. Se suma a lo de la pantalla. Ver Mando.kt. */
  external fun teclasFisicas(bits: Int)

  /** Si hay una partida corriendo. Sin ella, el mando sirve para moverse por la app. */
  @Volatile var jugando = false

  /** El estado entero de la maquina: los 0x61000 bytes que lee packages/pokemon. */
  external fun estado(): ByteArray?

  external fun cargarEstado(datos: ByteArray): Boolean

  external fun reiniciar()

  /** Donde se pinta. Null cuando la vista desaparece. */
  external fun superficie(surface: Surface?)

  /**
   * Copia el ultimo fotograma (RGBX) en `destino`, que tiene que ser directo y
   * caber 256x256x4. Devuelve ancho << 16 | alto, o 0 si no hay partida.
   */
  external fun copiarPantalla(destino: java.nio.ByteBuffer): Int
}

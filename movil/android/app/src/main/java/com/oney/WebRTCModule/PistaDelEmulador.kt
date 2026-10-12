// La pantalla del emulador como pista de video de WebRTC.
//
// react-native-webrtc sabe mandar la camara y la pantalla del telefono, pero no
// unos fotogramas que fabrica uno. Lo que si ofrece es crear una pista a partir
// de un "controlador de captura" propio (`WebRTCModule.createVideoTrack`) y
// convertirla en un stream que JavaScript entiende (`createStream`). Eso es lo
// que se usa aqui, y por eso este fichero vive en SU paquete: alguna de esas
// piezas no es publica.
//
// Se manda la imagen de la consola tal cual, 240x160, y no la pantalla del
// telefono: es lo que ve el companero en la web, igual que cuando juega alli.

package com.oney.WebRTCModule

import android.content.Context
import com.aguaquim.emupoke.mgba.Nativo
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import org.webrtc.CapturerObserver
import org.webrtc.JavaI420Buffer
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoFrame

/** Fotogramas por segundo que se mandan. La web manda unos 55; con 30 sobra para mirar. */
private const val FPS = 30

/** Saca los fotogramas del emulador y se los da a WebRTC. */
private class CapturadorDelEmulador : VideoCapturer {
  private var observador: CapturerObserver? = null
  private var reloj: ScheduledExecutorService? = null
  /** Donde el emulador deja el fotograma: RGBX, cuatro bytes por pixel. */
  private val pixeles = ByteBuffer.allocateDirect(256 * 256 * 4).order(ByteOrder.nativeOrder())

  override fun initialize(ayudante: SurfaceTextureHelper?, contexto: Context?, observador: CapturerObserver) {
    this.observador = observador
  }

  override fun startCapture(ancho: Int, alto: Int, fps: Int) {
    observador?.onCapturerStarted(true)
    val periodo = 1000L / (if (fps > 0) fps else FPS)
    reloj = Executors.newSingleThreadScheduledExecutor().also {
      it.scheduleAtFixedRate({ capturar() }, 0, periodo, TimeUnit.MILLISECONDS)
    }
  }

  override fun stopCapture() {
    reloj?.shutdownNow()
    reloj = null
    observador?.onCapturerStopped()
  }

  override fun changeCaptureFormat(ancho: Int, alto: Int, fps: Int) {}

  override fun dispose() {
    reloj?.shutdownNow()
    reloj = null
  }

  // Ni camara ni pantalla: un contenido con detalle fino, como la pantalla.
  override fun isScreencast() = true

  private fun capturar() {
    val observador = observador ?: return
    if (!Nativo.jugando) return
    pixeles.clear()
    val tamano = Nativo.copiarPantalla(pixeles)
    if (tamano == 0) return
    val ancho = tamano ushr 16
    val alto = tamano and 0xffff
    val buffer = aI420(ancho, alto)
    val fotograma = VideoFrame(buffer, 0, System.nanoTime())
    observador.onFrameCaptured(fotograma)
    fotograma.release()
  }

  /**
   * De RGBX a I420, que es lo que comen los codificadores.
   *
   * A mano y sin libyuv: son 240x160 pixeles, poco mas de treinta y ocho mil,
   * y a treinta por segundo no se nota. Formula BT.601, la de siempre.
   */
  private fun aI420(ancho: Int, alto: Int): JavaI420Buffer {
    val buffer = JavaI420Buffer.allocate(ancho, alto)
    val y = buffer.dataY
    val u = buffer.dataU
    val v = buffer.dataV
    val pasoY = buffer.strideY
    val pasoU = buffer.strideU
    val pasoV = buffer.strideV
    for (fila in 0 until alto) {
      for (col in 0 until ancho) {
        val i = (fila * ancho + col) * 4
        val r = pixeles.get(i).toInt() and 0xff
        val g = pixeles.get(i + 1).toInt() and 0xff
        val b = pixeles.get(i + 2).toInt() and 0xff
        y.put(fila * pasoY + col, (((66 * r + 129 * g + 25 * b + 128) shr 8) + 16).toByte())
        if (fila % 2 == 0 && col % 2 == 0) {
          val iu = (fila / 2) * pasoU + col / 2
          val iv = (fila / 2) * pasoV + col / 2
          u.put(iu, (((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128).toByte())
          v.put(iv, (((112 * r - 94 * g - 18 * b + 128) shr 8) + 128).toByte())
        }
      }
    }
    return buffer
  }
}

/** El controlador que react-native-webrtc espera para crear una pista. */
private class ControladorDelEmulador : AbstractVideoCaptureController(240, 160, FPS) {
  override fun getDeviceId(): String = "emulador"

  override fun createVideoCapturer(): VideoCapturer = CapturadorDelEmulador()
}

/**
 * Crea la pista con la pantalla del emulador y devuelve lo que JavaScript
 * necesita para envolverla en un MediaStream: `{streamId, track}`, lo mismo que
 * devuelve `getDisplayMedia`.
 */
object PistaDelEmulador {
  fun crear(modulo: WebRTCModule, promesa: Promise) {
    ThreadUtils.runOnExecutor {
      try {
        val pista = modulo.createVideoTrack(ControladorDelEmulador())
        if (pista == null) {
          promesa.reject("sin-pista", "No se pudo crear la pista de video")
          return@runOnExecutor
        }
        modulo.createStream(arrayOf<org.webrtc.MediaStreamTrack>(pista)) { streamId, pistas ->
          val datos = Arguments.createMap()
          datos.putString("streamId", streamId)
          datos.putMap("track", pistas[0])
          promesa.resolve(datos)
        }
      } catch (e: Exception) {
        promesa.reject("sin-pista", e.message, e)
      }
    }
  }
}

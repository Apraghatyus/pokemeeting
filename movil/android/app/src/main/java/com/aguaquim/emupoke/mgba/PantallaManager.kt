package com.aguaquim.emupoke.mgba

import android.view.SurfaceHolder
import android.view.SurfaceView
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext

/**
 * La pantalla de la consola, como vista de React Native.
 *
 * Es una SurfaceView: el emulador pinta directamente en su ventana desde su
 * propio hilo, sin pasar por JavaScript ni por el hilo de la interfaz. Es lo que
 * la web no podia hacer y lo que hace que un movil flojo vaya a velocidad plena.
 */
class PantallaManager : SimpleViewManager<SurfaceView>() {
  override fun getName() = "MgbaPantalla"

  override fun createViewInstance(contexto: ThemedReactContext): SurfaceView {
    val vista = SurfaceView(contexto)
    vista.holder.addCallback(
        object : SurfaceHolder.Callback {
          override fun surfaceCreated(holder: SurfaceHolder) = Nativo.superficie(holder.surface)

          override fun surfaceChanged(holder: SurfaceHolder, formato: Int, ancho: Int, alto: Int) =
              Nativo.superficie(holder.surface)

          override fun surfaceDestroyed(holder: SurfaceHolder) = Nativo.superficie(null)
        })
    return vista
  }
}

package com.aguaquim.emupoke

import android.view.KeyEvent
import android.view.MotionEvent
import com.aguaquim.emupoke.mgba.Mando
import com.facebook.react.ReactActivity
import android.view.KeyEvent
import android.view.MotionEvent
import com.aguaquim.emupoke.mgba.Mando
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "EmupokeMovil"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * Los botones de un mando fisico van al juego antes que a nadie. Si no, el B
   * de un mando de Xbox haria de "atras" y te sacaria de la partida. Sin partida
   * corriendo siguen su camino normal y sirven para moverse por la app.
   */
  override fun dispatchKeyEvent(evento: KeyEvent): Boolean =
      Mando.tecla(evento) || super.dispatchKeyEvent(evento)

  override fun dispatchGenericMotionEvent(evento: MotionEvent): Boolean =
      Mando.movimiento(evento) || super.dispatchGenericMotionEvent(evento)
}

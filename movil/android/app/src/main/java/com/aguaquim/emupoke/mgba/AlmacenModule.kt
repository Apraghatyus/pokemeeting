package com.aguaquim.emupoke.mgba

import android.content.Context
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Un `localStorage` para la app, sobre las preferencias de Android.
 *
 * El codigo que la app comparte con la web (reglas, partidas, historial...) lo
 * guarda todo en `localStorage`, que en React Native no existe. En vez de
 * reescribirlo, se le da uno: sincrono, como el del navegador, para que ese
 * codigo funcione igual sin cambiar una linea.
 *
 * Sincrono a proposito, y por eso solo para cosas pequenas: son textos de unos
 * pocos kilobytes. Los estados de la partida van a ficheros, no aqui.
 */
class AlmacenModule(contexto: ReactApplicationContext) : ReactContextBaseJavaModule(contexto) {
  private val preferencias = contexto.getSharedPreferences("almacen", Context.MODE_PRIVATE)

  override fun getName() = "Almacen"

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun leer(clave: String): String? = preferencias.getString(clave, null)

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun escribir(clave: String, valor: String): Boolean {
    preferencias.edit().putString(clave, valor).apply()
    return true
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun borrar(clave: String): Boolean {
    preferencias.edit().remove(clave).apply()
    return true
  }

  @ReactMethod(isBlockingSynchronousMethod = true)
  fun claves(): String = preferencias.all.keys.joinToString("\n")
}

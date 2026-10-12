package com.aguaquim.emupoke.mgba

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext

class MgbaPackage : ReactPackage {
  override fun createNativeModules(contexto: ReactApplicationContext) = listOf(MgbaModule(contexto), AlmacenModule(contexto))

  override fun createViewManagers(contexto: ReactApplicationContext) = listOf(PantallaManager())
}

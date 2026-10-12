// El puente entre Kotlin y el nucleo.
//
// Aqui vive lo que si es de Android: el hilo que emula, la ventana donde se
// pinta y el altavoz. El nucleo (nucleo.cpp) no sabe nada de esto, y por eso se
// puede probar en un ordenador cualquiera.
//
// UNA SOLA PARTIDA A LA VEZ. La app no necesita mas, y asi no hay que pasar
// punteros a Kotlin ni preocuparse por quien libera que.
//
// EL RITMO lo marca un reloj y no el sonido. Atar la emulacion al altavoz es lo
// mas fino, pero si el altavoz se atasca -un auricular bluetooth que se
// desconecta- se para el juego. Con reloj el juego sigue, y como mucho se
// pierde algo de sonido.

#include <aaudio/AAudio.h>
#include <android/log.h>
#include <android/native_window.h>
#include <android/native_window_jni.h>
#include <jni.h>

#include <atomic>
#include <chrono>
#include <cstring>
#include <mutex>
#include <thread>

#include "nucleo.h"

#define LOG(...) __android_log_print(ANDROID_LOG_INFO, "emupoke", __VA_ARGS__)

namespace {

/** La GBA no va a 60 justos: 16.777.216 ciclos entre 280.896 por fotograma. */
constexpr double FOTOGRAMAS_POR_SEGUNDO = 16777216.0 / 280896.0;
constexpr int FRECUENCIA = 48000;

Nucleo nucleo;
std::mutex cerrojo;               // protege `nucleo` y `ventana`
ANativeWindow* ventana = nullptr;
std::thread hilo;
std::atomic<bool> corriendo{false};
std::atomic<bool> pausado{false};
std::atomic<uint32_t> botones{0};  // los de la pantalla
std::atomic<uint32_t> fisicos{0};  // los de un mando Bluetooth o USB
AAudioStream* altavoz = nullptr;

void abrirAltavoz() {
  AAudioStreamBuilder* constructor = nullptr;
  if (AAudio_createStreamBuilder(&constructor) != AAUDIO_OK) return;
  AAudioStreamBuilder_setFormat(constructor, AAUDIO_FORMAT_PCM_I16);
  AAudioStreamBuilder_setChannelCount(constructor, 2);
  AAudioStreamBuilder_setSampleRate(constructor, FRECUENCIA);
  AAudioStreamBuilder_setPerformanceMode(constructor, AAUDIO_PERFORMANCE_MODE_LOW_LATENCY);
  if (AAudioStreamBuilder_openStream(constructor, &altavoz) != AAUDIO_OK) altavoz = nullptr;
  AAudioStreamBuilder_delete(constructor);
  if (altavoz) AAudioStream_requestStart(altavoz);
}

void cerrarAltavoz() {
  if (!altavoz) return;
  AAudioStream_requestStop(altavoz);
  AAudioStream_close(altavoz);
  altavoz = nullptr;
}

/** Copia el fotograma a la ventana. La ventana escala sola al tamano de la vista. */
void pintar() {
  if (!ventana) return;
  ANativeWindow_Buffer buffer;
  if (ANativeWindow_lock(ventana, &buffer, nullptr) != 0) return;
  const unsigned ancho = nucleo.ancho();
  const unsigned alto = nucleo.alto();
  if (static_cast<unsigned>(buffer.width) >= ancho && static_cast<unsigned>(buffer.height) >= alto) {
    const uint32_t* origen = nucleo.pixeles();
    auto* destino = static_cast<uint32_t*>(buffer.bits);
    for (unsigned y = 0; y < alto; ++y) {
      std::memcpy(destino + static_cast<size_t>(y) * buffer.stride, origen + static_cast<size_t>(y) * ancho,
                  ancho * sizeof(uint32_t));
    }
  }
  ANativeWindow_unlockAndPost(ventana);
}

void bucle() {
  using reloj = std::chrono::steady_clock;
  const auto periodo = std::chrono::duration_cast<reloj::duration>(
      std::chrono::duration<double>(1.0 / FOTOGRAMAS_POR_SEGUNDO));
  auto siguiente = reloj::now();
  int16_t sonido[4096];

  while (corriendo) {
    if (pausado) {
      std::this_thread::sleep_for(std::chrono::milliseconds(30));
      siguiente = reloj::now();
      continue;
    }
    int pares = 0;
    {
      std::lock_guard<std::mutex> l(cerrojo);
      // Se suman: se puede jugar con el mando y tocar la pantalla a la vez.
      nucleo.teclas(botones.load() | fisicos.load());
      nucleo.fotograma();
      pares = nucleo.sonido(sonido, 2048);
      pintar();
    }
    // Sin esperar: si el altavoz va lleno, se tira lo que no quepa.
    if (altavoz && pares > 0) AAudioStream_write(altavoz, sonido, pares, 0);

    siguiente += periodo;
    const auto ahora = reloj::now();
    // Si vamos muy atrasados (el sistema nos durmio), no se intenta recuperar
    // a toda velocidad: se sigue desde ahora.
    if (siguiente < ahora - periodo * 4) siguiente = ahora;
    std::this_thread::sleep_until(siguiente);
  }
}

void parar() {
  corriendo = false;
  if (hilo.joinable()) hilo.join();
  cerrarAltavoz();
}

std::string texto(JNIEnv* env, jstring s) {
  if (!s) return {};
  const char* c = env->GetStringUTFChars(s, nullptr);
  std::string r(c);
  env->ReleaseStringUTFChars(s, c);
  return r;
}

}  // namespace

extern "C" {

JNIEXPORT jboolean JNICALL Java_com_aguaquim_emupoke_mgba_Nativo_cargar(JNIEnv* env, jobject, jstring rom,
                                                                       jstring guardado) {
  parar();
  bool ok;
  {
    std::lock_guard<std::mutex> l(cerrojo);
    ok = nucleo.cargar(texto(env, rom), texto(env, guardado), FRECUENCIA);
    if (ok && ventana) {
      ANativeWindow_setBuffersGeometry(ventana, nucleo.ancho(), nucleo.alto(), WINDOW_FORMAT_RGBX_8888);
    }
  }
  if (!ok) {
    LOG("no se pudo cargar la ROM");
    return JNI_FALSE;
  }
  abrirAltavoz();
  pausado = false;
  corriendo = true;
  hilo = std::thread(bucle);
  return JNI_TRUE;
}

JNIEXPORT void JNICALL Java_com_aguaquim_emupoke_mgba_Nativo_cerrar(JNIEnv*, jobject) { parar(); }

JNIEXPORT void JNICALL Java_com_aguaquim_emupoke_mgba_Nativo_pausar(JNIEnv*, jobject, jboolean si) {
  pausado = si == JNI_TRUE;
  if (altavoz) {
    if (pausado) AAudioStream_requestPause(altavoz);
    else AAudioStream_requestStart(altavoz);
  }
}

JNIEXPORT void JNICALL Java_com_aguaquim_emupoke_mgba_Nativo_teclas(JNIEnv*, jobject, jint bits) {
  botones = static_cast<uint32_t>(bits);
}

JNIEXPORT void JNICALL Java_com_aguaquim_emupoke_mgba_Nativo_teclasFisicas(JNIEnv*, jobject, jint bits) {
  fisicos = static_cast<uint32_t>(bits);
}

JNIEXPORT jbyteArray JNICALL Java_com_aguaquim_emupoke_mgba_Nativo_estado(JNIEnv* env, jobject) {
  std::vector<uint8_t> datos;
  {
    std::lock_guard<std::mutex> l(cerrojo);
    datos = nucleo.estado();
  }
  if (datos.empty()) return nullptr;
  jbyteArray salida = env->NewByteArray(static_cast<jsize>(datos.size()));
  env->SetByteArrayRegion(salida, 0, static_cast<jsize>(datos.size()), reinterpret_cast<const jbyte*>(datos.data()));
  return salida;
}

JNIEXPORT jboolean JNICALL Java_com_aguaquim_emupoke_mgba_Nativo_cargarEstado(JNIEnv* env, jobject, jbyteArray datos) {
  const jsize largo = env->GetArrayLength(datos);
  std::vector<uint8_t> bytes(static_cast<size_t>(largo));
  env->GetByteArrayRegion(datos, 0, largo, reinterpret_cast<jbyte*>(bytes.data()));
  std::lock_guard<std::mutex> l(cerrojo);
  return nucleo.cargarEstado(bytes) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT void JNICALL Java_com_aguaquim_emupoke_mgba_Nativo_reiniciar(JNIEnv*, jobject) {
  std::lock_guard<std::mutex> l(cerrojo);
  nucleo.reiniciar();
}

JNIEXPORT void JNICALL Java_com_aguaquim_emupoke_mgba_Nativo_superficie(JNIEnv* env, jobject, jobject surface) {
  std::lock_guard<std::mutex> l(cerrojo);
  if (ventana) {
    ANativeWindow_release(ventana);
    ventana = nullptr;
  }
  if (!surface) return;
  ventana = ANativeWindow_fromSurface(env, surface);
  // La ventana tiene el tamano de la CONSOLA y el sistema la escala a la vista:
  // asi no hay que escalar a mano ni gastar CPU en ello.
  if (ventana && nucleo.cargado()) {
    ANativeWindow_setBuffersGeometry(ventana, nucleo.ancho(), nucleo.alto(), WINDOW_FORMAT_RGBX_8888);
  }
}

JNIEXPORT jint JNICALL Java_com_aguaquim_emupoke_mgba_Nativo_copiarPantalla(JNIEnv* env, jobject,
                                                                          jobject destino) {
  auto* bytes = static_cast<uint8_t*>(env->GetDirectBufferAddress(destino));
  const jlong capacidad = env->GetDirectBufferCapacity(destino);
  if (!bytes) return 0;
  std::lock_guard<std::mutex> l(cerrojo);
  if (!nucleo.cargado()) return 0;
  const unsigned ancho = nucleo.ancho();
  const unsigned alto = nucleo.alto();
  const size_t tamano = static_cast<size_t>(ancho) * alto * sizeof(uint32_t);
  if (capacidad < 0 || static_cast<size_t>(capacidad) < tamano) return 0;
  std::memcpy(bytes, nucleo.pixeles(), tamano);
  return static_cast<jint>((ancho << 16) | alto);
}

}  // extern "C"

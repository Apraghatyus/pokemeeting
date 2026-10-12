// El emulador, sin nada de Android.
//
// Todo lo que toca mGBA vive aqui y no en el puente JNI, por una razon practica:
// asi se puede compilar y probar en un ordenador cualquiera, sin telefono y sin
// SDK de Android. El puente (puente.cpp) solo traduce llamadas y pinta los
// pixeles en la ventana del sistema.
//
// Un Nucleo es UNA partida cargada. No es seguro usarlo desde dos hilos a la vez:
// quien lo usa (el hilo de emulacion) lo protege con su propio cerrojo.

#pragma once

#include <cstdint>
#include <string>
#include <vector>

struct mCore;
struct blip_t;

class Nucleo {
public:
  Nucleo() = default;
  ~Nucleo();
  Nucleo(const Nucleo&) = delete;
  Nucleo& operator=(const Nucleo&) = delete;

  /**
   * Carga una ROM y su fichero de guardado.
   *
   * El guardado se abre para leer y escribir: el juego escribe en el cuando el
   * jugador guarda, igual que en la consola. Si no existe se crea.
   */
  bool cargar(const std::string& rom, const std::string& guardado, int frecuencia);

  /** Un fotograma de juego: 1/60 de segundo. */
  void fotograma();

  /** Los botones pulsados, como bits en el orden de la consola: A, B, Select, Start, derecha, izquierda, arriba, abajo, R, L. */
  void teclas(uint32_t bits);

  /** Los pixeles del ultimo fotograma, en RGBX de 8 bits por canal. */
  const uint32_t* pixeles() const { return video_.data(); }
  unsigned ancho() const { return ancho_; }
  unsigned alto() const { return alto_; }

  /**
   * Saca el sonido que haya pendiente, en muestras estereo intercaladas.
   *
   * Devuelve cuantos PARES de muestras escribio. Se llama despues de cada
   * fotograma: lo que no se recoja se acumula y acaba perdiendose.
   */
  int sonido(int16_t* salida, int maxPares);

  /**
   * El estado entero de la maquina.
   *
   * Es el mismo bloque de 0x61000 bytes que lee packages/pokemon en la web: de
   * ahi sale el equipo, las medallas y el combate. No se comprime ni se envuelve
   * en nada.
   */
  std::vector<uint8_t> estado() const;
  bool cargarEstado(const std::vector<uint8_t>& datos);

  /** Reinicia la consola, como apagar y encender. */
  void reiniciar();

  bool cargado() const { return core_ != nullptr; }

private:
  void liberar();

  mCore* core_ = nullptr;
  blip_t* izquierda_ = nullptr;
  blip_t* derecha_ = nullptr;
  std::vector<uint32_t> video_;
  unsigned ancho_ = 0;
  unsigned alto_ = 0;
};

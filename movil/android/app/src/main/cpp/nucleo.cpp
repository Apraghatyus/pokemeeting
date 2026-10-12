#include "nucleo.h"

#include <fcntl.h>

extern "C" {
#include <mgba/core/blip_buf.h>
#include <mgba/core/core.h>
#include <mgba-util/vfs.h>
}

namespace {
/** Cuantas muestras guarda el nucleo antes de que se recojan. */
constexpr size_t BUFFER_DE_SONIDO = 2048;
}  // namespace

Nucleo::~Nucleo() { liberar(); }

void Nucleo::liberar() {
  if (!core_) return;
  core_->deinit(core_);
  core_ = nullptr;
  izquierda_ = derecha_ = nullptr;
}

bool Nucleo::cargar(const std::string& rom, const std::string& guardado, int frecuencia) {
  liberar();

  // mCoreFind mira el contenido, no la extension: igual que la web, que
  // reconoce la consola por la cabecera.
  core_ = mCoreFind(rom.c_str());
  if (!core_) return false;
  if (!core_->init(core_)) {
    core_ = nullptr;
    return false;
  }
  mCoreInitConfig(core_, nullptr);

  // El tamano se pregunta despues de crear el nucleo: Game Boy Color pinta
  // 160x144 y Advance 240x160.
  core_->desiredVideoDimensions(core_, &ancho_, &alto_);
  video_.assign(static_cast<size_t>(ancho_) * alto_, 0xFF000000u);
  core_->setVideoBuffer(core_, video_.data(), ancho_);

  if (!mCoreLoadFile(core_, rom.c_str())) {
    liberar();
    return false;
  }

  // El guardado lo abre el nucleo y lo cierra el nucleo al liberarse.
  if (!guardado.empty()) {
    VFile* vf = VFileOpen(guardado.c_str(), O_CREAT | O_RDWR);
    if (vf) core_->loadSave(core_, vf);
  }

  core_->setAudioBufferSize(core_, BUFFER_DE_SONIDO);
  izquierda_ = core_->getAudioChannel(core_, 0);
  derecha_ = core_->getAudioChannel(core_, 1);
  // Del reloj de la consola a la frecuencia del altavoz del telefono.
  blip_set_rates(izquierda_, core_->frequency(core_), frecuencia);
  blip_set_rates(derecha_, core_->frequency(core_), frecuencia);

  core_->reset(core_);
  return true;
}

void Nucleo::fotograma() {
  if (core_) core_->runFrame(core_);
}

void Nucleo::teclas(uint32_t bits) {
  if (core_) core_->setKeys(core_, bits);
}

int Nucleo::sonido(int16_t* salida, int maxPares) {
  if (!core_ || !izquierda_ || !derecha_) return 0;
  int pares = blip_samples_avail(izquierda_);
  if (pares > maxPares) pares = maxPares;
  if (pares <= 0) return 0;
  // Con `estereo` a 1 cada canal escribe en una de cada dos posiciones.
  blip_read_samples(izquierda_, salida, pares, 1);
  blip_read_samples(derecha_, salida + 1, pares, 1);
  return pares;
}

std::vector<uint8_t> Nucleo::estado() const {
  if (!core_) return {};
  std::vector<uint8_t> datos(core_->stateSize(core_));
  if (!core_->saveState(core_, datos.data())) return {};
  return datos;
}

bool Nucleo::cargarEstado(const std::vector<uint8_t>& datos) {
  if (!core_ || datos.size() != core_->stateSize(core_)) return false;
  return core_->loadState(core_, datos.data());
}

void Nucleo::reiniciar() {
  if (core_) core_->reset(core_);
}

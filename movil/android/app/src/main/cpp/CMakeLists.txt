# El emulador nativo: mGBA como libreria estatica y el puente con Kotlin.
#
# mGBA se descarga en una version fija. Fija a proposito: el savestate es lo
# que lee packages/pokemon, y una version distinta podria cambiarlo. La 0.10 es
# la misma generacion que el nucleo de la web (0x61000 bytes, comprobado).
cmake_minimum_required(VERSION 3.22.1)
project(emupoke_nativo C CXX)

set(CMAKE_CXX_STANDARD 17)

include(FetchContent)
FetchContent_Declare(
  mgba
  GIT_REPOSITORY https://github.com/mgba-emu/mgba.git
  GIT_TAG 0.10.5
  GIT_SHALLOW TRUE
)
FetchContent_GetProperties(mgba)
if(NOT mgba_POPULATED)
  FetchContent_Populate(mgba)
  # EXCLUDE_FROM_ALL hace que mGBA se construya solo como libreria, sin
  # frontales ni dependencias externas: es su modo LIBMGBA_ONLY.
  add_subdirectory(${mgba_SOURCE_DIR} ${mgba_BINARY_DIR} EXCLUDE_FROM_ALL)
endif()

add_library(emupoke SHARED puente.cpp nucleo.cpp)
target_include_directories(emupoke PRIVATE ${mgba_SOURCE_DIR}/include ${mgba_BINARY_DIR}/include)
target_link_libraries(emupoke mgba android log aaudio)

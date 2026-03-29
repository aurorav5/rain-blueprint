cmake_minimum_required(VERSION 3.20)
project(RainDSPBindings)

find_package(Python3 REQUIRED COMPONENTS Interpreter Development)
find_package(pybind11 CONFIG REQUIRED)

# Reuse the same sources as the native library
set(RAIN_DSP_SOURCES
    ../src/lufs.cpp
    ../src/true_peak.cpp
    ../src/multiband.cpp
    ../src/linear_phase_eq.cpp
    ../src/fft.cpp
    ../src/sail.cpp
    ../src/ms_processing.cpp
    ../src/saturation.cpp
    ../src/riaa.cpp
)

pybind11_add_module(rain_dsp_native bindings.cpp ${RAIN_DSP_SOURCES})
target_include_directories(rain_dsp_native PRIVATE ../include)
target_compile_features(rain_dsp_native PRIVATE cxx_std_20)
target_compile_options(rain_dsp_native PRIVATE -O3 -msse4.2)

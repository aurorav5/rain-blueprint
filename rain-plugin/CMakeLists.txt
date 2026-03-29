cmake_minimum_required(VERSION 3.22)
project(RainConnect VERSION 6.0.0)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUCE 8 must be cloned to vendor/JUCE
# git clone https://github.com/juce-framework/JUCE vendor/JUCE
if(EXISTS "${CMAKE_SOURCE_DIR}/vendor/JUCE")
    add_subdirectory(vendor/JUCE)
else()
    message(FATAL_ERROR "JUCE not found. Run: git clone https://github.com/juce-framework/JUCE vendor/JUCE")
endif()

juce_add_plugin(RainConnect
    COMPANY_NAME "ARCOVEL Technologies International"
    COMPANY_WEBSITE "https://arcovel.com"
    PLUGIN_MANUFACTURER_CODE Arco
    PLUGIN_CODE Rain
    FORMATS CLAP VST3 AU AAX
    PRODUCT_NAME "RAIN Connect"
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_SYNTH FALSE
    COPY_PLUGIN_AFTER_BUILD FALSE
    VST3_CATEGORIES "Analyzer"
    CLAP_ID "com.arcovel.rain-connect"
    CLAP_FEATURES audio-effect analyzer
)

target_sources(RainConnect PRIVATE
    Source/RainConnectProcessor.cpp
    Source/RainConnectEditor.cpp
    Source/MixBusAnalyzer.cpp
    Source/OscBridge.cpp
)

target_include_directories(RainConnect PRIVATE Source)

target_compile_definitions(RainConnect PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
)

target_link_libraries(RainConnect PRIVATE
    juce::juce_audio_processors
    juce::juce_audio_utils
    juce::juce_osc
    juce::juce_dsp
    juce::juce_gui_basics
)

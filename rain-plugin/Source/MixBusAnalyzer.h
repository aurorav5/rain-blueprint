#pragma once
#include <juce_audio_processors/juce_audio_processors.h>

struct MixBusMetrics {
    float headroomDb = -3.0f;    // dB headroom before true peak clip
    float momentaryLufs = -14.0f;
    float rainScore = 0.0f;
};

/// Real-time mix bus analyzer. All methods called on the audio thread.
/// No allocations after prepare(). No I/O. Atomics for cross-thread sharing.
class MixBusAnalyzer
{
public:
    void prepare(double sampleRate);
    MixBusMetrics analyzeFrame(const juce::AudioBuffer<float>& buffer, double sampleRate);

private:
    double sampleRate_ = 48000.0;
    float truePeakMax_ = 0.0f;
    static constexpr float TP_CEILING_DBTP = -1.0f;
};

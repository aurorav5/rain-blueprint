#include "MixBusAnalyzer.h"
#include <cmath>

void MixBusAnalyzer::prepare(double sampleRate)
{
    sampleRate_ = sampleRate;
    truePeakMax_ = 0.0f;
}

MixBusMetrics MixBusAnalyzer::analyzeFrame(
    const juce::AudioBuffer<float>& buffer, double /*sampleRate*/)
{
    MixBusMetrics metrics;

    // True peak approximation (not 4x oversampled — audio thread only)
    float peak = 0.0f;
    for (int ch = 0; ch < buffer.getNumChannels(); ++ch)
    {
        const float* samples = buffer.getReadPointer(ch);
        for (int i = 0; i < buffer.getNumSamples(); ++i)
            peak = std::max(peak, std::abs(samples[i]));
    }

    // Apply 10 Hz leaky peak hold
    truePeakMax_ = std::max(truePeakMax_ * 0.999f, peak);
    const float peakDbfs = truePeakMax_ > 1e-9f
        ? 20.0f * std::log10(truePeakMax_)
        : -120.0f;
    metrics.headroomDb = TP_CEILING_DBTP - peakDbfs;

    // RAIN Score stub — will be replaced with CodecNet inference on background thread
    metrics.rainScore = std::clamp(100.0f + peakDbfs * 2.0f, 0.0f, 100.0f);

    return metrics;
}

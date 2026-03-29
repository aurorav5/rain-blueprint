#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_osc/juce_osc.h>

class MixBusAnalyzer;

class RainConnectProcessor : public juce::AudioProcessor,
                              private juce::Timer
{
public:
    RainConnectProcessor();
    ~RainConnectProcessor() override;

    void prepareToPlay(double sampleRate, int maximumExpectedSamplesPerBlock) override;
    void releaseResources() override;
    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiMessages) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "RAIN Connect"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 0.0; }

    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return "Default"; }
    void changeProgramName(int, const juce::String&) override {}

    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

    // OSC namespace: /rain/connect/*
    static constexpr int OSC_PORT = 9000;

private:
    void timerCallback() override;
    void sendOscMetrics();

    std::unique_ptr<MixBusAnalyzer> analyzer;
    juce::OSCSender oscSender;
    double currentSampleRate = 48000.0;

    // Current metrics (updated on audio thread, read on timer thread)
    std::atomic<float> headroomDb { -3.0f };
    std::atomic<float> rainScore { 0.0f };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(RainConnectProcessor)
};

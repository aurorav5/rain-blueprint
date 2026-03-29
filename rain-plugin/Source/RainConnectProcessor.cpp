#include "RainConnectProcessor.h"
#include "MixBusAnalyzer.h"

RainConnectProcessor::RainConnectProcessor()
    : AudioProcessor(BusesProperties()
          .withInput("Input", juce::AudioChannelSet::stereo(), true)
          .withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    analyzer = std::make_unique<MixBusAnalyzer>();

    // Connect OSC sender to localhost:9000
    if (!oscSender.connect("127.0.0.1", OSC_PORT))
        DBG("RAIN Connect: Failed to connect OSC sender to port " + juce::String(OSC_PORT));

    // Send metrics at 10 Hz
    startTimer(100);
}

RainConnectProcessor::~RainConnectProcessor()
{
    stopTimer();
}

void RainConnectProcessor::prepareToPlay(double sampleRate, int /*samplesPerBlock*/)
{
    currentSampleRate = sampleRate;
    analyzer->prepare(sampleRate);
}

void RainConnectProcessor::releaseResources() {}

void RainConnectProcessor::processBlock(juce::AudioBuffer<float>& buffer,
                                         juce::MidiBuffer& /*midiMessages*/)
{
    // Audio thread: measure metrics, update atomics (no allocations, no I/O)
    auto metrics = analyzer->analyzeFrame(buffer, currentSampleRate);
    headroomDb.store(metrics.headroomDb, std::memory_order_relaxed);
    rainScore.store(metrics.rainScore, std::memory_order_relaxed);

    // Pass-through (analyzer only — no processing)
}

void RainConnectProcessor::timerCallback()
{
    sendOscMetrics();
}

void RainConnectProcessor::sendOscMetrics()
{
    // Send on timer thread (not audio thread) — OSC has allocations
    oscSender.send("/rain/connect/headroom", headroomDb.load(std::memory_order_relaxed));
    oscSender.send("/rain/connect/score",    static_cast<int>(rainScore.load(std::memory_order_relaxed)));
    oscSender.send("/rain/connect/penalty/spotify",    0.5f);  // placeholder until CodecNet
    oscSender.send("/rain/connect/penalty/apple",      0.3f);
}

void RainConnectProcessor::getStateInformation(juce::MemoryBlock& /*destData*/) {}
void RainConnectProcessor::setStateInformation(const void* /*data*/, int /*sizeInBytes*/) {}

juce::AudioProcessorEditor* RainConnectProcessor::createEditor()
{
    return new juce::GenericAudioProcessorEditor(*this);
}

// Plugin factory
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new RainConnectProcessor();
}

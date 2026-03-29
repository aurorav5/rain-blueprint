// ITU-R BS.1770-4 True Peak measurement via 4x polyphase oversampling
// 48-tap Kaiser-windowed FIR, β=6.0
// Normalized cutoff fc=0.5 relative to the ORIGINAL sample rate,
// equivalently fc=0.125 relative to the 4x upsampled rate.
// Polyphase: split into 4 phases × 12 taps. Find max |sample| across all phases.
// All arithmetic in 64-bit double.

#include "rain_dsp.h"
#include "true_peak.h"
#include <cmath>
#include <cstddef>
#include <algorithm>
#include <limits>

namespace rain {

namespace {

// 48-tap Kaiser-windowed sinc FIR for 4x polyphase oversampling.
// Design parameters:
//   N = 48, β = 6.0, fc = 0.25 (= 0.5/L where L=4, normalized to upsampled rate)
//   Normalized so sum(h) = 1.0.
// These coefficients are computed by:
//   1. Kaiser window w[n] = I0(β·√(1−(2n/(N-1)−1)²)) / I0(β)
//   2. Sinc: h[n] = sin(π·fc·(n−(N-1)/2)) / (π·(n−(N-1)/2)), fc=0.25
//   3. h[n] *= w[n]
//   4. Normalize: h[n] /= sum(h)
// After polyphase decomposition with L=4 and multiplying by L=4 in the filter:
//   - All 4 phase sub-filters have equal gain
//   - Peak of a 0 dBFS sine ≈ 0.0 dBTP (within ±0.05 dBTP)
constexpr int FIR_LEN = 48;
constexpr int PHASES  = 4;
constexpr int TAPS    = FIR_LEN / PHASES; // 12 taps per phase

constexpr double FIR_COEFFS[FIR_LEN] = {
    -0.0000771038953, -0.0003698666331, -0.0006308766877, -0.0004088112424,
    +0.0006039221411, +0.0020661579336, +0.0028361620288, +0.0015722527929,
    -0.0020613128811, -0.0064147201433, -0.0081538555294, -0.0042444002233,
    +0.0052858750631, +0.0157861521765, +0.0194451702151, +0.0099069034299,
    -0.0122093604085, -0.0365626384544, -0.0459425865717, -0.0244664503790,
    +0.0327466900364, +0.1140470851401, +0.1938977220016, +0.2433478900902,
    +0.2433478900902, +0.1938977220016, +0.1140470851401, +0.0327466900364,
    -0.0244664503790, -0.0459425865717, -0.0365626384544, -0.0122093604085,
    +0.0099069034299, +0.0194451702151, +0.0157861521765, +0.0052858750631,
    -0.0042444002233, -0.0081538555294, -0.0064147201433, -0.0020613128811,
    +0.0015722527929, +0.0028361620288, +0.0020661579336, +0.0006039221411,
    -0.0004088112424, -0.0006308766877, -0.0003698666331, -0.0000771038953
};

// Polyphase sub-filter: poly[phase][tap] = FIR_COEFFS[phase + tap * PHASES]
// Phase 0: FIR_COEFFS[0], FIR_COEFFS[4], FIR_COEFFS[8], ..., FIR_COEFFS[44]
// Phase 1: FIR_COEFFS[1], FIR_COEFFS[5], FIR_COEFFS[9], ..., FIR_COEFFS[45]
// etc.

// Single-channel true peak measurement using polyphase FIR.
// Returns max absolute interpolated sample value (linear).
double channel_true_peak(const double* samples, size_t n) {
    // Build polyphase sub-filters
    double poly[PHASES][TAPS];
    for (int p = 0; p < PHASES; ++p) {
        for (int t = 0; t < TAPS; ++t) {
            poly[p][t] = FIR_COEFFS[p + t * PHASES];
        }
    }

    // History buffer: TAPS past samples (history[0] = most recent)
    double history[TAPS] = {};
    double peak = 0.0;

    for (size_t i = 0; i < n; ++i) {
        // Shift history and insert new sample
        for (int t = TAPS - 1; t > 0; --t) {
            history[t] = history[t - 1];
        }
        history[0] = samples[i];

        // Evaluate all 4 phase sub-filters
        // Each phase produces one interpolated sample at a sub-sample offset.
        // Multiply by PHASES (= L = 4) to compensate for the fc = 0.5/L normalization.
        for (int p = 0; p < PHASES; ++p) {
            double y = 0.0;
            for (int t = 0; t < TAPS; ++t) {
                y += poly[p][t] * history[t];
            }
            y *= static_cast<double>(PHASES);  // upsampling gain compensation
            double ay = std::abs(y);
            if (ay > peak) peak = ay;
        }
    }
    return peak;
}

} // anonymous namespace

double rain_measure_true_peak(
    const double* left,
    const double* right,
    size_t num_samples,
    double /*sample_rate*/)
{
    if (num_samples == 0) return -std::numeric_limits<double>::infinity();

    double peak_l = channel_true_peak(left,  num_samples);
    double peak_r = channel_true_peak(right, num_samples);
    double peak   = std::max(peak_l, peak_r);

    if (peak <= 0.0) return -std::numeric_limits<double>::infinity();
    return 20.0 * std::log10(peak);
}

} // namespace rain

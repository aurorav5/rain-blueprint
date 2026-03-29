// SAIL: Stem-Aware Intelligent Limiter with lookahead
// Full-band lookahead limiter + LUFS normalization
// All arithmetic in 64-bit double.

#include "rain_dsp.h"
#include "sail.h"
#include "lufs.h"
#include "true_peak.h"
#include <cmath>
#include <vector>
#include <algorithm>
#include <cstring>

namespace rain {

void apply_sail(
    double* left,
    double* right,
    size_t num_samples,
    double sample_rate,
    const ProcessingParams& params)
{
    if (num_samples == 0) return;

    // Limiter coefficients
    const double attack_coeff  = std::exp(-1.0 / (sample_rate * 0.001));   // 1ms attack
    const double release_coeff = std::exp(-1.0 / (sample_rate * 0.050));   // 50ms release

    // Lookahead in samples
    const int lookahead = static_cast<int>(0.002 * sample_rate);  // 2ms

    // Peak ceiling: convert dBTP to linear
    const double peak_ceiling_linear = std::pow(10.0, params.true_peak_ceiling / 20.0);

    // --- Apply limiter only if sail_enabled ---
    if (params.sail_enabled && lookahead > 0) {
        // Delay buffer (circular) for lookahead
        std::vector<double> delay_l(lookahead, 0.0);
        std::vector<double> delay_r(lookahead, 0.0);
        int delay_pos = 0;

        // Envelope detector state
        double envelope = 0.0;
        double gain_smooth = 1.0;

        // Lookahead envelope: compute max absolute value over the next `lookahead` samples
        // We use a sliding window max approximation via the delay line:
        // At each output sample n, we process input sample n+lookahead (if available)
        // and output the delayed sample n with the gain computed from the lookahead window.

        // Process: for each output sample i, we look ahead `lookahead` samples
        // Use a simplified approach: delay both channels, compute envelope from the
        // lookahead (undated) input
        for (size_t i = 0; i < num_samples; ++i) {
            // Lookahead input index
            size_t ahead_idx = i + static_cast<size_t>(lookahead);

            // Compute instantaneous peak from the lookahead sample
            double ahead_l = (ahead_idx < num_samples) ? left[ahead_idx]  : 0.0;
            double ahead_r = (ahead_idx < num_samples) ? right[ahead_idx] : 0.0;
            double inst_peak = std::max(std::abs(ahead_l), std::abs(ahead_r));

            // Smooth envelope
            if (inst_peak > envelope) {
                envelope = attack_coeff  * envelope + (1.0 - attack_coeff)  * inst_peak;
            } else {
                envelope = release_coeff * envelope + (1.0 - release_coeff) * inst_peak;
            }

            // Gain reduction
            double target_gain = 1.0;
            if (envelope > peak_ceiling_linear && envelope > 1e-30) {
                target_gain = peak_ceiling_linear / envelope;
            }

            // Smooth gain (always use release on the way up, attack on the way down)
            if (target_gain < gain_smooth) {
                gain_smooth = attack_coeff  * gain_smooth + (1.0 - attack_coeff)  * target_gain;
            } else {
                gain_smooth = release_coeff * gain_smooth + (1.0 - release_coeff) * target_gain;
            }
            // Clamp gain: never amplify above 1.0 in limiter stage
            if (gain_smooth > 1.0) gain_smooth = 1.0;

            // Read from delay buffer (this is the delayed input)
            double delayed_l = delay_l[delay_pos];
            double delayed_r = delay_r[delay_pos];

            // Write current sample into delay buffer
            delay_l[delay_pos] = left[i];
            delay_r[delay_pos] = right[i];
            delay_pos = (delay_pos + 1) % lookahead;

            // Apply gain to delayed signal
            left[i]  = delayed_l * gain_smooth;
            right[i] = delayed_r * gain_smooth;
        }

        // Flush the delay buffer (tail samples)
        for (int d = 0; d < lookahead; ++d) {
            // The remaining samples in the delay buffer don't get output in this scheme
            // (they're within the lookahead margin). This is acceptable for block processing.
        }
    }

    // --- LUFS normalization (always applied, even if sail_enabled=false) ---
    // Measure current LUFS
    LufsResult current = rain_measure_lufs(left, right, num_samples, sample_rate);

    if (std::isfinite(current.integrated) && current.integrated > -200.0) {
        double lufs_diff = params.target_lufs - current.integrated;  // how many dB to add
        double required_gain_db = lufs_diff;

        // Clamp: never amplify by more than +6 dB
        if (required_gain_db > 6.0) {
            required_gain_db = 6.0;
        }

        // Do not apply if gain is negligibly small
        if (std::abs(required_gain_db) > 0.001) {
            double gain_linear = std::pow(10.0, required_gain_db / 20.0);

            // Check that applying this gain won't exceed true peak ceiling
            // Measure current true peak
            double tp_db = rain_measure_true_peak(left, right, num_samples, sample_rate);
            double tp_after = tp_db + required_gain_db;

            // If applying gain would push true peak above ceiling, reduce gain
            if (tp_after > params.true_peak_ceiling) {
                double headroom = params.true_peak_ceiling - tp_db;
                // headroom may be negative if we're already over ceiling — clamp to 0
                if (headroom < 0.0) headroom = 0.0;
                gain_linear = std::pow(10.0, headroom / 20.0);
                // Only attenuate if we're already over ceiling, don't amplify
                if (gain_linear > 1.0) gain_linear = 1.0;
            }

            for (size_t i = 0; i < num_samples; ++i) {
                left[i]  *= gain_linear;
                right[i] *= gain_linear;
            }
        }
    }
}

} // namespace rain

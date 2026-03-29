// ITU-R BS.1770-4 Integrated Loudness (LUFS) measurement
// All arithmetic in 64-bit double. Biquad sign: y = b0x + b1x1 + b2x2 - a1y1 - a2y2

#include "rain_dsp.h"
#include "true_peak.h"
#include <cmath>
#include <vector>
#include <numeric>
#include <algorithm>

namespace rain {

namespace {

// Compute K-weighted mean-square for a block
// Applies two biquad stages per channel then sums L+R mean squares
double k_weighted_mean_square(
    const double* left, const double* right, size_t n,
    BiquadState& sl1a, BiquadState& sl1b,
    BiquadState& sr1a, BiquadState& sr1b)
{
    double sum = 0.0;
    for (size_t i = 0; i < n; ++i) {
        double l = biquad_tick(K_WEIGHT_STAGE1A_48K, sl1a, left[i]);
        l        = biquad_tick(K_WEIGHT_STAGE1B_48K, sl1b, l);
        double r = biquad_tick(K_WEIGHT_STAGE1A_48K, sr1a, right[i]);
        r        = biquad_tick(K_WEIGHT_STAGE1B_48K, sr1b, r);
        sum += l * l + r * r;
    }
    return sum / static_cast<double>(n);
}

// Welford online mean for numerically stable accumulation
struct WelfordMean {
    size_t count = 0;
    double mean  = 0.0;
    void add(double x) noexcept {
        ++count;
        mean += (x - mean) / static_cast<double>(count);
    }
};

} // anon

LufsResult rain_measure_lufs(
    const double* left,
    const double* right,
    size_t num_samples,
    double sample_rate)
{
    LufsResult result{};
    if (num_samples == 0) return result;

    // Block sizes per ITU-R BS.1770-4
    const size_t block_400ms = static_cast<size_t>(0.4  * sample_rate);  // momentary
    const size_t hop_100ms   = static_cast<size_t>(0.1  * sample_rate);  // 75% overlap
    const size_t block_3s    = static_cast<size_t>(3.0  * sample_rate);  // short-term

    if (block_400ms == 0 || hop_100ms == 0) return result;

    // --- Pass 1: collect mean-square values for all 400ms blocks ---
    BiquadState sl1a, sl1b, sr1a, sr1b;
    std::vector<double> block_ms;
    block_ms.reserve(num_samples / hop_100ms + 4);

    for (size_t start = 0; start + block_400ms <= num_samples; start += hop_100ms) {
        BiquadState l1a = sl1a, l1b = sl1b, r1a = sr1a, r1b = sr1b;
        double ms = k_weighted_mean_square(
            left + start, right + start, block_400ms,
            l1a, l1b, r1a, r1b);
        block_ms.push_back(ms);
    }

    if (block_ms.empty()) return result;

    // --- Absolute gate: -70 LUFS ↔ mean-square threshold ---
    constexpr double ABS_GATE_LINEAR = 1e-7;  // 10^(-70/10)

    // Ungated mean
    WelfordMean ungated;
    for (double ms : block_ms)
        if (ms > ABS_GATE_LINEAR) ungated.add(ms);

    if (ungated.count == 0) {
        result.integrated = -std::numeric_limits<double>::infinity();
        return result;
    }

    // --- Relative gate: reject blocks < (ungated loudness - 10 LU) ---
    double rel_threshold = ungated.mean * 0.1;  // -10 LU in linear = * 0.1

    WelfordMean gated;
    for (double ms : block_ms)
        if (ms > ABS_GATE_LINEAR && ms > rel_threshold) gated.add(ms);

    result.integrated = (gated.count > 0)
        ? -0.691 + 10.0 * std::log10(gated.mean)
        : -std::numeric_limits<double>::infinity();

    // --- Momentary loudness (last 400ms block) ---
    {
        double last_ms = block_ms.back();
        result.momentary = (last_ms > 0.0)
            ? -0.691 + 10.0 * std::log10(last_ms)
            : -std::numeric_limits<double>::infinity();
    }

    // --- Short-term loudness (last 3s) ---
    if (num_samples >= block_3s) {
        BiquadState l1a, l1b, r1a, r1b;
        double ms_3s = k_weighted_mean_square(
            left  + (num_samples - block_3s),
            right + (num_samples - block_3s),
            block_3s, l1a, l1b, r1a, r1b);
        result.short_term = (ms_3s > 0.0)
            ? -0.691 + 10.0 * std::log10(ms_3s)
            : -std::numeric_limits<double>::infinity();
    } else {
        result.short_term = result.integrated;
    }

    // --- LRA (loudness range): 10th – 95th percentile of short-term blocks ---
    {
        std::vector<double> st_blocks;
        for (size_t start = 0; start + block_3s <= num_samples; start += hop_100ms) {
            BiquadState l1a, l1b, r1a, r1b;
            double ms = k_weighted_mean_square(
                left + start, right + start, block_3s,
                l1a, l1b, r1a, r1b);
            if (ms > ABS_GATE_LINEAR)
                st_blocks.push_back(-0.691 + 10.0 * std::log10(ms));
        }
        if (st_blocks.size() >= 2) {
            std::sort(st_blocks.begin(), st_blocks.end());
            size_t lo = static_cast<size_t>(0.10 * (st_blocks.size() - 1));
            size_t hi = static_cast<size_t>(0.95 * (st_blocks.size() - 1));
            result.loudness_range = st_blocks[hi] - st_blocks[lo];
        }
    }

    // --- True peak ---
    result.true_peak_dbtp = rain_measure_true_peak(left, right, num_samples, sample_rate);

    return result;
}

} // namespace rain

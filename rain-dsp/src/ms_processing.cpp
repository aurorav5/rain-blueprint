// M/S (Mid-Side) processing
// Encode: M = (L+R)/sqrt(2), S = (L-R)/sqrt(2)
// Apply gains and stereo_width
// Decode: L = (M+S)/sqrt(2), R = (M-S)/sqrt(2)
// All arithmetic in 64-bit double.

#include "rain_dsp.h"
#include "ms_processing.h"
#include <cmath>

namespace rain {

void apply_ms_processing(
    double* left,
    double* right,
    size_t num_samples,
    const ProcessingParams& params)
{
    if (!params.ms_enabled) return;
    if (num_samples == 0) return;

    // Precompute linear gains
    const double mid_gain_linear  = std::pow(10.0, params.mid_gain  / 20.0);
    const double side_gain_linear = std::pow(10.0, params.side_gain / 20.0);
    const double width            = params.stereo_width;

    constexpr double SQRT2_INV = 1.0 / 1.41421356237309504880168872420969807856967187537694;

    for (size_t i = 0; i < num_samples; ++i) {
        const double l = left[i];
        const double r = right[i];

        // Encode to M/S
        double m = (l + r) * SQRT2_INV;
        double s = (l - r) * SQRT2_INV;

        // Apply mid/side gains
        m *= mid_gain_linear;
        s *= side_gain_linear;

        // Apply stereo width (scale side channel)
        // width=0 → mono (s=0), width=1 → unity, width=2 → double width
        s *= width;

        // Decode back to L/R
        left[i]  = (m + s) * SQRT2_INV;
        right[i] = (m - s) * SQRT2_INV;
    }
}

} // namespace rain

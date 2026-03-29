// 3-band Linkwitz-Riley 4th-order multiband dynamic range compressor
// Crossovers: low/mid @ 200 Hz, mid/high @ 5000 Hz
// All arithmetic in 64-bit double.
// Biquad sign: y = b0·x + b1·x1 + b2·x2 - a1·y1 - a2·y2

#include "rain_dsp.h"
#include "multiband.h"
#include <cmath>
#include <algorithm>
#include <cstring>

namespace rain {

namespace {

// Compute Butterworth 2nd-order LP biquad coefficients at cutoff fc (Hz), sample rate sr
// Q = 1/sqrt(2) for maximally flat
// Using standard bilinear transform derivation:
//   w0 = 2*pi*fc/sr
//   alpha = sin(w0) / (2 * (1/sqrt(2))) = sin(w0) * sqrt(2) / 2
//   b0 = (1 - cos(w0)) / 2
//   b1 = 1 - cos(w0)
//   b2 = (1 - cos(w0)) / 2
//   a0 = 1 + alpha
//   a1 = -2*cos(w0)   (stored as is, subtracted in biquad_tick)
//   a2 = 1 - alpha
// Normalize by a0. Store a1,a2 pre-divided by a0.
BiquadCoefficients make_butter2_lp(double fc, double sr) {
    double w0    = 2.0 * M_PI * fc / sr;
    double cosw0 = std::cos(w0);
    double sinw0 = std::sin(w0);
    // Q = 1/sqrt(2)
    double alpha = sinw0 / (2.0 * (1.0 / std::sqrt(2.0)));
    double a0    = 1.0 + alpha;

    BiquadCoefficients c;
    c.b0 = (1.0 - cosw0) / 2.0 / a0;
    c.b1 = (1.0 - cosw0)       / a0;
    c.b2 = (1.0 - cosw0) / 2.0 / a0;
    c.a1 = (-2.0 * cosw0)      / a0;  // stored as negative, subtracted in biquad_tick
    c.a2 = (1.0 - alpha)       / a0;
    return c;
}

// Compute Butterworth 2nd-order HP biquad coefficients at cutoff fc
// b0 = (1 + cos(w0)) / 2
// b1 = -(1 + cos(w0))
// b2 = (1 + cos(w0)) / 2
// Same a coefficients as LP
BiquadCoefficients make_butter2_hp(double fc, double sr) {
    double w0    = 2.0 * M_PI * fc / sr;
    double cosw0 = std::cos(w0);
    double sinw0 = std::sin(w0);
    double alpha = sinw0 / (2.0 * (1.0 / std::sqrt(2.0)));
    double a0    = 1.0 + alpha;

    BiquadCoefficients c;
    c.b0 =  (1.0 + cosw0) / 2.0 / a0;
    c.b1 = -(1.0 + cosw0)       / a0;
    c.b2 =  (1.0 + cosw0) / 2.0 / a0;
    c.a1 = (-2.0 * cosw0)       / a0;
    c.a2 = (1.0 - alpha)        / a0;
    return c;
}

// LR4 = two cascaded 2nd-order Butterworth biquads (same coefficients applied twice)
// State for one LR4 filter (2 biquad stages)
struct LR4State {
    BiquadState s1, s2;
};

inline double lr4_tick(const BiquadCoefficients& c, LR4State& st, double x) {
    double y1 = biquad_tick(c, st.s1, x);
    return biquad_tick(c, st.s2, y1);
}

// Per-channel, per-band biquad state for crossover
struct CrossoverState {
    LR4State lp1;   // LR4 LP for low/mid crossover
    LR4State hp1;   // LR4 HP for low/mid crossover
    LR4State lp2;   // LR4 LP for mid/high crossover
    LR4State hp2;   // LR4 HP for mid/high crossover
};

// Per-band compressor state (single channel)
struct CompressorState {
    double envelope_sq = 0.0; // running RMS envelope (mean square)
    double gain_smooth = 1.0; // smoothed gain
};

// RMS compressor: compute gain for a single sample given RMS envelope tracking
// Returns linear gain to apply
double compute_comp_gain(
    double x,
    CompressorState& st,
    double attack_coeff,
    double release_coeff,
    double threshold_db,
    double ratio)
{
    // Update envelope (RMS via mean-square smoothing)
    double x_sq = x * x;
    if (x_sq > st.envelope_sq) {
        st.envelope_sq = attack_coeff * st.envelope_sq + (1.0 - attack_coeff) * x_sq;
    } else {
        st.envelope_sq = release_coeff * st.envelope_sq + (1.0 - release_coeff) * x_sq;
    }

    double rms = std::sqrt(std::max(0.0, st.envelope_sq));
    if (rms < 1e-30) return 1.0;

    double rms_db = 20.0 * std::log10(rms);

    // Gain computer: below threshold = 0 dB gain; above = compress
    double gain_db = 0.0;
    if (rms_db > threshold_db && ratio > 1.0) {
        // gain_db = (threshold - rms) * (1 - 1/ratio)  — this is negative (gain reduction)
        gain_db = (threshold_db - rms_db) * (1.0 - 1.0 / ratio);
    }

    // Clamp to non-positive (compressor only reduces)
    if (gain_db > 0.0) gain_db = 0.0;

    double gain_linear = std::pow(10.0, gain_db / 20.0);
    return gain_linear;
}

} // anonymous namespace

void apply_multiband(
    double* left,
    double* right,
    size_t num_samples,
    double sample_rate,
    const ProcessingParams& params)
{
    if (num_samples == 0) return;

    // Crossover frequencies
    constexpr double XOVER_LM = 200.0;   // low/mid
    constexpr double XOVER_MH = 5000.0;  // mid/high

    // Build crossover filter coefficients
    const BiquadCoefficients lp_lm = make_butter2_lp(XOVER_LM, sample_rate);
    const BiquadCoefficients hp_lm = make_butter2_hp(XOVER_LM, sample_rate);
    const BiquadCoefficients lp_mh = make_butter2_lp(XOVER_MH, sample_rate);
    const BiquadCoefficients hp_mh = make_butter2_hp(XOVER_MH, sample_rate);

    // Per-channel crossover states
    CrossoverState xL{}, xR{};

    // Per-band compressor states (L and R)
    CompressorState compL[3]{}, compR[3]{};

    // Precompute attack/release coefficients
    auto make_coeff = [&](double ms) -> double {
        return std::exp(-1.0 / (sample_rate * ms / 1000.0));
    };

    double att[3] = {
        make_coeff(params.mb_attack_low),
        make_coeff(params.mb_attack_mid),
        make_coeff(params.mb_attack_high)
    };
    double rel[3] = {
        make_coeff(params.mb_release_low),
        make_coeff(params.mb_release_mid),
        make_coeff(params.mb_release_high)
    };
    double thr[3] = {
        params.mb_threshold_low,
        params.mb_threshold_mid,
        params.mb_threshold_high
    };
    double rat[3] = {
        params.mb_ratio_low,
        params.mb_ratio_mid,
        params.mb_ratio_high
    };

    for (size_t i = 0; i < num_samples; ++i) {
        double xl = left[i];
        double xr = right[i];

        // --- Split channels into 3 bands via LR4 crossovers ---
        // LR4 LP and HP at 200 Hz
        double low_l  = lr4_tick(lp_lm, xL.lp1, xl);
        double rest_l = lr4_tick(hp_lm, xL.hp1, xl);
        double low_r  = lr4_tick(lp_lm, xR.lp1, xr);
        double rest_r = lr4_tick(hp_lm, xR.hp1, xr);

        // LR4 LP and HP at 5000 Hz on the rest
        double mid_l  = lr4_tick(lp_mh, xL.lp2, rest_l);
        double high_l = lr4_tick(hp_mh, xL.hp2, rest_l);
        double mid_r  = lr4_tick(lp_mh, xR.lp2, rest_r);
        double high_r = lr4_tick(hp_mh, xR.hp2, rest_r);

        double bands_l[3] = { low_l, mid_l, high_l };
        double bands_r[3] = { low_r, mid_r, high_r };

        // --- Apply per-band compression ---
        for (int b = 0; b < 3; ++b) {
            // Use average of L and R for gain computation (linked stereo)
            double avg = (bands_l[b] + bands_r[b]) * 0.5;
            // Compute gain from linked signal
            double gain = compute_comp_gain(
                avg, compL[b], att[b], rel[b], thr[b], rat[b]);
            // Keep compR state in sync (same gain)
            compR[b].envelope_sq = compL[b].envelope_sq;
            compR[b].gain_smooth = compL[b].gain_smooth;

            bands_l[b] *= gain;
            bands_r[b] *= gain;
        }

        // --- Sum bands back to stereo output ---
        left[i]  = bands_l[0] + bands_l[1] + bands_l[2];
        right[i] = bands_r[0] + bands_r[1] + bands_r[2];
    }
}

} // namespace rain

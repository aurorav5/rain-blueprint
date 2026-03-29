// RIAA equalization per IEC 60098
// Analog RIAA transfer function: H(s) = (1 + s·τ2) / ((1 + s·τ1)(1 + s·τ3))
// τ1 = 3180µs, τ2 = 318µs, τ3 = 75µs
//
// Bilinear transform design for digital implementation.
// Must pass IEC 60098 accuracy: ±0.01 dB at 20Hz, 1kHz, 10kHz, 20kHz.
//
// All arithmetic in 64-bit double.

#include "rain_dsp.h"
#include "riaa.h"
#include <cmath>
#include <cstddef>

namespace rain {

namespace {

// RIAA time constants
constexpr double TAU1 = 3180e-6;  // 3180 µs
constexpr double TAU2 =  318e-6;  //  318 µs
constexpr double TAU3 =   75e-6;  //   75 µs

// Analog RIAA magnitude response squared at angular frequency omega
// H(jω) = (1 + jω·τ2) / ((1 + jω·τ1)(1 + jω·τ3))
// |H(jω)|² = (1 + (ω·τ2)²) / ((1 + (ω·τ1)²)(1 + (ω·τ3)²))
static double riaa_mag_sq_analog(double omega) {
    double wt2 = omega * TAU2;
    double wt1 = omega * TAU1;
    double wt3 = omega * TAU3;
    double num = 1.0 + wt2 * wt2;
    double den = (1.0 + wt1 * wt1) * (1.0 + wt3 * wt3);
    return num / den;
}

// Normalization gain (to 0 dB at 1 kHz)
static double riaa_norm_db() {
    double omega_1k = 2.0 * M_PI * 1000.0;
    double mag_sq_1k = riaa_mag_sq_analog(omega_1k);
    return -10.0 * std::log10(mag_sq_1k);  // dB correction to make 1kHz = 0 dB
}

// Bilinear transform RIAA IIR design
// The analog RIAA H(s) = (1 + s·τ2) / ((1 + s·τ1)(1 + s·τ3))
//
// We factor this into two biquad stages:
// Stage 1: zero at -1/τ2, pole at -1/τ1
// Stage 2: pole at -1/τ3 (and a zero at infinity — high-pass character)
//
// More precisely, after partial fraction analysis:
// H(s) = numerator / denominator where:
//   numerator  = τ2·s + 1
//   denominator = (τ1·s + 1)(τ3·s + 1) = τ1·τ3·s² + (τ1+τ3)·s + 1
//
// We apply bilinear transform s = 2·sr·(z-1)/(z+1):
// Let K = 2*sr (bilinear transform pre-warping factor without pre-warp)
//
// For correct frequency mapping, we design two first-order sections and
// then combine to biquad stages.
//
// Stage 1 (first-order): numerator = τ2·s + 1, denominator = τ1·s + 1
//   H1(s) = (τ2·s + 1)/(τ1·s + 1)
//   Apply s = K*(z-1)/(z+1):
//   H1(z) = (τ2·K·(z-1) + (z+1)) / (τ1·K·(z-1) + (z+1))
//          = ((τ2·K+1)·z + (1-τ2·K)) / ((τ1·K+1)·z + (1-τ1·K))
//   Divide by (τ1·K+1):
//   b0 = (τ2·K+1)/(τ1·K+1)
//   b1 = (1-τ2·K)/(τ1·K+1)
//   a1 = (1-τ1·K)/(τ1·K+1)   [stored for subtraction per biquad convention]
//
// Stage 2 (first-order): 1/(τ3·s + 1) — purely a pole
//   H2(s) = 1/(τ3·s + 1)
//   H2(z) = (z+1) / ((τ3·K+1)·z + (1-τ3·K))
//   b0 = 1/(τ3·K+1)
//   b1 = 1/(τ3·K+1)
//   a1 = (1-τ3·K)/(τ3·K+1)   [stored for subtraction]
//
// Note: the overall 0dB normalization at 1kHz is applied as a scalar gain.
//
// We implement as two BiquadCoefficients with b2=0, a2=0 (first-order sections embedded in biquad structs).

struct RiaaBiquads {
    BiquadCoefficients stage1;  // (τ2s+1)/(τ1s+1) bilinear
    BiquadCoefficients stage2;  // 1/(τ3s+1) bilinear
    double norm_gain;           // linear gain for 0dB at 1kHz
};

static RiaaBiquads make_riaa_filters(double sr) {
    double K = 2.0 * sr;  // bilinear transform constant

    // Stage 1: H1(s) = (τ2·s + 1)/(τ1·s + 1)
    {
        // Implemented as 1st-order embedded in biquad (b2=a2=0)
    }

    double t2K = TAU2 * K;
    double t1K = TAU1 * K;
    double t3K = TAU3 * K;

    RiaaBiquads r{};

    // Stage 1: (τ2s+1)/(τ1s+1)
    double s1_a0 = t1K + 1.0;
    r.stage1.b0  = (t2K + 1.0) / s1_a0;
    r.stage1.b1  = (1.0 - t2K) / s1_a0;
    r.stage1.b2  = 0.0;
    // a1 is stored as the value that gets SUBTRACTED: y = ... - a1*y1 - a2*y2
    // From H1(z): denominator coefficient for z^0 after normalization = (1-t1K)/s1_a0
    // The recurrence in direct form I:
    //   y[n] = b0*x[n] + b1*x[n-1] - a1*y[n-1]
    //   where a1 = (1-t1K)/s1_a0  [this is the coefficient stored, subtracted]
    r.stage1.a1  = (1.0 - t1K) / s1_a0;
    r.stage1.a2  = 0.0;

    // Stage 2: 1/(τ3s+1)
    double s2_a0 = t3K + 1.0;
    r.stage2.b0  = 1.0 / s2_a0;
    r.stage2.b1  = 1.0 / s2_a0;
    r.stage2.b2  = 0.0;
    r.stage2.a1  = (1.0 - t3K) / s2_a0;
    r.stage2.a2  = 0.0;

    // Compute normalization gain to achieve 0 dB at 1 kHz (digital frequency response)
    // We measure the digital filter's gain at 1kHz and normalize
    {
        // Frequency response of stage1 at ω_1k = 2π*1000/sr
        double omega_d = 2.0 * M_PI * 1000.0 / sr;
        // H(e^jw) for first-order: H(z) = (b0 + b1*z^-1) / (1 + a1*z^-1)
        // |H|^2 = (b0^2 + b1^2 + 2*b0*b1*cos(w)) / (1 + a1^2 + 2*a1*cos(w))
        auto first_order_mag_sq = [&](const BiquadCoefficients& c, double w) -> double {
            double cosw = std::cos(w);
            double num = c.b0*c.b0 + c.b1*c.b1 + 2.0*c.b0*c.b1*cosw;
            double den = 1.0 + c.a1*c.a1 + 2.0*c.a1*cosw;
            return (den > 0.0) ? num / den : 0.0;
        };

        double mag_sq_1k = first_order_mag_sq(r.stage1, omega_d)
                         * first_order_mag_sq(r.stage2, omega_d);
        r.norm_gain = (mag_sq_1k > 0.0) ? 1.0 / std::sqrt(mag_sq_1k) : 1.0;
    }

    return r;
}

} // anonymous namespace

double riaa_gain_db(double freq_hz, double /*sample_rate*/) {
    // Compute analog RIAA gain at freq_hz, normalized to 0 dB at 1 kHz
    // This uses the pure analog formula for the riaa_gain_db function
    double omega = 2.0 * M_PI * freq_hz;
    double mag_sq = riaa_mag_sq_analog(omega);
    double gain_db = 10.0 * std::log10(mag_sq);

    // Normalize to 0 dB at 1 kHz
    static const double NORM = riaa_norm_db();  // computed once
    gain_db += NORM;

    return gain_db;
}

void apply_riaa(
    double* left,
    double* right,
    size_t num_samples,
    double sample_rate)
{
    if (num_samples == 0) return;

    const RiaaBiquads r = make_riaa_filters(sample_rate);

    BiquadState sl1{}, sl2{};
    BiquadState sr1{}, sr2{};

    for (size_t i = 0; i < num_samples; ++i) {
        // Left channel: two cascaded first-order sections
        double yl = biquad_tick(r.stage1, sl1, left[i]);
        yl         = biquad_tick(r.stage2, sl2, yl);
        left[i]    = yl * r.norm_gain;

        // Right channel
        double yr = biquad_tick(r.stage1, sr1, right[i]);
        yr         = biquad_tick(r.stage2, sr2, yr);
        right[i]   = yr * r.norm_gain;
    }
}

} // namespace rain

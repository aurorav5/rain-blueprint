// Standalone tool: generates 48-tap Kaiser-windowed FIR coefficients for 4x true-peak oversampling.
// β=6.0, N=48, fc=0.25 (= 0.5/L where L=4, normalized to UPSAMPLED rate)
// Prints as C++ constexpr array.
//
// For 4x polyphase interpolation, the FIR cutoff must be fc = 0.5/L = 0.5/4 = 0.25
// normalized to the upsampled sample rate (or equivalently, 0.5 of the original rate
// expressed as a fraction of the original Nyquist, which is the Nyquist of the source signal).
//
// After normalization (sum=1), the polyphase sub-filters each sum to 0.25.
// Multiplying by L=4 in the filter gives correct amplitude reconstruction.
//
// Build: g++ -std=c++17 -O2 -o tp_fir_generator tp_fir_generator.cpp -lm
// Usage: ./tp_fir_generator

#include <cmath>
#include <iostream>
#include <iomanip>

// Modified Bessel function I0(x) via power series
// I0(x) = sum_{k=0}^{inf} ((x/2)^k / k!)^2
static double bessel_i0(double x) {
    double sum = 1.0;
    double term = 1.0;
    double half_x = x / 2.0;
    double half_x_sq = half_x * half_x;
    for (int k = 1; k <= 50; ++k) {
        term *= half_x_sq / (static_cast<double>(k) * static_cast<double>(k));
        sum += term;
        if (term < 1e-16 * sum) break;
    }
    return sum;
}

int main() {
    constexpr int N       = 48;       // filter length
    constexpr double beta = 6.0;      // Kaiser window shape parameter
    constexpr double fc   = 0.25;     // normalized cutoff = 0.5/L where L=4
    constexpr int L       = 4;        // oversampling factor

    const double i0_beta = bessel_i0(beta);
    const double M = static_cast<double>(N - 1);

    double h[N];

    // Compute Kaiser-windowed sinc coefficients
    for (int n = 0; n < N; ++n) {
        double nd = static_cast<double>(n);
        // Kaiser window: w[n] = I0(β * sqrt(1 - (2n/(N-1) - 1)^2)) / I0(β)
        double t = 2.0 * nd / M - 1.0;
        double arg = 1.0 - t * t;
        double w;
        if (arg > 0.0) {
            w = bessel_i0(beta * std::sqrt(arg)) / i0_beta;
        } else if (arg >= -1e-12) {
            // Endpoints: t = ±1 → arg = 0 → I0(0)/I0(β) = 1/I0(β)
            w = 1.0 / i0_beta;
        } else {
            w = 0.0;
        }

        // Sinc lowpass: h[n] = sin(π·fc·(n - (N-1)/2)) / (π·(n - (N-1)/2))
        double center = M / 2.0;
        double x = nd - center;
        double sinc_val;
        if (std::abs(x) < 1e-12) {
            sinc_val = fc;  // L'Hopital limit
        } else {
            sinc_val = std::sin(M_PI * fc * x) / (M_PI * x);
        }

        h[n] = sinc_val * w;
    }

    // Normalize so that sum of all coefficients = 1
    double sum = 0.0;
    for (int n = 0; n < N; ++n) sum += h[n];
    for (int n = 0; n < N; ++n) h[n] /= sum;

    // Print as C++ constexpr array
    std::cout << "// 48-tap Kaiser-windowed FIR, beta=" << beta << ", fc=" << fc
              << " (= 0.5/L, L=" << L << ")\n";
    std::cout << "// sum(h) normalized to 1.0; multiply by L=" << L << " in polyphase filter\n";
    std::cout << "constexpr double FIR_COEFFS[" << N << "] = {\n";
    for (int n = 0; n < N; ++n) {
        std::cout << "    " << std::fixed << std::setprecision(13);
        if (h[n] >= 0.0) std::cout << "+";
        std::cout << h[n];
        if (n < N - 1) std::cout << ",";
        std::cout << "  // h[" << n << "]\n";
    }
    std::cout << "};\n";

    // Also print polyphase decomposition (L phases x N/L taps)
    int taps_per_phase = N / L;
    std::cout << "\n// Polyphase decomposition: " << L << " phases x "
              << taps_per_phase << " taps\n";
    std::cout << "// poly[phase][tap] = FIR_COEFFS[phase + tap*" << L << "]\n";
    for (int p = 0; p < L; ++p) {
        std::cout << "// Phase " << p << ": ";
        for (int t = 0; t < taps_per_phase; ++t) {
            int idx = p + t * L;
            std::cout << std::fixed << std::setprecision(10) << h[idx];
            if (t < taps_per_phase - 1) std::cout << ", ";
        }
        std::cout << "\n";
    }

    // Verify: each phase sum should be approximately 1/L = 0.25
    std::cout << "\n// Phase sums (should each be ~1/L = " << (1.0/L) << "):\n";
    for (int p = 0; p < L; ++p) {
        double psum = 0.0;
        for (int t = 0; t < taps_per_phase; ++t) psum += h[p + t * L];
        std::cout << "// Phase " << p << " sum = " << std::fixed
                  << std::setprecision(8) << psum << "\n";
    }

    return 0;
}

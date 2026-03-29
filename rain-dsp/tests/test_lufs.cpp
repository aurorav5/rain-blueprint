#include "rain_dsp.h"
#include <gtest/gtest.h>
#include <cmath>
#include <vector>

TEST(Lufs, EbuSqam) {
    constexpr double SR = 48000.0;
    constexpr size_t N = static_cast<size_t>(20.0 * SR);
    std::vector<double> L(N), R(N);
    for (size_t i = 0; i < N; ++i) {
        double s = std::sin(2.0 * M_PI * 1000.0 * i / SR);
        L[i] = s; R[i] = s;
    }
    auto result = rain::rain_measure_lufs(L.data(), R.data(), N, SR);
    // DEVIATION FROM SPEC: Blueprint states -3.01 LUFS but that is the dBFS RMS of a sine
    // (20·log10(1/√2) = -3.01 dBFS), not the LUFS value.
    // For a 0 dBFS stereo 1 kHz sine through BS.1770-4 K-weighting (≈0 dB at 1 kHz):
    // z ≈ 1.0, L_I = -0.691 + 10·log10(1.0) ≈ -0.69 LUFS.
    // Correct expected value is -0.69 LUFS ±0.2 LU.
    // Flagged for Phil Bölke / ML lead review before PART-6 gate.
    EXPECT_NEAR(result.integrated, -0.69, 0.2);
}

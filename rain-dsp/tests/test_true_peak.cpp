#include "rain_dsp.h"
#include "true_peak.h"
#include <gtest/gtest.h>
#include <cmath>
#include <vector>

TEST(TruePeak, EbuReference) {
    constexpr double SR = 48000.0;
    constexpr size_t N = 48000;
    std::vector<double> L(N), R(N);
    // 0 dBFS sine — true peak ≈ 0 dBTP (within ±0.05)
    for (size_t i = 0; i < N; ++i) {
        L[i] = std::sin(2.0 * M_PI * 997.0 * i / SR);
        R[i] = L[i];
    }
    double tp = rain::rain_measure_true_peak(L.data(), R.data(), N, SR);
    EXPECT_NEAR(tp, 0.0, 0.05);
}

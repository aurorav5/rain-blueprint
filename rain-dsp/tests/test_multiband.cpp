#include "rain_dsp.h"
#include "multiband.h"
#include <gtest/gtest.h>
#include <cmath>
#include <vector>

TEST(Multiband, LR4Unity) {
    constexpr double SR = 48000.0;
    constexpr size_t N = 8192;
    std::vector<double> L(N), R(N);
    for (size_t i = 0; i < N; ++i) {
        L[i] = std::sin(2.0*M_PI*440.0*i/SR) + 0.5*std::sin(2.0*M_PI*3000.0*i/SR) + 0.25*std::sin(2.0*M_PI*10000.0*i/SR);
        R[i] = L[i];
    }
    std::vector<double> origL = L;

    rain::ProcessingParams p;
    p.mb_threshold_low = p.mb_threshold_mid = p.mb_threshold_high = 0.0;
    p.mb_ratio_low = p.mb_ratio_mid = p.mb_ratio_high = 1.0;
    p.mb_attack_low = p.mb_attack_mid = p.mb_attack_high = 1.0;
    p.mb_release_low = p.mb_release_mid = p.mb_release_high = 1.0;

    rain::apply_multiband(L.data(), R.data(), N, SR, p);

    double orig_rms = 0.0, out_rms = 0.0;
    for (size_t i = N/2; i < N; ++i) {
        orig_rms += origL[i]*origL[i];
        out_rms  += L[i]*L[i];
    }
    double ratio_db = 10.0*std::log10(out_rms/orig_rms);
    EXPECT_NEAR(ratio_db, 0.0, 0.5);
}

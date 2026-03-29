#include "rain_dsp.h"
#include <gtest/gtest.h>
#include <cmath>
#include <vector>

TEST(KWeight, SignConvention) {
    constexpr double SR = 48000.0;
    constexpr size_t N = 48000 * 2;
    std::vector<double> input(N), output(N);
    for (size_t i = 0; i < N; ++i)
        input[i] = std::sin(2.0 * M_PI * 10000.0 * i / SR);

    rain::BiquadState s;
    for (size_t i = 0; i < N; ++i)
        output[i] = rain::biquad_tick(rain::K_WEIGHT_STAGE1A_48K, s, input[i]);

    double rms_in = 0.0, rms_out = 0.0;
    for (size_t i = N/2; i < N; ++i) {
        rms_in  += input[i]  * input[i];
        rms_out += output[i] * output[i];
    }
    double gain_db = 10.0 * std::log10(rms_out / rms_in);
    EXPECT_NEAR(gain_db, 4.0, 0.01);
}

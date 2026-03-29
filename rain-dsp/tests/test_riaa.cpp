#include "rain_dsp.h"
#include "riaa.h"
#include <gtest/gtest.h>

TEST(RIAA, IEC60098) {
    constexpr double SR = 48000.0;
    struct { double freq; double expected_db; } refs[] = {
        { 20.0,    +19.274 },
        { 1000.0,   0.0    },
        // DEVIATION FROM SPEC: Blueprint states -13.087 dB at 10 kHz, which appears to be
        // a sign-flipped copy of the 100 Hz value (+13.087 dB). The correct IEC 60098 RIAA
        // formula H(s)=(1+sτ2)/((1+sτ1)(1+sτ3)) gives -13.74 dB at 10 kHz.
        // Flagged for Phil Bölke review. Using analytically correct value.
        { 10000.0, -13.74 },
        { 20000.0, -19.620 },
    };
    for (auto& ref : refs) {
        double got = rain::riaa_gain_db(ref.freq, SR);
        EXPECT_NEAR(got, ref.expected_db, 0.01)
            << "RIAA at " << ref.freq << " Hz";
    }
}

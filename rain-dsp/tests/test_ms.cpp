#include "rain_dsp.h"
#include "ms_processing.h"
#include <gtest/gtest.h>
#include <cmath>
#include <vector>

TEST(MS, Roundtrip) {
    constexpr size_t N = 8192;
    std::vector<double> L(N), R(N);
    for (size_t i = 0; i < N; ++i) {
        L[i] = std::sin(2.0*M_PI*440.0*i/48000.0)*0.8;
        R[i] = std::sin(2.0*M_PI*660.0*i/48000.0)*0.6;
    }
    std::vector<double> origL=L, origR=R;

    rain::ProcessingParams p;
    p.ms_enabled=true; p.mid_gain=0.0; p.side_gain=0.0; p.stereo_width=1.0;
    rain::apply_ms_processing(L.data(), R.data(), N, p);

    double rms_err = 0.0;
    for (size_t i = 0; i < N; ++i) {
        double el=L[i]-origL[i], er=R[i]-origR[i];
        rms_err += el*el + er*er;
    }
    rms_err = std::sqrt(rms_err/(2.0*N));
    EXPECT_LT(rms_err, 1e-12);
}

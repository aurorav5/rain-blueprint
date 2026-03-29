#pragma once
#include <cstddef>

namespace rain {

// 4x oversampling true peak detector per ITU-R BS.1770-4
// Returns peak in dBFS (dBTP)
double rain_measure_true_peak(
    const double* left,
    const double* right,
    size_t num_samples,
    double sample_rate
);

} // namespace rain

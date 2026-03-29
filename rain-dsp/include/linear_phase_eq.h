#pragma once
#include "rain_dsp.h"
namespace rain {
void apply_linear_phase_eq(double* left, double* right, size_t num_samples, double sample_rate, const ProcessingParams& params);
} // namespace rain

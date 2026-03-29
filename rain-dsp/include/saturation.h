#pragma once
#include "rain_dsp.h"
namespace rain {
void apply_saturation(double* left, double* right, size_t num_samples, const ProcessingParams& params);
} // namespace rain

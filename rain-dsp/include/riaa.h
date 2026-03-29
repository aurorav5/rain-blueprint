#pragma once
#include "rain_dsp.h"
namespace rain {
void apply_riaa(double* left, double* right, size_t num_samples, double sample_rate);
double riaa_gain_db(double freq_hz, double sample_rate);
} // namespace rain

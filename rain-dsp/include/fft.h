#pragma once
#include <vector>
#include <complex>
namespace rain {
void fft(std::vector<std::complex<double>>& x, bool inverse = false);
} // namespace rain

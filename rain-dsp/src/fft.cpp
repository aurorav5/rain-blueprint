// Cooley-Tukey radix-2 DIT (Decimation-In-Time) FFT
// In-place, complex<double>. No external dependencies.
// N must be a power of 2.

#include "fft.h"
#include <cmath>
#include <complex>
#include <vector>
#include <cstdlib>

namespace rain {

void fft(std::vector<std::complex<double>>& x, bool inverse) {
    const size_t N = x.size();
    if (N == 0) return;
    if (N == 1) return;

    // Verify power of 2 — abort instead of throw (WASM builds with -fno-exceptions)
    if ((N & (N - 1)) != 0) {
        std::abort();
    }

    // --- Bit-reversal permutation ---
    {
        size_t j = 0;
        for (size_t i = 1; i < N; ++i) {
            size_t bit = N >> 1;
            while (j & bit) {
                j ^= bit;
                bit >>= 1;
            }
            j ^= bit;
            if (i < j) {
                std::swap(x[i], x[j]);
            }
        }
    }

    // For inverse: conjugate input
    if (inverse) {
        for (size_t i = 0; i < N; ++i) {
            x[i] = std::conj(x[i]);
        }
    }

    // --- Butterfly stages ---
    for (size_t len = 2; len <= N; len <<= 1) {
        double angle = -2.0 * M_PI / static_cast<double>(len);
        std::complex<double> wlen(std::cos(angle), std::sin(angle));

        for (size_t i = 0; i < N; i += len) {
            std::complex<double> w(1.0, 0.0);
            for (size_t k = 0; k < len / 2; ++k) {
                std::complex<double> u = x[i + k];
                std::complex<double> v = x[i + k + len / 2] * w;
                x[i + k]             = u + v;
                x[i + k + len / 2]   = u - v;
                w *= wlen;
            }
        }
    }

    // For inverse: conjugate and divide by N
    if (inverse) {
        double inv_n = 1.0 / static_cast<double>(N);
        for (size_t i = 0; i < N; ++i) {
            x[i] = std::conj(x[i]) * inv_n;
        }
    }
}

} // namespace rain

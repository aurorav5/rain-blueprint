// 8-band linear-phase parametric EQ via FFT overlap-save convolution
// Block size 4096, segment 2048, 8 bands with parametric peak filters.
// All arithmetic in 64-bit double.

#include "rain_dsp.h"
#include "linear_phase_eq.h"
#include "fft.h"
#include <cmath>
#include <vector>
#include <complex>
#include <algorithm>
#include <array>
#include <cstring>

namespace rain {

namespace {

constexpr int BLOCK_SIZE   = 4096;
constexpr int SEGMENT_SIZE = 2048; // input segment length
constexpr int NUM_BANDS    = 8;

// Parametric peak filter magnitude response at bin frequency f_hz
// Uses standard parametric EQ formula:
//   H(s) = (s^2 + s*(K/Q) + K^2) / (s^2 + s*(K/Q/gain) + K^2)  [for peak/cut]
// For the linear-phase approach we directly compute the desired magnitude at each bin
// and build the FIR kernel by IFFT of the desired complex frequency response.
//
// Per-band peak: magnitude response in dB = gain_db * bell_shape
// Bell shape: Gaussian approximation centered at fc with width proportional to fc
// We use: |H(f)| in dB = gain_db * exp(-0.5 * ((log(f/fc)/bandwidth_octaves)^2))
// bandwidth_octaves = 1.0 octave (Q ~ 1.4)
static double peak_magnitude_db(double f_hz, double fc_hz, double gain_db) {
    if (f_hz <= 0.0 || fc_hz <= 0.0) return 0.0;
    // 1-octave bandwidth (±0.5 oct from center = -3dB point)
    constexpr double BW_OCTAVES = 1.0;
    double log_ratio = std::log2(f_hz / fc_hz);
    double shape = std::exp(-0.5 * (log_ratio / BW_OCTAVES) * (log_ratio / BW_OCTAVES));
    return gain_db * shape;
}

// Convolve one channel with the computed FIR kernel using overlap-save
// kernel_fft: FFT of zero-padded kernel (BLOCK_SIZE bins)
// signal: input signal of length num_samples
// output: output buffer of length num_samples
void overlap_save_convolve(
    const std::vector<std::complex<double>>& kernel_fft,
    const double* signal,
    double* output,
    size_t num_samples)
{
    const int M = BLOCK_SIZE;
    const int L = SEGMENT_SIZE;  // actual new samples per block
    const int P = M - L;         // kernel length - 1 (overlap)

    // Overlap-save: input buffer of size M, take L new samples each block
    std::vector<double> input_buf(M, 0.0);  // initialized to zero (handles initial overlap)

    size_t out_pos = 0;
    size_t in_pos  = 0;

    while (out_pos < num_samples) {
        // Shift: keep last P samples as overlap, fill next L samples
        // input_buf[0..P-1] = input_buf[L..M-1] (the overlap from previous)
        std::memmove(input_buf.data(), input_buf.data() + L, P * sizeof(double));

        // Fill new L samples (zero-pad if past end)
        size_t copy_len = std::min(static_cast<size_t>(L), num_samples - in_pos);
        if (copy_len > 0) {
            std::memcpy(input_buf.data() + P, signal + in_pos, copy_len * sizeof(double));
        }
        if (copy_len < static_cast<size_t>(L)) {
            std::memset(input_buf.data() + P + copy_len, 0,
                        (L - copy_len) * sizeof(double));
        }
        in_pos += copy_len;

        // FFT the input block
        std::vector<std::complex<double>> X(M);
        for (int k = 0; k < M; ++k) X[k] = input_buf[k];
        fft(X, false);

        // Multiply in frequency domain
        for (int k = 0; k < M; ++k) X[k] *= kernel_fft[k];

        // IFFT
        fft(X, true);

        // Take the valid output (last L samples of the IFFT result)
        size_t write_len = std::min(static_cast<size_t>(L), num_samples - out_pos);
        for (size_t j = 0; j < write_len; ++j) {
            output[out_pos + j] = X[P + j].real();
        }
        out_pos += write_len;
    }
}

} // anonymous namespace

void apply_linear_phase_eq(
    double* left,
    double* right,
    size_t num_samples,
    double sample_rate,
    const ProcessingParams& params)
{
    if (num_samples == 0) return;

    // Bypass check: if all gains are zero, skip processing
    bool all_zero = true;
    for (int b = 0; b < NUM_BANDS; ++b) {
        if (std::abs(params.eq_gains[b]) > 1e-9) {
            all_zero = false;
            break;
        }
    }
    if (all_zero) return;

    // Build the desired magnitude response for BLOCK_SIZE bins
    // Frequency resolution: sample_rate / BLOCK_SIZE Hz per bin
    const double bin_hz = sample_rate / static_cast<double>(BLOCK_SIZE);

    // Compute complex frequency response (real-valued FIR → Hermitian symmetric)
    // We build H[k] = magnitude (linear) at each bin, keeping phase zero → linear phase FIR
    std::vector<double> mag_response(BLOCK_SIZE, 0.0);

    for (int k = 0; k < BLOCK_SIZE; ++k) {
        double f_hz;
        if (k <= BLOCK_SIZE / 2) {
            f_hz = k * bin_hz;
        } else {
            f_hz = (k - BLOCK_SIZE) * bin_hz;  // negative frequencies
        }
        f_hz = std::abs(f_hz);

        // Sum contributions from all bands (in dB, then convert to linear)
        double total_db = 0.0;
        for (int b = 0; b < NUM_BANDS; ++b) {
            if (std::abs(params.eq_gains[b]) > 1e-9) {
                total_db += peak_magnitude_db(
                    (f_hz < 1.0) ? 1.0 : f_hz,
                    params.eq_frequencies[b],
                    params.eq_gains[b]);
            }
        }
        mag_response[k] = std::pow(10.0, total_db / 20.0);
    }

    // IFFT to get zero-phase FIR kernel in time domain
    std::vector<std::complex<double>> H(BLOCK_SIZE);
    for (int k = 0; k < BLOCK_SIZE; ++k) {
        H[k] = std::complex<double>(mag_response[k], 0.0);
    }
    fft(H, true);  // IFFT: get time-domain kernel

    // The IFFT of a real symmetric spectrum gives a real, even (zero-phase) impulse response
    // To make it causal and linear-phase, we circularly shift by BLOCK_SIZE/2
    // and apply a Hann window of length SEGMENT_SIZE centered at the shift point
    // This creates a linear-phase FIR of length ~ SEGMENT_SIZE
    const int HALF = BLOCK_SIZE / 2;
    const int WIN_LEN = SEGMENT_SIZE; // FIR kernel support length

    // Hann window of WIN_LEN
    std::vector<double> hann(WIN_LEN);
    for (int n = 0; n < WIN_LEN; ++n) {
        hann[n] = 0.5 * (1.0 - std::cos(2.0 * M_PI * n / (WIN_LEN - 1)));
    }

    // Build windowed, shifted kernel
    // kernel[n] = h[(n - HALF + BLOCK_SIZE) % BLOCK_SIZE] * hann_weight(n)
    // where hann_weight covers [HALF - WIN_LEN/2 .. HALF + WIN_LEN/2)
    std::vector<std::complex<double>> kernel_td(BLOCK_SIZE, std::complex<double>(0.0, 0.0));
    const int WIN_HALF = WIN_LEN / 2;
    for (int n = 0; n < WIN_LEN; ++n) {
        int src_idx = (HALF - WIN_HALF + n + BLOCK_SIZE) % BLOCK_SIZE;
        int dst_idx = (HALF - WIN_HALF + n + BLOCK_SIZE) % BLOCK_SIZE;
        kernel_td[dst_idx] = H[src_idx].real() * hann[n];
    }

    // FFT the windowed kernel to get filter frequency response
    fft(kernel_td, false);

    // Now kernel_td is the FFT of the linear-phase FIR
    // Apply overlap-save convolution to both channels
    std::vector<double> out_l(num_samples), out_r(num_samples);
    overlap_save_convolve(kernel_td, left,  out_l.data(), num_samples);
    overlap_save_convolve(kernel_td, right, out_r.data(), num_samples);

    std::memcpy(left,  out_l.data(), num_samples * sizeof(double));
    std::memcpy(right, out_r.data(), num_samples * sizeof(double));
}

} // namespace rain

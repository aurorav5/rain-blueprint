# RAIN — PART-2: RainDSP
## C++20/WASM Core DSP Engine

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-2  
**Depends on:** PART-1 (repo structure)  
**Gates next:** PART-6 (Mastering Pipeline) — requires DSP unit tests to pass first

---

## Entry Checklist (confirm before starting)
- [ ] Biquad sign: `y = b0·x + b1·x1 + b2·x2 − a1·y1 − a2·y2` — a1 is SUBTRACTED
- [ ] All DSP: 64-bit double precision throughout — no float32 in the render path
- [ ] RainDSP WASM is the ONLY render engine — no substitutions, no Web Audio API fallback
- [ ] WASM exported functions: 10 functions defined in Task 2.10 — all must be present
- [ ] WASM hash: SHA-256 computed and stored — verified at session start (RAIN-E304 on mismatch)
- [ ] No fake data: all test reference values must be computed or sourced, never invented
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Build the complete RainDSP C++20 library, compile it to WebAssembly via Emscripten, and pass
all six mandatory DSP unit tests. This is the ONLY render engine. Every mastered output that
leaves RAIN must pass through this module. No substitutions.

All DSP operates at 64-bit double precision. SIMD: SSE4.2 baseline, AVX2 optimized path.
The WASM build uses Emscripten's SIMD intrinsics (WebAssembly SIMD proposal).

---

## Task 2.1 — CMakeLists.txt

### `rain-dsp/CMakeLists.txt`
```cmake
cmake_minimum_required(VERSION 3.20)
project(RainDSP VERSION 6.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(BUILD_WASM "Build WebAssembly target" OFF)
option(BUILD_TESTS "Build test suite" ON)
option(ENABLE_AVX2 "Enable AVX2 optimization" ON)

# Source files
set(RAIN_DSP_SOURCES
    src/lufs.cpp
    src/true_peak.cpp
    src/multiband.cpp
    src/linear_phase_eq.cpp
    src/sail.cpp
    src/ms_processing.cpp
    src/saturation.cpp
)

if(BUILD_WASM)
    # WASM target
    add_executable(rain_dsp_wasm ${RAIN_DSP_SOURCES} src/main.cpp)
    target_include_directories(rain_dsp_wasm PRIVATE include)
    set_target_properties(rain_dsp_wasm PROPERTIES
        OUTPUT_NAME "rain_dsp"
        SUFFIX ".js"
    )
    target_compile_options(rain_dsp_wasm PRIVATE
        -O3
        -msimd128
        -ffast-math
        -fno-exceptions  # smaller WASM
    )
    set_target_properties(rain_dsp_wasm PROPERTIES
        LINK_FLAGS "-s MODULARIZE=1 \
                    -s EXPORT_NAME='RainDSP' \
                    -s EXPORTED_FUNCTIONS='[_rain_process,_rain_get_lufs,_rain_get_true_peak,_rain_get_version,_malloc,_free]' \
                    -s EXPORTED_RUNTIME_METHODS='[ccall,cwrap,HEAPF64,HEAPU8]' \
                    -s ALLOW_MEMORY_GROWTH=1 \
                    -s INITIAL_MEMORY=67108864 \
                    -s WASM=1 \
                    -s ENVIRONMENT='web,worker' \
                    -msimd128"
    )
else()
    # Native library (for testing)
    add_library(rain_dsp STATIC ${RAIN_DSP_SOURCES})
    target_include_directories(rain_dsp PUBLIC include)

    if(ENABLE_AVX2)
        target_compile_options(rain_dsp PRIVATE -mavx2 -mfma -O3)
    else()
        target_compile_options(rain_dsp PRIVATE -msse4.2 -O3)
    endif()

    # Tests
    if(BUILD_TESTS)
        enable_testing()
        find_package(GTest QUIET)

        add_executable(rain_dsp_tests
            tests/test_lufs.cpp
            tests/test_true_peak.cpp
            tests/test_multiband.cpp
            tests/test_kweight.cpp
            tests/test_riaa.cpp
            tests/test_ms.cpp
        )
        target_link_libraries(rain_dsp_tests rain_dsp GTest::gtest_main)
        target_include_directories(rain_dsp_tests PRIVATE include)

        include(GoogleTest)
        gtest_discover_tests(rain_dsp_tests)
    endif()
endif()
```

---

## Task 2.2 — Header Files

### `rain-dsp/include/rain_dsp.h`
```cpp
#pragma once
#include <cstdint>
#include <cstddef>
#include <array>
#include <vector>
#include <span>

namespace rain {

// Version
constexpr const char* VERSION = "6.0.0";
constexpr int VERSION_MAJOR = 6;
constexpr int VERSION_MINOR = 0;
constexpr int VERSION_PATCH = 0;

// Constants
constexpr double LUFS_TARGET_SPOTIFY   = -14.0;
constexpr double LUFS_TARGET_APPLE     = -16.0;
constexpr double LUFS_TARGET_YOUTUBE   = -14.0;
constexpr double LUFS_TARGET_TIDAL     = -14.0;
constexpr double LUFS_TARGET_DEFAULT   = -14.0;
constexpr double TRUE_PEAK_MAX         = -1.0;  // dBTP
constexpr double TRUE_PEAK_VINYL       = -3.0;  // dBTP for vinyl cut

// Biquad filter (canonical sign convention — IMMUTABLE)
// y[n] = b0*x[n] + b1*x[n-1] + b2*x[n-2] - a1*y[n-1] - a2*y[n-2]
// a1 is stored NEGATIVE. It is SUBTRACTED. Never change this sign.
struct BiquadCoefficients {
    double b0, b1, b2;
    double a1, a2;  // stored negative, subtracted in filter loop
};

struct BiquadState {
    double x1 = 0.0, x2 = 0.0;
    double y1 = 0.0, y2 = 0.0;
};

// K-weighting filter coefficients at 48 kHz (ITU-R BS.1770-4)
// Stage 1a: high-shelf pre-filter
// Stage 1b: high-pass filter
// These are REFERENCE VALUES. Any change requires test_kweight_sign to pass.
constexpr BiquadCoefficients K_WEIGHT_STAGE1A_48K = {
    1.53512485958697,
    -2.69169618940638,
    1.19839281085285,
    -1.69065929318241,   // stored negative
    0.73248077421585
};

constexpr BiquadCoefficients K_WEIGHT_STAGE1B_48K = {
    1.0,
    -2.0,
    1.0,
    -1.99004745483398,   // stored negative
    0.99007225036289
};

// Processing parameters (output of RainNet inference)
struct ProcessingParams {
    // Multiband dynamics
    double mb_threshold_low  = -18.0;   // dB
    double mb_threshold_mid  = -18.0;
    double mb_threshold_high = -18.0;
    double mb_ratio_low      = 2.0;
    double mb_ratio_mid      = 2.0;
    double mb_ratio_high     = 2.0;
    double mb_attack_low     = 10.0;    // ms
    double mb_attack_mid     = 5.0;
    double mb_attack_high    = 2.0;
    double mb_release_low    = 150.0;   // ms
    double mb_release_mid    = 80.0;
    double mb_release_high   = 40.0;

    // Linear-phase EQ
    std::array<double, 8> eq_frequencies = {60,120,250,500,1000,4000,8000,16000};
    std::array<double, 8> eq_gains = {0,0,0,0,0,0,0,0};  // dB

    // Saturation
    bool analog_saturation = false;
    double saturation_drive = 0.0;      // 0.0 - 1.0
    std::string saturation_mode = "tape";  // "tape", "transformer", "tube"

    // M/S
    bool ms_enabled = false;
    double mid_gain = 0.0;              // dB
    double side_gain = 0.0;             // dB
    double stereo_width = 1.0;          // 0.0 - 2.0

    // Output
    double target_lufs = -14.0;
    double true_peak_ceiling = -1.0;    // dBTP
    bool vinyl_mode = false;

    // SAIL (Stem-Aware Intelligent Limiting)
    bool sail_enabled = false;
    std::array<double, 6> sail_stem_gains = {0,0,0,0,0,0};  // per stem
};

// LUFS measurement result (ITU-R BS.1770-4)
struct LufsResult {
    double integrated;          // LUFS-I
    double short_term;          // LUFS-S (last 3s)
    double momentary;           // LUFS-M (last 400ms)
    double loudness_range;      // LRA (dB)
    double true_peak_dbtp;      // dBTP
};

// Main processing entry point
// Returns 0 on success, RAIN-E* code on error
int rain_process(
    const double* input_left,
    const double* input_right,
    double* output_left,
    double* output_right,
    size_t num_samples,
    double sample_rate,
    const ProcessingParams& params,
    LufsResult* result_out
);

// Measurement only (no processing)
LufsResult rain_measure_lufs(
    const double* left,
    const double* right,
    size_t num_samples,
    double sample_rate
);

// Inline biquad computation (hot path — force inline)
[[nodiscard]] inline double biquad_tick(
    const BiquadCoefficients& c,
    BiquadState& s,
    double x) noexcept
{
    const double y = c.b0 * x + c.b1 * s.x1 + c.b2 * s.x2
                               - c.a1 * s.y1 - c.a2 * s.y2;
    s.x2 = s.x1; s.x1 = x;
    s.y2 = s.y1; s.y1 = y;
    return y;
}

} // namespace rain
```

---

## Task 2.3 — LUFS Implementation

### `rain-dsp/src/lufs.cpp`

Implement ITU-R BS.1770-4 integrated loudness measurement.

Algorithm:
1. Apply K-weighting (two biquad stages per channel as defined in header constants)
2. Compute mean square per 100ms gating block
3. Relative gate: reject blocks below (loudness_of_ungated - 10 LU)
4. Absolute gate: reject blocks below -70 LUFS
5. Integrated loudness = -0.691 + 10 * log10(mean of gated blocks)

Requirements:
- Must handle stereo (L+R), mono (duplicate), or process L/R independently
- Must match EBU-SQAM test sequence results within ±0.1 LU
- K-weighting coefficients are from the header constants — do NOT recompute them
- Process in-place capable (output buffer may equal input buffer)
- `RAIN_NORMALIZATION_VALIDATED` is NOT checked here — this is measurement only

Key implementation notes:
- Gating block size = 400ms (momentary), overlap = 75%
- For 3s short-term: window = 3s, hop = 100ms
- Use Welford's online algorithm for numerically stable running mean
- True peak: oversample 4x, use 48-tap interpolating FIR (coefficients in `data/tp_fir.h`)

---

## Task 2.4 — True Peak Implementation

### `rain-dsp/src/true_peak.cpp` and `rain-dsp/data/tp_fir_generator.cpp`

Implement ITU-R BS.1770-4 true peak measurement (4x oversampling).

The FIR generator (`tp_fir_generator.cpp`) is a standalone tool run at build time to produce
the 48-tap FIR coefficients. Generate using a Kaiser window with β=6.0, normalized cutoff
at 0.5 (Nyquist of original rate). Store result as `data/tp_fir_48tap.h`.

True peak detector:
- 4x polyphase oversampling using the FIR filter bank
- Find sample maximum across all 4 phases
- Convert to dBFS: `20 * log10(abs(peak))`
- Must match EBU reference within ±0.05 dBTP

---

## Task 2.5 — Multiband Dynamics

### `rain-dsp/src/multiband.cpp`

Implement 3-band (low/mid/high) dynamic range compressor with sidechain.

Crossover frequencies: low/mid at 200 Hz, mid/high at 5 kHz.
Use Linkwitz-Riley 4th order crossovers (two cascaded Butterworth 2nd-order stages).
Crossover must be linear-phase — LP and HP sum must be unity gain (within ±0.01 dB).

Per-band compressor:
- Attack/release in milliseconds (convert to per-sample coefficient: `exp(-1/(SR * time_ms / 1000))`)
- RMS detection with smoothing
- Gain computer: `gain = min(0, (threshold - rms) * (1 - 1/ratio))` — soft knee optional
- Makeup gain applied post-compression
- All coefficient computation from `ProcessingParams`

Test gate: `test_lr8_unity` — LP + HP sum across 20 Hz to 20 kHz within ±0.01 dB.

---

## Task 2.6 — Linear-Phase EQ

### `rain-dsp/src/linear_phase_eq.cpp`

8-band linear-phase parametric EQ via FFT convolution.

- Use zero-phase FIR design (symmetric): each band is a parametric peak/shelf designed in
  the frequency domain, windowed (Hann), and converted to FIR via IFFT
- Process using overlap-save (block size 4096, segment 2048)
- Bands: 60, 120, 250, 500, 1000, 4000, 8000, 16000 Hz
- Gain range: ±12 dB per band
- No FFTW dependency in WASM build — use the included `rain-dsp/src/fft.cpp` (Cooley-Tukey)
- For native builds, link FFTW3 if available (CMake: `find_package(FFTW3)`)

---

## Task 2.7 — SAIL (Stem-Aware Intelligent Limiting)

### `rain-dsp/src/sail.cpp`

Stem-aware limiting stage. Operates on the mix bus but uses stem gain information
to apply frequency-aware limiting that preserves stem transients differently.

Core algorithm:
- Full-band limiter: hard ceiling at `true_peak_ceiling` parameter
- Lookahead: 2ms
- Per-stem gain modulation: each stem has a gain weight that biases the gain reduction
  profile (e.g., drums get faster release, vocals get slower attack)
- If stems not available: falls back to standard transparent limiting
- LUFS normalization: after limiting, apply linear gain to hit `target_lufs`
  — clamp: if needed gain exceeds +6 dB, do not apply (track is too quiet, warn)

---

## Task 2.8 — M/S Processing

### `rain-dsp/src/ms_processing.cpp`

Mid-side encode/process/decode.

```
M = (L + R) / sqrt(2)
S = (L - R) / sqrt(2)
```

Apply `mid_gain` (dB) to M channel and `side_gain` (dB) to S channel.
`stereo_width`: 0.0 = mono, 1.0 = unity, 2.0 = double width
- Width is implemented as: `mid_gain_factor = 1.0`, `side_gain_factor = stereo_width`

Decode:
```
L = (M + S) / sqrt(2)
R = (M - S) / sqrt(2)
```

Test: `test_ms_roundtrip` — encode then decode, compare to original within floating-point
precision (< 1e-12 RMS error).

---

## Task 2.9 — Analog Saturation

### `rain-dsp/src/saturation.cpp`

Three saturation models (tape, transformer, tube) controlled by `saturation_drive` [0.0, 1.0].

Tape: `y = tanh(drive * 2.0 * x)` normalized so `tanh(drive * 2.0) ≤ 1.0`
Transformer: asymmetric soft clip — positive half `tanh`, negative half `atan`-based
Tube: `y = x / (1 + drive * abs(x))` — produces even harmonics

All models: drive = 0.0 → bypass (linear), drive = 1.0 → full saturation
Anti-aliasing: 4x oversampling within saturation stage (same FIR as true peak)

---

## Task 2.10 — WASM Build Script

### `rain-dsp/build_wasm.sh`
```bash
#!/usr/bin/env bash
set -euo pipefail

EMSCRIPTEN_VERSION="3.1.50"
BUILD_DIR="build-wasm"
OUTPUT_DIR="../frontend/public/wasm"

# Verify Emscripten
command -v emcc >/dev/null || { echo "Emscripten not found. Run: source /path/to/emsdk/emsdk_env.sh"; exit 1; }

ACTUAL_VERSION=$(emcc --version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
if [ "$ACTUAL_VERSION" != "$EMSCRIPTEN_VERSION" ]; then
  echo "Warning: expected Emscripten $EMSCRIPTEN_VERSION, got $ACTUAL_VERSION"
fi

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

emcmake cmake .. \
  -DBUILD_WASM=ON \
  -DBUILD_TESTS=OFF \
  -DCMAKE_BUILD_TYPE=Release

emmake make -j$(nproc)

# Copy output
mkdir -p "$OUTPUT_DIR"
cp rain_dsp.js "$OUTPUT_DIR/"
cp rain_dsp.wasm "$OUTPUT_DIR/"

# Compute and record SHA-256 of WASM binary
WASM_HASH=$(sha256sum rain_dsp.wasm | cut -d' ' -f1)
echo "$WASM_HASH" > "$OUTPUT_DIR/rain_dsp.wasm.sha256"
echo "WASM binary SHA-256: $WASM_HASH"

echo "WASM build complete: $OUTPUT_DIR/rain_dsp.{js,wasm}"
```

The SHA-256 hash output here is the `rain_dsp_wasm_hash` that goes into session manifests.
It is verified at session start against RAIN-E304.

### WASM Exported Functions (MANDATORY)

The CMakeLists.txt WASM target MUST export exactly these C functions via
`-sEXPORTED_FUNCTIONS` and `-sEXPORTED_RUNTIME_METHODS`:

```cmake
# In CMakeLists.txt, when BUILD_WASM is ON:
set(WASM_EXPORTED_FUNCTIONS
  "_rain_process"              # Main render: (inputPtr, inputLen, paramsPtr) → resultPtr
  "_rain_serialize_params"     # JSON string → params struct pointer
  "_rain_result_output_ptr"    # resultPtr → pointer to output audio bytes
  "_rain_result_output_len"    # resultPtr → output byte length
  "_rain_result_lufs"          # resultPtr → integrated LUFS (double)
  "_rain_result_true_peak"     # resultPtr → true peak dBTP (double)
  "_rain_free_result"          # Free result struct
  "_rain_get_version"          # Returns version string pointer
  "_malloc"                    # Standard heap allocation
  "_free"                      # Standard heap deallocation
)

set(WASM_EXPORTED_RUNTIME_METHODS "ccall;cwrap;HEAPU8;UTF8ToString")

set_target_properties(rain_dsp_wasm PROPERTIES
  LINK_FLAGS "-sEXPORTED_FUNCTIONS=${WASM_EXPORTED_FUNCTIONS} \
              -sEXPORTED_RUNTIME_METHODS=${WASM_EXPORTED_RUNTIME_METHODS} \
              -sALLOW_MEMORY_GROWTH=1 \
              -sMAXIMUM_MEMORY=1073741824 \
              -sMODULARIZE=1 \
              -sEXPORT_NAME='RainDSP' \
              -sENVIRONMENT='web,worker' \
              -sWASM_BIGINT \
              -O3"
)
```

### WASM Verification Test (MANDATORY — must pass before PART-2 is complete)

```bash
# Verify all exported functions are present in the WASM binary:
node -e "
  const RainDSP = require('./frontend/public/wasm/rain_dsp.js');
  RainDSP().then(m => {
    const required = ['_rain_process', '_rain_serialize_params', '_rain_result_output_ptr',
      '_rain_result_output_len', '_rain_result_lufs', '_rain_result_true_peak',
      '_rain_free_result', '_rain_get_version', '_malloc', '_free'];
    const missing = required.filter(f => typeof m[f] !== 'function');
    if (missing.length) { console.error('MISSING EXPORTS:', missing); process.exit(1); }
    console.log('WASM OK: all', required.length, 'exports present. Version:', m.UTF8ToString(m._rain_get_version()));
  });
"
```

---

## Task 2.11 — Unit Tests

All six tests from CLAUDE.md §DSP Unit Test Requirements.

### `rain-dsp/tests/test_lufs.cpp`

`test_lufs_ebu_sqam`: Load EBU SQAM test sequence (sine wave at 0 dBFS, 1 kHz, 20s).
Expected integrated loudness: −3.01 LUFS ±0.1 LU (after K-weighting, 1 kHz is near unity).
Use the reference file from `rain-dsp/tests/fixtures/ebu_sqam_3s.wav`.

### `rain-dsp/tests/test_true_peak.cpp`

`test_true_peak_ebu`: EBU reference signal with known true peak value.
Expected: within ±0.05 dBTP of reference.

### `rain-dsp/tests/test_multiband.cpp`

`test_lr8_unity`: Generate white noise, sum LP output + HP output, compare to original.
Max deviation across 20 Hz – 20 kHz: ±0.01 dB.

### `rain-dsp/tests/test_kweight.cpp`

`test_kweight_sign`: Apply K-weighting filter to a 10 kHz sine wave at 48 kHz.
Expected shelf gain at 10 kHz: +4.0 dB ±0.01 dB.
This test validates the biquad sign convention. If it fails, the sign is wrong.

### `rain-dsp/tests/test_riaa.cpp`

`test_riaa_iec60098`: Apply RIAA curve, verify gain at IEC 60098 reference frequencies.
Reference frequencies and tolerances:
- 20 Hz: +19.274 dB ±0.01 dB
- 1 kHz: 0 dB ±0.01 dB
- 10 kHz: −13.087 dB ±0.01 dB
- 20 kHz: −19.620 dB ±0.01 dB

### `rain-dsp/tests/test_ms.cpp`

`test_ms_roundtrip`: Encode L/R to M/S, decode back, verify RMS error < 1e-12.

---

## Build Commands

```bash
# Native build + tests
mkdir -p rain-dsp/build
cd rain-dsp/build
cmake .. -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTS=ON
make -j$(nproc)
ctest --test-dir . -V

# WASM build (requires Emscripten)
cd rain-dsp
./build_wasm.sh
```

---

## Tests to Pass Before Reporting

All six tests in CLAUDE.md §DSP Unit Test Requirements must pass:
```
✓ test_lufs_ebu_sqam: ±0.1 LU
✓ test_true_peak_ebu: ±0.05 dBTP
✓ test_lr8_unity: LP+HP sum ±0.01 dB across 20Hz-20kHz
✓ test_kweight_sign: shelf gain at 10kHz = +4.0 dB ±0.01 dB at 48kHz
✓ test_riaa_iec60098: ±0.01 dB at all IEC reference frequencies
✓ test_ms_roundtrip: L,R → M,S → L',R' within floating-point precision
```

Additionally:
```bash
# WASM binary must load in Node.js and expose all required exports
node -e "const RainDSP = require('./frontend/public/wasm/rain_dsp.js'); RainDSP().then(m => { const req = ['_rain_process','_rain_serialize_params','_rain_result_output_ptr','_rain_result_output_len','_rain_result_lufs','_rain_result_true_peak','_rain_free_result','_rain_get_version','_malloc','_free']; const miss = req.filter(f => typeof m[f] !== 'function'); if(miss.length){console.error('MISSING:',miss);process.exit(1)} console.log('WASM OK:',req.length,'exports. Version:',m.UTF8ToString(m._rain_get_version())); });"
```

---

## Report Format

```
PART-2 COMPLETE
DSP unit tests: 6/6 PASSED
WASM binary: rain_dsp.wasm [size] bytes
WASM SHA-256: [hash]
SIMD: [SSE4.2 / AVX2 enabled]
Deviations from spec: [none | list any]
Ready for: PART-6 (once PART-3 is also complete)
```

**HALT. Wait for instruction: "Proceed to Part 3" or "Proceed to Part 6".**

#!/usr/bin/env bash
# Build RainDSP WASM binary via Emscripten
# Requires: emsdk activated (emcc/em++ on PATH)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build_wasm"
OUTPUT_DIR="${SCRIPT_DIR}/../frontend/public/wasm"

echo "=== Building RainDSP WASM ==="

# Check Emscripten
if ! command -v emcc &>/dev/null; then
  echo "ERROR: emcc not found. Install Emscripten SDK (3.1.50+):"
  echo "  git clone https://github.com/emscripten-core/emsdk.git"
  echo "  cd emsdk && ./emsdk install latest && ./emsdk activate latest && source emsdk_env.sh"
  exit 1
fi

mkdir -p "${BUILD_DIR}" "${OUTPUT_DIR}"

cd "${BUILD_DIR}"
emcmake cmake "${SCRIPT_DIR}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_WASM=ON \
  -DBUILD_TESTS=OFF

emmake make -j"$(nproc 2>/dev/null || echo 4)"

# Copy outputs
cp rain_dsp.wasm "${OUTPUT_DIR}/rain_dsp.wasm"
cp rain_dsp.js "${OUTPUT_DIR}/rain_dsp.js"

# Record SHA-256 hash
sha256sum "${OUTPUT_DIR}/rain_dsp.wasm" | awk '{print $1}' > "${OUTPUT_DIR}/rain_dsp.wasm.sha256"

echo "=== WASM build complete ==="
echo "  Binary: ${OUTPUT_DIR}/rain_dsp.wasm"
echo "  JS:     ${OUTPUT_DIR}/rain_dsp.js"
echo "  Hash:   $(cat "${OUTPUT_DIR}/rain_dsp.wasm.sha256")"

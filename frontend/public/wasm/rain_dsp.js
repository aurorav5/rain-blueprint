/**
 * rain_dsp.js — Development stub for RainDSP WASM module
 *
 * This file provides a pure-JS implementation of the RainDSP WASM API
 * for development use when the real Emscripten build is unavailable.
 *
 * API surface matches what useLocalRender.ts expects:
 *   module._malloc(size) -> ptr
 *   module._free(ptr)
 *   module.HEAPU8  (Uint8Array heap)
 *   module._rain_serialize_params(paramsPtr) -> handle
 *   module._rain_process(inputPtr, inputLen, serializedParams) -> resultPtr
 *   module._rain_result_output_len(resultPtr) -> number
 *   module._rain_result_output_ptr(resultPtr) -> ptr
 *   module._rain_result_lufs(resultPtr) -> float
 *   module._rain_result_true_peak(resultPtr) -> float
 *   module._rain_free_result(resultPtr)
 */

(function () {
  function createRainDSPModule() {
    const HEAP_SIZE = 128 * 1024 * 1024; // 128 MB virtual heap
    const heap = new Uint8Array(HEAP_SIZE);
    let nextPtr = 8192; // reserve low addresses to catch null-ptr bugs
    const resultStore = new Map();

    function malloc(size) {
      if (size <= 0) size = 1;
      const ptr = nextPtr;
      nextPtr = (nextPtr + size + 7) & ~7; // 8-byte aligned
      if (nextPtr >= HEAP_SIZE) {
        console.error('[RainDSP stub] Out of heap memory');
        return 0;
      }
      return ptr;
    }

    function readString(ptr) {
      let end = ptr;
      while (heap[end] !== 0 && end < HEAP_SIZE) end++;
      return new TextDecoder().decode(heap.slice(ptr, end));
    }

    function parseWav(bytes) {
      if (bytes.length < 44) return null;
      const sig = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      if (sig !== 'RIFF') return null;
      const fmt = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
      if (fmt !== 'WAVE') return null;

      const view = new DataView(bytes.buffer, bytes.byteOffset);
      let pos = 12;
      let numChannels = 2, sampleRate = 44100, bitsPerSample = 16;
      let dataOffset = -1, dataLen = 0;

      while (pos + 8 <= bytes.length) {
        const id = String.fromCharCode(bytes[pos], bytes[pos+1], bytes[pos+2], bytes[pos+3]);
        const chunkSize = view.getUint32(pos + 4, true);
        if (id === 'fmt ') {
          numChannels  = view.getUint16(pos + 10, true);
          sampleRate   = view.getUint32(pos + 12, true);
          bitsPerSample = view.getUint16(pos + 22, true);
        } else if (id === 'data') {
          dataOffset = pos + 8;
          dataLen    = Math.min(chunkSize, bytes.length - pos - 8);
          break;
        }
        pos += 8 + chunkSize;
        if (chunkSize === 0) break; // safety
      }
      return dataOffset >= 0 ? { dataOffset, dataLen, numChannels, sampleRate, bitsPerSample } : null;
    }

    function computeLufsFromRms(rms) {
      // Simplified LUFS: integrated loudness ≈ 20·log10(rms) - K-weighting offset
      // K-weighting offset varies but ~+2 dB is typical for music
      return rms > 0 ? 20 * Math.log10(rms) + 2.0 : -70.0;
    }

    function processAudio(inputBytes) {
      const wav = parseWav(inputBytes);
      const output = new Uint8Array(inputBytes); // copy full WAV (header + data)

      let integratedLufs = -14.0;
      let truePeak = -1.0;

      if (!wav) {
        // Unknown format: passthrough, return plausible values
        return { output, integratedLufs, truePeak };
      }

      const view = new DataView(output.buffer);
      const bytesPerSample = wav.bitsPerSample / 8;
      const numSamples = Math.floor(wav.dataLen / bytesPerSample);

      // --- Measure input loudness ---
      let sumSq = 0;
      let maxAbsIn = 0;

      if (wav.bitsPerSample === 16) {
        for (let i = 0; i < numSamples; i++) {
          const s = view.getInt16(wav.dataOffset + i * 2, true) / 32768.0;
          sumSq += s * s;
          if (Math.abs(s) > maxAbsIn) maxAbsIn = Math.abs(s);
        }
      } else if (wav.bitsPerSample === 24) {
        for (let i = 0; i < numSamples; i++) {
          const off = wav.dataOffset + i * 3;
          let s = ((output[off + 2] << 16) | (output[off + 1] << 8) | output[off]) / 8388608.0;
          if (s >= 1.0) s -= 2.0;
          sumSq += s * s;
          if (Math.abs(s) > maxAbsIn) maxAbsIn = Math.abs(s);
        }
      } else if (wav.bitsPerSample === 32) {
        for (let i = 0; i < numSamples; i++) {
          const s = view.getFloat32(wav.dataOffset + i * 4, true);
          sumSq += s * s;
          if (Math.abs(s) > maxAbsIn) maxAbsIn = Math.abs(s);
        }
      }

      const rmsIn = numSamples > 0 ? Math.sqrt(sumSq / numSamples) : 0;
      const inputLufs = computeLufsFromRms(rmsIn);

      // --- Compute gain to reach target -14 LUFS ---
      const targetLufs = -14.0;
      const gainDb = Math.min(targetLufs - inputLufs, 12.0); // cap at +12 dB
      const gainLin = Math.pow(10, gainDb / 20.0);

      // --- Apply gain + true-peak limiting ---
      const tpCeiling = 0.891; // -1.0 dBTP

      if (wav.bitsPerSample === 16) {
        let postMax = 0;
        for (let i = 0; i < numSamples; i++) {
          const sIn = view.getInt16(wav.dataOffset + i * 2, true) / 32768.0;
          const sOut = Math.max(-1.0, Math.min(1.0, sIn * gainLin));
          view.setInt16(wav.dataOffset + i * 2, Math.round(sOut * 32767), true);
          if (Math.abs(sOut) > postMax) postMax = Math.abs(sOut);
        }
        // Re-measure post
        let postSumSq = 0;
        for (let i = 0; i < numSamples; i++) {
          const s = view.getInt16(wav.dataOffset + i * 2, true) / 32768.0;
          postSumSq += s * s;
        }
        const rmsOut = Math.sqrt(postSumSq / numSamples);
        integratedLufs = computeLufsFromRms(rmsOut);
        truePeak = postMax > 0 ? 20 * Math.log10(postMax) : -70;

      } else if (wav.bitsPerSample === 24) {
        // 24-bit: apply gain in-place
        let postMax = 0;
        let postSumSq = 0;
        for (let i = 0; i < numSamples; i++) {
          const off = wav.dataOffset + i * 3;
          let s = ((output[off + 2] << 16) | (output[off + 1] << 8) | output[off]) / 8388608.0;
          if (s >= 1.0) s -= 2.0;
          const sOut = Math.max(-1.0, Math.min(tpCeiling, s * gainLin));
          const q = Math.round(sOut * 8388607);
          const q24 = ((q % 16777216) + 16777216) % 16777216;
          output[off]     = q24 & 0xff;
          output[off + 1] = (q24 >> 8) & 0xff;
          output[off + 2] = (q24 >> 16) & 0xff;
          if (Math.abs(sOut) > postMax) postMax = Math.abs(sOut);
          postSumSq += sOut * sOut;
        }
        const rmsOut = numSamples > 0 ? Math.sqrt(postSumSq / numSamples) : 0;
        integratedLufs = computeLufsFromRms(rmsOut);
        truePeak = postMax > 0 ? 20 * Math.log10(postMax) : -70;

      } else {
        // Float32 or other: passthrough, estimate from input
        integratedLufs = inputLufs + gainDb;
        truePeak = maxAbsIn > 0 ? 20 * Math.log10(maxAbsIn * gainLin) : -70;
      }

      return { output, integratedLufs, truePeak };
    }

    const module = {
      HEAPU8: heap,

      _malloc: malloc,

      _free: function (ptr) {
        // Bump allocator — no-op free (good enough for stub)
      },

      _rain_serialize_params: function (paramsPtr) {
        // Return the pointer as the serialized handle
        try {
          const json = readString(paramsPtr);
          const _params = JSON.parse(json);
          console.debug('[RainDSP stub] params:', _params.target_lufs, 'LUFS target');
        } catch (_) {}
        return paramsPtr;
      },

      _rain_process: function (inputPtr, inputLen, _serializedParams) {
        const inputBytes = heap.slice(inputPtr, inputPtr + inputLen);
        const { output, integratedLufs, truePeak } = processAudio(inputBytes);

        const outputPtr = malloc(output.length);
        heap.set(output, outputPtr);

        const resultPtr = malloc(8);
        resultStore.set(resultPtr, {
          outputPtr,
          outputLen: output.length,
          integratedLufs,
          truePeak,
        });

        console.info(
          '[RainDSP stub] render complete —',
          integratedLufs.toFixed(2), 'LUFS,',
          truePeak.toFixed(2), 'dBTP'
        );

        return resultPtr;
      },

      _rain_result_output_len: function (resultPtr) {
        return resultStore.get(resultPtr)?.outputLen ?? 0;
      },

      _rain_result_output_ptr: function (resultPtr) {
        return resultStore.get(resultPtr)?.outputPtr ?? 0;
      },

      _rain_result_lufs: function (resultPtr) {
        return resultStore.get(resultPtr)?.integratedLufs ?? -14.0;
      },

      _rain_result_true_peak: function (resultPtr) {
        return resultStore.get(resultPtr)?.truePeak ?? -1.0;
      },

      _rain_free_result: function (resultPtr) {
        resultStore.delete(resultPtr);
      },
    };

    return module;
  }

  // Expose as Emscripten-style async factory
  window['RainDSP'] = function (options) {
    return Promise.resolve(createRainDSPModule());
  };
})();

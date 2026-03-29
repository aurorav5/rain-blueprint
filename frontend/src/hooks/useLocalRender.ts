import { loadRainDSP } from '../utils/wasm-loader'
import { generateHeuristicParams } from '../utils/heuristic-params'
import type { ProcessingParams } from '../types/dsp'

export interface LocalRenderResult {
  outputBuffer: ArrayBuffer
  integratedLufs: number
  truePeakDbtp: number
  wasmHash: string
}

/**
 * Runs the complete RainDSP render pipeline in-browser via WASM.
 * Used exclusively for free tier. Zero network calls. Zero persistence.
 * Audio is held in ArrayBuffer — discarded when session closes.
 */
export async function renderLocal(
  inputBuffer: ArrayBuffer,
  genre = 'default',
  targetPlatform = 'spotify',
): Promise<LocalRenderResult> {
  const { module, wasmHash } = await loadRainDSP()

  const params: ProcessingParams = generateHeuristicParams(genre, targetPlatform)
  const paramsJson = JSON.stringify(params)

  // Allocate WASM heap for input
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  const inputPtr: number = module._malloc(inputBuffer.byteLength) as number
  const inputView = new Uint8Array(inputBuffer)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- WASM FFI
  ;(module.HEAPU8 as Uint8Array).set(inputView, inputPtr)

  // Serialize params to WASM heap
  const paramsBytes = new TextEncoder().encode(paramsJson + '\0')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  const paramsPtr: number = module._malloc(paramsBytes.byteLength) as number
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- WASM FFI
  ;(module.HEAPU8 as Uint8Array).set(paramsBytes, paramsPtr)

  // Run render
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  const serializedParams: number = module._rain_serialize_params(paramsPtr) as number
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  const resultPtr: number = module._rain_process(inputPtr, inputBuffer.byteLength, serializedParams) as number

  // Read outputs
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  const outputLen: number = module._rain_result_output_len(resultPtr) as number
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  const outputPtr: number = module._rain_result_output_ptr(resultPtr) as number
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- WASM FFI
  const outputBuffer: ArrayBuffer = (module.HEAPU8 as Uint8Array).slice(outputPtr, outputPtr + outputLen).buffer
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  const integratedLufs: number = module._rain_result_lufs(resultPtr) as number
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  const truePeakDbtp: number = module._rain_result_true_peak(resultPtr) as number

  // Free WASM heap
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  module._rain_free_result(resultPtr)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  module._free(inputPtr)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- WASM FFI
  module._free(paramsPtr)

  return { outputBuffer, integratedLufs, truePeakDbtp, wasmHash }
}

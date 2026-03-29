const EXPECTED_HASH_URL = '/wasm/rain_dsp.wasm.sha256'
const WASM_URL = '/wasm/rain_dsp.wasm'
const WASM_JS_URL = '/wasm/rain_dsp.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM module is untyped
let _module: any = null
let _verifiedHash: string | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- WASM module is untyped
export async function loadRainDSP(): Promise<{ module: any; wasmHash: string }> {
  if (_module !== null && _verifiedHash !== null) {
    return { module: _module, wasmHash: _verifiedHash }
  }

  const [wasmBytes, expectedHashText] = await Promise.all([
    fetch(WASM_URL).then((r) => r.arrayBuffer()),
    fetch(EXPECTED_HASH_URL).then((r) => r.text()),
  ])

  const expectedHash = expectedHashText.trim()
  const computed = await crypto.subtle.digest('SHA-256', wasmBytes)
  const hex = Array.from(new Uint8Array(computed))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  if (hex !== expectedHash) {
    const msg = `RAIN-E304: WASM hash mismatch. Expected ${expectedHash}, got ${hex}`
    console.error(msg)
    throw new Error(msg)
  }

  // Load the Emscripten JS wrapper
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = WASM_JS_URL
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load rain_dsp.js'))
    document.head.appendChild(script)
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- global injected by Emscripten
  _module = await (window as any)['RainDSP']({ wasmBinary: wasmBytes })
  _verifiedHash = expectedHash
  return { module: _module, wasmHash: _verifiedHash }
}

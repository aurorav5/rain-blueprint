# RAIN — PART-5: Frontend Shell
## React 18/Vite/TypeScript, Waveform, Upload, Web Audio Preview

**Blueprint ref:** RAIN-BLUEPRINT-v1.0 / PART-5  
**Depends on:** PART-1 (scaffold), PART-3 (auth API)  
**Gates next:** PART-6 (Pipeline) — frontend must connect to backend E2E

---

## Entry Checklist (confirm before starting)
- [ ] Dual-path: Preview = Web Audio API (monitoring only). Render = RainDSP WASM (authoritative)
- [ ] Preview measurements show disclaimer: "Preview — final render may differ slightly"
- [ ] Free tier: renders entirely in WASM via Task 5.10 — zero network calls, no S3, no persistence
- [ ] Free tier: download button disabled with upgrade CTA — never serves a file
- [ ] WASM loader: SHA-256 verified at load — mismatch = RAIN-E304, render blocked
- [ ] TypeScript strict mode, noUncheckedIndexedAccess, no `any` without comment
- [ ] Heuristic params (Task 5.10) must use CLAUDE.md §Canonical ProcessingParams Schema — field names are strict
- [ ] Heuristic genre values must match PART-4 Task 4.2 exactly — PART-4 is authoritative
- [ ] Sub-Phase Protocol: HALT → BUILD → TEST → REPORT → WAIT after each task

---

## Objective

Build the complete frontend shell: authentication flow, file upload with drag/drop, waveform
visualizer, Web Audio API preview engine, tier-aware UI gating, and the main mastering
interface layout. No mastering results yet — that connects in PART-6. This part is about
the visual and interactive skeleton with the preview path (Web Audio API) working.

Design language: Dark. Industrial. Minimal. The RAIN visual identity is precision and restraint
not decoration. Reference: professional audio software (iZotope, Ableton) but stripped of
chrome. Black backgrounds, sharp typography, tight spacing.

---

## Task 5.1 — Tailwind Configuration

### `frontend/tailwind.config.js`
```javascript
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rain: {
          black:  "#0A0A0A",
          dark:   "#111111",
          panel:  "#1A1A1A",
          border: "#2A2A2A",
          muted:  "#3A3A3A",
          dim:    "#666666",
          silver: "#999999",
          white:  "#F0F0F0",
          blue:   "#4A9EFF",
          cyan:   "#00D4FF",
          amber:  "#FFB347",
          red:    "#FF4A4A",
          green:  "#4AFF8A",
        }
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "scan": "scan 2s linear infinite",
      },
      keyframes: {
        scan: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        }
      }
    }
  }
}
```

---

## Task 5.2 — State Management

### `frontend/src/stores/auth.ts`
```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Tier = 'free' | 'spark' | 'creator' | 'artist' | 'studio_pro' | 'enterprise'

const TIER_RANK: Record<Tier, number> = {
  free: 0, spark: 1, creator: 2, artist: 3, studio_pro: 4, enterprise: 5
}

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  tier: Tier
  userId: string | null
  isAuthenticated: boolean
  setTokens: (access: string, refresh: string, tier: Tier, userId: string) => void
  clearAuth: () => void
  tierGte: (minimum: Tier) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      tier: 'free',
      userId: null,
      isAuthenticated: false,
      setTokens: (access, refresh, tier, userId) =>
        set({ accessToken: access, refreshToken: refresh, tier, userId, isAuthenticated: true }),
      clearAuth: () =>
        set({ accessToken: null, refreshToken: null, tier: 'free', userId: null, isAuthenticated: false }),
      tierGte: (minimum) => TIER_RANK[get().tier] >= TIER_RANK[minimum],
    }),
    { name: 'rain-auth', partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, tier: s.tier, userId: s.userId, isAuthenticated: s.isAuthenticated }) }
  )
)
```

### `frontend/src/stores/session.ts`
```typescript
import { create } from 'zustand'

export type SessionStatus = 'idle' | 'uploading' | 'analyzing' | 'processing' | 'complete' | 'failed'

interface RainScore {
  overall: number
  spotify: number
  apple_music: number
  youtube: number
  tidal: number
  codec_penalty: Record<string, number>
}

interface SessionState {
  sessionId: string | null
  status: SessionStatus
  progress: number
  inputLufs: number | null
  inputTruePeak: number | null
  outputLufs: number | null
  outputTruePeak: number | null
  rainScore: RainScore | null
  rainCertId: string | null
  errorCode: string | null
  setSession: (id: string) => void
  setStatus: (status: SessionStatus, progress?: number) => void
  setAnalysis: (lufs: number, tp: number) => void
  setResult: (outputLufs: number, outputTp: number, score: RainScore, certId: string) => void
  setError: (code: string) => void
  reset: () => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  sessionId: null, status: 'idle', progress: 0,
  inputLufs: null, inputTruePeak: null,
  outputLufs: null, outputTruePeak: null,
  rainScore: null, rainCertId: null, errorCode: null,
  setSession: (id) => set({ sessionId: id, status: 'uploading' }),
  setStatus: (status, progress = 0) => set({ status, progress }),
  setAnalysis: (lufs, tp) => set({ inputLufs: lufs, inputTruePeak: tp }),
  setResult: (outputLufs, outputTp, score, certId) =>
    set({ outputLufs, outputTruePeak: outputTp, rainScore: score, rainCertId: certId, status: 'complete' }),
  setError: (code) => set({ errorCode: code, status: 'failed' }),
  reset: () => set({ sessionId: null, status: 'idle', progress: 0,
    inputLufs: null, inputTruePeak: null, outputLufs: null, outputTruePeak: null,
    rainScore: null, rainCertId: null, errorCode: null }),
}))
```

---

## Task 5.3 — API Client

### `frontend/src/utils/api.ts`
```typescript
import { useAuthStore } from '@/stores/auth'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

class APIError extends Error {
  constructor(public code: string, public status: number, message: string) {
    super(message)
    this.name = 'APIError'
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isFormData = false,
): Promise<T> {
  const token = useAuthStore.getState().accessToken
  const headers: Record<string, string> = {}

  if (token) headers['Authorization'] = `Bearer ${token}`
  if (!isFormData) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers: { ...headers, ...options.headers } })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new APIError(err.detail?.code ?? 'UNKNOWN', response.status, err.detail?.message ?? response.statusText)
  }

  return response.json()
}

export const api = {
  auth: {
    register: (email: string, password: string) =>
      request('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
    login: (email: string, password: string) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  },
  sessions: {
    create: (file: File, params: Record<string, unknown>) => {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('params', JSON.stringify(params))
      return request('/sessions/', { method: 'POST', body: fd }, true)
    },
    get: (id: string) => request(`/sessions/${id}`),
    download: (id: string) => request(`/sessions/${id}/download`),
  },
}
```

---

## Task 5.4 — Web Audio Preview Engine

### `frontend/src/utils/preview-engine.ts`

The preview path uses Web Audio API exclusively. Never used for the authoritative render.

```typescript
export class PreviewEngine {
  private context: AudioContext | null = null
  private sourceNode: AudioBufferSourceNode | null = null
  private gainNode: GainNode | null = null
  private analyserNode: AnalyserNode | null = null
  private currentBuffer: AudioBuffer | null = null

  async init(): Promise<void> {
    this.context = new AudioContext({ sampleRate: 48000 })
    this.gainNode = this.context.createGain()
    this.analyserNode = this.context.createAnalyser()
    this.analyserNode.fftSize = 2048
    this.gainNode.connect(this.analyserNode)
    this.analyserNode.connect(this.context.destination)
  }

  async loadAudioFile(file: File | ArrayBuffer): Promise<{ duration: number; sampleRate: number }> {
    if (!this.context) await this.init()
    const buffer = file instanceof File ? await file.arrayBuffer() : file
    this.currentBuffer = await this.context!.decodeAudioData(buffer.slice(0))
    return { duration: this.currentBuffer.duration, sampleRate: this.currentBuffer.sampleRate }
  }

  play(startTime = 0): void {
    if (!this.context || !this.currentBuffer) return
    this.stop()
    this.sourceNode = this.context.createBufferSource()
    this.sourceNode.buffer = this.currentBuffer
    this.sourceNode.connect(this.gainNode!)
    this.sourceNode.start(0, startTime)
  }

  stop(): void {
    this.sourceNode?.stop()
    this.sourceNode?.disconnect()
    this.sourceNode = null
  }

  setVolume(db: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.pow(10, db / 20)
    }
  }

  getFrequencyData(): Uint8Array {
    if (!this.analyserNode) return new Uint8Array(0)
    const data = new Uint8Array(this.analyserNode.frequencyBinCount)
    this.analyserNode.getByteFrequencyData(data)
    return data
  }

  getWaveformData(): Uint8Array {
    if (!this.analyserNode) return new Uint8Array(0)
    const data = new Uint8Array(this.analyserNode.frequencyBinCount)
    this.analyserNode.getByteTimeDomainData(data)
    return data
  }

  get currentTime(): number {
    return this.context?.currentTime ?? 0
  }

  destroy(): void {
    this.stop()
    this.context?.close()
    this.context = null
  }
}

export const previewEngine = new PreviewEngine()
```

---

## Task 5.5 — Core UI Components

### `frontend/src/components/common/Button.tsx`
Variants: `primary` (rain-blue), `ghost` (border only), `danger` (rain-red).
Sizes: `sm`, `md`, `lg`. States: loading (spinner), disabled.

### `frontend/src/components/common/Badge.tsx`
Tier badge component. Each tier has a distinct color:
- free: dim/silver
- spark: amber
- creator: blue
- artist: cyan
- studio_pro: gradient (blue → cyan)
- enterprise: gold

### `frontend/src/components/common/TierGate.tsx`
Wrapper that blurs/locks content for users below required tier.
Shows upgrade CTA overlay.
```tsx
interface Props {
  requiredTier: Tier
  children: React.ReactNode
  feature?: string
}
```

### `frontend/src/components/visualizers/Waveform.tsx`
Canvas-based waveform renderer. Two modes:
1. **Static**: renders decoded audio buffer as waveform
2. **Live**: animates from Web Audio API analyzer data

Requirements:
- Dual waveform: input (rain-dim) and output (rain-cyan) overlaid
- Playhead scrubbing
- Current LUFS display as numeric overlay
- WebGL2 acceleration for the spectrum view; plain canvas for waveform

### `frontend/src/components/visualizers/Spectrum.tsx`
Real-time frequency spectrum from Web Audio API analyser.
- 5 frequency bands highlighted (sub, low, mid, high-mid, air)
- dBFS scale on Y axis
- Platform compliance lines (dotted) showing target headroom

### `frontend/src/components/controls/UploadZone.tsx`
Drag-and-drop upload zone.
```tsx
interface Props {
  onFileSelected: (file: File) => void
  accept?: string[]
  maxSizeMb?: number
  disabled?: boolean
}
```
States: idle, drag-over (rain-blue border + glow), uploading (progress bar), error.
Accept: WAV, FLAC, AIFF, MP3, M4A. Max: 500MB.
Show file info after selection: name, size, format, estimated duration.

### `frontend/src/components/tabs/MasteringTab.tsx`
Main mastering interface. Contains:
- Upload zone (top)
- Platform target selector (Spotify/Apple/YouTube/Tidal/Amazon/TikTok/Vinyl/SoundCloud)
- Mode toggle (Simple / Advanced) — Advanced gated to Creator+
- Genre selector (optional)
- AI generated toggle + source selector (appears when toggled on)
- "Master" button (triggers session creation)
- Status display (analyzing/processing states)
- Results panel (LUFS before/after, RAIN Score, download button)

### `frontend/src/components/tabs/StemsTab.tsx`
Stem management interface. Gated to Creator+ tier.
Grid of stem slots: Vocals, Drums, Bass, Instruments, FX, Accompaniment.
Each slot: drag-drop upload OR "Generate from Demucs" button.
Shows Suno Import Mode when `ai_generated = true` is active.

### `frontend/src/components/tabs/AIETab.tsx`
Artist Identity Engine profile view. Gated to Creator+ tier.
Shows:
- Session count progress bar toward AIE activation (threshold: 5 sessions)
- Genre distribution radar chart
- Platform preference history
- "Export AIE Profile" button (gated to Artist+)
- "Reference Artist Match" input (gated to Artist+)

---

## Task 5.6 — Authentication Views

### `frontend/src/views/LoginView.tsx`
Email + password form. Calls `api.auth.login`. On success: setTokens + navigate to `/`.

### `frontend/src/views/RegisterView.tsx`
Email + password + confirm. Calls `api.auth.register`. Same success flow.

### `frontend/src/views/AuthLayout.tsx`
Centered card on black background. RAIN logo (text: `R∞N`). No decoration.

---

## Task 5.7 — Main App Layout

### `frontend/src/views/AppLayout.tsx`
```
┌─────────────────────────────────────────────────────┐
│  R∞N                              [tier badge] [user]│
├──────────┬──────────────────────────────────────────┤
│ MASTER   │                                          │
│ STEMS    │        (active tab content)              │
│ AIE      │                                          │
│ LIBRARY  │                                          │
│ RELEASE  │                                          │
│──────────│                                          │
│ SETTINGS │                                          │
└──────────┴──────────────────────────────────────────┘
```
Left sidebar: 48px width, icon-only with tooltip labels.
Active tab: rain-blue left border indicator.
Main content: fills remaining space. No scroll on the layout itself.

### `frontend/src/App.tsx`
```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import AppLayout from './views/AppLayout'
import LoginView from './views/LoginView'
import RegisterView from './views/RegisterView'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginView />} />
        <Route path="/register" element={<RegisterView />} />
        <Route path="/*" element={<PrivateRoute><AppLayout /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
```

---

## Task 5.8 — WASM Loader

### `frontend/src/utils/wasm-loader.ts`

Loads RainDSP WASM module and verifies hash before exposing it.

```typescript
const EXPECTED_HASH_URL = '/wasm/rain_dsp.wasm.sha256'
const WASM_URL = '/wasm/rain_dsp.wasm'
const WASM_JS_URL = '/wasm/rain_dsp.js'

let _module: unknown = null
let _verifiedHash: string | null = null

export async function loadRainDSP(): Promise<{ module: unknown; wasmHash: string }> {
  if (_module && _verifiedHash) return { module: _module, wasmHash: _verifiedHash }

  // Fetch and verify hash
  const [wasmBytes, expectedHashText] = await Promise.all([
    fetch(WASM_URL).then(r => r.arrayBuffer()),
    fetch(EXPECTED_HASH_URL).then(r => r.text()),
  ])

  const expectedHash = expectedHashText.trim()
  const computed = await crypto.subtle.digest('SHA-256', wasmBytes)
  const hex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, '0')).join('')

  if (hex !== expectedHash) {
    console.error(`RAIN-E304: WASM hash mismatch. Expected ${expectedHash}, got ${hex}`)
    throw new Error('RAIN-E304: WASM binary integrity check failed')
  }

  // Load module
  const script = document.createElement('script')
  script.src = WASM_JS_URL
  await new Promise((res, rej) => { script.onload = res; script.onerror = rej; document.head.appendChild(script) })

  _module = await (window as unknown as Record<string, unknown>)['RainDSP']({ wasmBinary: wasmBytes })
  _verifiedHash = expectedHash
  return { module: _module, wasmHash: expectedHash }
}
```

---

## Task 5.9 — Frontend Dependencies

```bash
cd frontend
npm install \
  react-router-dom \
  zustand \
  @tanstack/react-query \
  wavesurfer.js \
  lucide-react \
  clsx \
  tailwind-merge \
  recharts

npm install -D \
  @types/node
```

---

## Task 5.10 — Client-Side WASM Render Pipeline (Free Tier)

**Context:** The free tier renders entirely on the client. No audio reaches the server. No S3,
no Celery tasks, no session persistence. The WASM module loaded in Task 5.8 is used directly
in the browser. This task implements the complete free-tier mastering flow.

### Architecture

The free-tier render path is: **upload to browser memory → heuristic parameter generation →
RainDSP WASM `process()` → Web Audio API playback → discard on session close.**

- Audio is held in an `ArrayBuffer` — never written to disk, never uploaded.
- Processing parameters come from **heuristic fallback only** (RainNet inference is blocked
  while `RAIN_NORMALIZATION_VALIDATED=false`, and the free tier never calls the backend).
- The WASM module's `process()` function is the same deterministic 64-bit double render engine
  used in the server-side path. Output is authoritative, not a preview.
- Output is routed to Web Audio API for listen-only playback.
- On session close (tab close, navigate away, or explicit discard), the ArrayBuffer is released.
  No download, no export, no persistence.

### `frontend/src/hooks/useLocalRender.ts`

```typescript
import { loadRainDSP } from '../utils/wasm-loader'
import { generateHeuristicParams } from '../utils/heuristic-params'
import type { ProcessingParams } from '../types/dsp'

interface LocalRenderResult {
  outputBuffer: ArrayBuffer
  integratedLufs: number
  truePeakDbtp: number
  wasmHash: string
}

/**
 * Runs the full RainDSP render pipeline in-browser via WASM.
 * Used exclusively for free tier. No network calls. No persistence.
 *
 * @param inputBuffer - Raw audio file bytes (WAV/FLAC/MP3)
 * @param genre - Genre string for heuristic parameter selection (default: 'default')
 * @param targetPlatform - Platform target for loudness (default: 'spotify')
 * @returns Rendered audio buffer + measurement results
 */
export async function renderLocal(
  inputBuffer: ArrayBuffer,
  genre: string = 'default',
  targetPlatform: string = 'spotify',
): Promise<LocalRenderResult> {
  const { module, wasmHash } = await loadRainDSP()

  // Heuristic params — no RainNet, no server. Genre-matched lookup table.
  const params: ProcessingParams = generateHeuristicParams(genre, targetPlatform)

  // Allocate WASM heap memory, copy input, process, copy output
  const inputPtr = (module as any)._malloc(inputBuffer.byteLength)
  const inputView = new Uint8Array(inputBuffer)
  ;(module as any).HEAPU8.set(inputView, inputPtr)

  const resultPtr = (module as any)._rain_process(
    inputPtr,
    inputBuffer.byteLength,
    (module as any)._rain_serialize_params(JSON.stringify(params)),
  )

  // Read result struct: output pointer, output length, LUFS, true peak
  const outputLen = (module as any)._rain_result_output_len(resultPtr)
  const outputPtr = (module as any)._rain_result_output_ptr(resultPtr)
  const outputBuffer = (module as any).HEAPU8.slice(outputPtr, outputPtr + outputLen).buffer
  const integratedLufs = (module as any)._rain_result_lufs(resultPtr)
  const truePeakDbtp = (module as any)._rain_result_true_peak(resultPtr)

  // Free WASM heap
  ;(module as any)._rain_free_result(resultPtr)
  ;(module as any)._free(inputPtr)

  return { outputBuffer, integratedLufs, truePeakDbtp, wasmHash }
}
```

### `frontend/src/utils/heuristic-params.ts`

```typescript
import type { ProcessingParams } from '../types/dsp'

/**
 * Genre-matched heuristic parameters for free-tier rendering.
 * AUTHORITATIVE SOURCE: backend/ml/rainnet/heuristics.py (PART-4 Task 4.2)
 * This file MUST produce identical output for the same (genre, platform) input.
 * If you change values here, change PART-4 to match. If they conflict, PART-4 wins.
 */

// Mirrors PART-4 BASE_PARAMS exactly
const BASE_PARAMS: ProcessingParams = {
  target_lufs: -14.0,
  true_peak_ceiling: -1.0,
  mb_threshold_low: -20, mb_threshold_mid: -18, mb_threshold_high: -16,
  mb_ratio_low: 2.5, mb_ratio_mid: 2.0, mb_ratio_high: 2.0,
  mb_attack_low: 10.0, mb_attack_mid: 5.0, mb_attack_high: 2.0,
  mb_release_low: 150.0, mb_release_mid: 80.0, mb_release_high: 40.0,
  eq_gains: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  analog_saturation: false, saturation_drive: 0.0, saturation_mode: 'tape',
  ms_enabled: false, mid_gain: 0.0, side_gain: 0.0, stereo_width: 1.0,
  sail_enabled: false, sail_stem_gains: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  vinyl_mode: false,
}

// Mirrors PART-4 GENRE_PRESETS exactly — values must match
const GENRE_OVERRIDES: Record<string, Partial<ProcessingParams>> = {
  electronic: { mb_threshold_low: -18, mb_threshold_mid: -16, mb_threshold_high: -14,
                mb_ratio_low: 3.0, mb_ratio_mid: 2.5, mb_ratio_high: 2.0,
                stereo_width: 1.3, analog_saturation: false },
  hiphop:     { mb_threshold_low: -16, mb_threshold_mid: -14, mb_threshold_high: -14,
                mb_ratio_low: 3.5, mb_ratio_mid: 2.5, mb_ratio_high: 2.0,
                stereo_width: 1.1, analog_saturation: true, saturation_drive: 0.2 },
  rock:       { mb_threshold_low: -18, mb_threshold_mid: -16, mb_threshold_high: -12,
                mb_ratio_low: 2.5, mb_ratio_mid: 2.0, mb_ratio_high: 2.5,
                analog_saturation: true, saturation_drive: 0.15 },
  pop:        { mb_threshold_low: -20, mb_threshold_mid: -18, mb_threshold_high: -16,
                mb_ratio_low: 2.0, mb_ratio_mid: 2.0, mb_ratio_high: 1.8,
                stereo_width: 1.1 },
  classical:  { mb_threshold_low: -24, mb_threshold_mid: -22, mb_threshold_high: -22,
                mb_ratio_low: 1.5, mb_ratio_mid: 1.5, mb_ratio_high: 1.5,
                stereo_width: 0.95 },
  jazz:       { mb_threshold_low: -22, mb_threshold_mid: -20, mb_threshold_high: -20,
                mb_ratio_low: 2.0, mb_ratio_mid: 1.8, mb_ratio_high: 1.5,
                analog_saturation: true, saturation_drive: 0.1 },
  default:    { mb_threshold_low: -20, mb_threshold_mid: -18, mb_threshold_high: -16,
                mb_ratio_low: 2.5, mb_ratio_mid: 2.0, mb_ratio_high: 2.0 },
}

// Mirrors PART-4 PLATFORM_LUFS exactly
const PLATFORM_LUFS: Record<string, number> = {
  spotify: -14.0,
  apple_music: -16.0,
  youtube: -14.0,
  tidal: -14.0,
  amazon_music: -14.0,
  tiktok: -14.0,
  soundcloud: -14.0,
  vinyl: -14.0,
}

export function generateHeuristicParams(
  genre: string,
  targetPlatform: string,
): ProcessingParams {
  const overrides = GENRE_OVERRIDES[genre] ?? GENRE_OVERRIDES['default']
  const targetLufs = PLATFORM_LUFS[targetPlatform] ?? -14.0
  const vinyl = targetPlatform === 'vinyl'

  return {
    ...BASE_PARAMS,
    ...overrides,
    target_lufs: targetLufs,
    true_peak_ceiling: vinyl ? -3.0 : -1.0,
    vinyl_mode: vinyl,
  }
}
```

### Free-Tier Session Flow (UI Integration)

The free-tier mastering button in the session view calls `renderLocal()` directly:

1. User uploads file → `ArrayBuffer` held in `useSessionStore`
2. User clicks "Master" → `renderLocal(buffer, genre, platform)` runs in-browser
3. Progress shown via WASM callback (optional: expose `_rain_progress_callback`)
4. On completion → output `ArrayBuffer` routed to Web Audio API for playback
5. LUFS + true peak displayed in the session panel
6. "Download" button is **disabled** with upgrade CTA: "Upgrade to Spark to download"
7. On session close → both input and output `ArrayBuffer` references released (garbage collected)
8. **No API call to the backend occurs at any point in this flow**

### Tests for Task 5.10

```
✓ Free tier render: upload WAV → renderLocal() → output ArrayBuffer is non-empty
✓ Free tier render: output integratedLufs is within ±1.0 LU of target (-14.0 for Spotify)
✓ Free tier render: Web Audio API plays output without errors
✓ Free tier render: no network requests fired during entire flow (verify via Performance API or mock)
✓ Free tier render: download button shows upgrade CTA, not download link
✓ Free tier render: closing session releases ArrayBuffer (WeakRef or memory check)
```

---

## Build Commands

```bash
cd frontend
npm run dev       # dev server
npm run build     # production build
npm run typecheck # zero errors required
```

---

## Tests to Pass Before Reporting

```
✓ npm run typecheck: zero TypeScript errors
✓ npm run build: zero build errors
✓ Login flow: register → login → authenticated → redirect to /
✓ Upload zone: drag-drop file → file info displayed
✓ Web Audio preview: file loads → play → frequency data updates in spectrum
✓ WASM loader: loads rain_dsp.wasm → hash verified → module exposed
✓ Tier gate: creator-gated component shows upgrade CTA for free/spark users
✓ Waveform: renders without errors for a 30s WAV file
✓ Free tier local render: renderLocal() returns non-empty output with valid LUFS
✓ Free tier local render: zero network requests during entire flow
✓ Free tier local render: download button shows upgrade CTA
```

---

## Report Format

```
PART-5 COMPLETE
Frontend: builds clean, zero TypeScript errors
WASM loader: hash verification working
Web Audio preview: loading and playing
Upload zone: drag-drop functional
Tier gating: working on all tested tiers
Free tier local render: WASM render path working, zero network calls, upgrade CTA confirmed
Deviations from spec: [none | list any]
Ready for: PART-6 (Pipeline)
```

**HALT. Wait for instruction: "Proceed to Part 6".**

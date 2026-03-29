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
  inputBuffer: ArrayBuffer | null
  outputBuffer: ArrayBuffer | null
  inputLufs: number | null
  inputTruePeak: number | null
  outputLufs: number | null
  outputTruePeak: number | null
  rainScore: RainScore | null
  rainCertId: string | null
  errorCode: string | null
  setSession: (id: string) => void
  setStatus: (status: SessionStatus, progress?: number) => void
  setInputBuffer: (buf: ArrayBuffer) => void
  setOutputBuffer: (buf: ArrayBuffer) => void
  setAnalysis: (lufs: number, tp: number) => void
  setResult: (outputLufs: number, outputTp: number, score: RainScore, certId: string) => void
  setError: (code: string) => void
  reset: () => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  sessionId: null, status: 'idle', progress: 0,
  inputBuffer: null, outputBuffer: null,
  inputLufs: null, inputTruePeak: null,
  outputLufs: null, outputTruePeak: null,
  rainScore: null, rainCertId: null, errorCode: null,
  setSession: (id) => set({ sessionId: id, status: 'uploading' }),
  setStatus: (status, progress = 0) => set({ status, progress }),
  setInputBuffer: (buf) => set({ inputBuffer: buf }),
  setOutputBuffer: (buf) => set({ outputBuffer: buf }),
  setAnalysis: (lufs, tp) => set({ inputLufs: lufs, inputTruePeak: tp }),
  setResult: (outputLufs, outputTp, score, certId) =>
    set({ outputLufs, outputTruePeak: outputTp, rainScore: score, rainCertId: certId, status: 'complete' }),
  setError: (code) => set({ errorCode: code, status: 'failed' }),
  reset: () => set({
    sessionId: null, status: 'idle', progress: 0,
    inputBuffer: null, outputBuffer: null,
    inputLufs: null, inputTruePeak: null,
    outputLufs: null, outputTruePeak: null,
    rainScore: null, rainCertId: null, errorCode: null,
  }),
}))

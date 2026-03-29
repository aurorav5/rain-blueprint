import { useState, useCallback, useRef, useEffect } from 'react'
import { UploadZone } from '../controls/UploadZone'
import { Waveform } from '../visualizers/Waveform'
import { Spectrum } from '../visualizers/Spectrum'
import { Button } from '../common/Button'
import { useAuthStore } from '@/stores/auth'
import { useSessionStore } from '@/stores/session'
import { renderLocal } from '@/hooks/useLocalRender'
import { api, APIError } from '@/utils/api'

const PLATFORMS = ['spotify', 'apple_music', 'youtube', 'tidal', 'amazon', 'soundcloud', 'cd', 'vinyl'] as const
const GENRES = ['electronic', 'hiphop', 'rock', 'pop', 'classical', 'jazz', 'default'] as const

type Platform = typeof PLATFORMS[number]
type Genre = typeof GENRES[number]

export function MasteringTab() {
  const { isAuthenticated, tier } = useAuthStore()
  const { setStatus, setOutputBuffer, status, outputBuffer, outputLufs } = useSessionStore()

  const [file, setFile] = useState<File | null>(null)
  const [inputBuffer, setInputBuffer] = useState<ArrayBuffer | null>(null)
  const [platform, setPlatform] = useState<Platform>('spotify')
  const [genre, setGenre] = useState<Genre>('default')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const isFree = tier === 'free'

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setError(null)
    const buf = await f.arrayBuffer()
    setInputBuffer(buf)
    setStatus('idle')
    setOutputBuffer(null as unknown as ArrayBuffer)
  }, [setStatus, setOutputBuffer])

  // WebSocket for paid-tier real-time updates
  useEffect(() => {
    if (!sessionId || isFree) return
    const { accessToken } = useAuthStore.getState()
    const wsUrl = `/api/v1/sessions/${sessionId}/status?token=${accessToken ?? ''}`
    const ws = new WebSocket(wsUrl.replace(/^http/, 'ws'))
    wsRef.current = ws

    ws.onmessage = (evt) => {
      const msg: {
        status: string
        output_lufs?: number | null
        output_true_peak?: number | null
        rain_score?: unknown
        error_code?: string
        error_detail?: string
      } = JSON.parse(evt.data as string)
      setStatus(msg.status as Parameters<typeof setStatus>[0])
      if (msg.status === 'complete' && msg.output_lufs != null) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(useSessionStore.getState() as any).setOutputLufs?.(msg.output_lufs)
      }
    }
    ws.onerror = () => setError('RAIN-E300: WebSocket error')
    ws.onclose = () => { wsRef.current = null }

    return () => { ws.close(); wsRef.current = null }
  }, [sessionId, isFree, setStatus])

  const handleMaster = useCallback(async () => {
    if (!inputBuffer) return
    setError(null)

    if (isFree) {
      // Free tier: pure WASM, zero network
      setStatus('processing')
      try {
        const result = await renderLocal(inputBuffer, genre, platform)
        setOutputBuffer(result.outputBuffer)
        setStatus('complete')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'RAIN-E300: Render failed')
        setStatus('failed')
      }
      return
    }

    // Paid tier: upload to API, stream status via WebSocket
    setStatus('uploading')
    try {
      if (!file) throw new Error('No file selected')
      const session = await api.sessions.create(file, { target_platform: platform, genre, simple_mode: false })
      setSessionId(session.id)
      setStatus('analyzing')
    } catch (e) {
      setError(e instanceof APIError ? e.message : 'RAIN-E200: Upload failed')
      setStatus('failed')
    }
  }, [inputBuffer, file, isFree, platform, genre, setStatus, setOutputBuffer])

  const handleDownload = useCallback(async () => {
    if (!sessionId) return
    try {
      window.location.href = `/api/v1/sessions/${sessionId}/download`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed')
    }
  }, [sessionId])

  const isProcessing = status === 'uploading' || status === 'analyzing' || status === 'processing'
  const isComplete = status === 'complete'

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <UploadZone onFileSelected={handleFile} disabled={isProcessing} />

      {inputBuffer && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-rain-dim text-xs font-mono block mb-1">PLATFORM</label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                disabled={isProcessing}
                className="w-full bg-rain-dark border border-rain-border rounded px-2 py-1.5 text-rain-white text-xs font-mono"
              >
                {PLATFORMS.map(p => <option key={p} value={p}>{p.toUpperCase().replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-rain-dim text-xs font-mono block mb-1">GENRE</label>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value as Genre)}
                disabled={isProcessing}
                className="w-full bg-rain-dark border border-rain-border rounded px-2 py-1.5 text-rain-white text-xs font-mono"
              >
                {GENRES.map(g => <option key={g} value={g}>{g.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          <Waveform inputLufs={null} outputLufs={outputLufs} />
        </>
      )}

      {error && <p className="text-rain-red text-xs font-mono">{error}</p>}

      {status !== 'idle' && !isComplete && (
        <p className="text-rain-dim text-xs font-mono uppercase tracking-wider animate-pulse">
          {status}...
        </p>
      )}

      <div className="flex gap-3">
        <Button
          onClick={() => void handleMaster()}
          loading={isProcessing}
          disabled={!inputBuffer || isProcessing}
        >
          MASTER
        </Button>

        {isComplete && (
          isFree ? (
            <span className="text-rain-dim text-xs font-mono self-center">
              Upgrade to download
            </span>
          ) : (
            <Button variant="ghost" onClick={() => void handleDownload()}>
              DOWNLOAD
            </Button>
          )
        )}
      </div>

      {isComplete && <Spectrum />}

      {isFree && (
        <p className="text-rain-dim text-xs font-mono">
          Preview measurement — final render may differ slightly.
        </p>
      )}
    </div>
  )
}

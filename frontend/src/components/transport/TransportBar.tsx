import { useState, useRef, useCallback, useEffect } from 'react'
import { Play, Square, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import { previewEngine } from '@/utils/preview-engine'
import { useSessionStore } from '@/stores/session'

export function TransportBar() {
  const { inputBuffer, status } = useSessionStore()
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(80)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const animRef = useRef<number>(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Draw mini waveform
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !inputBuffer) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const data = new Float32Array(inputBuffer.slice(0, Math.min(inputBuffer.byteLength, 44100 * 4 * 30)))
    const w = canvas.width
    const h = canvas.height
    const step = Math.max(1, Math.floor(data.length / w))

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#141225'
    ctx.fillRect(0, 0, w, h)

    // Waveform
    ctx.strokeStyle = '#8B5CF6'
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let i = 0; i < w; i++) {
      const idx = i * step
      const val = idx < data.length ? data[idx] ?? 0 : 0
      const y = (0.5 - val * 0.4) * h
      if (i === 0) ctx.moveTo(i, y)
      else ctx.lineTo(i, y)
    }
    ctx.stroke()

    // Mirror
    ctx.strokeStyle = '#8B5CF640'
    ctx.beginPath()
    for (let i = 0; i < w; i++) {
      const idx = i * step
      const val = idx < data.length ? data[idx] ?? 0 : 0
      const y = (0.5 + val * 0.4) * h
      if (i === 0) ctx.moveTo(i, y)
      else ctx.lineTo(i, y)
    }
    ctx.stroke()
  }, [inputBuffer])

  const togglePlay = useCallback(async () => {
    if (!inputBuffer) return
    if (playing) {
      previewEngine.stop()
      setPlaying(false)
      cancelAnimationFrame(animRef.current)
    } else {
      await previewEngine.init()
      await previewEngine.loadAudioFile(inputBuffer)
      previewEngine.play()
      setPlaying(true)
      setDuration(previewEngine.currentTime ?? 0)
    }
  }, [playing, inputBuffer])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="h-12 bg-rain-surface border-b border-rain-border flex items-center gap-3 px-4 shrink-0">
      {/* Transport controls */}
      <div className="flex items-center gap-1.5">
        <button className="transport-btn" onClick={() => setCurrentTime(0)}>
          <SkipBack size={12} />
        </button>
        <button
          className={`transport-btn ${playing ? 'playing' : ''}`}
          onClick={() => void togglePlay()}
          disabled={!inputBuffer}
        >
          {playing ? <Square size={12} /> : <Play size={12} fill="currentColor" />}
        </button>
        <button className="transport-btn">
          <SkipForward size={12} />
        </button>
      </div>

      {/* Waveform scrubber */}
      <div className="flex-1 h-8 bg-rain-bg border border-rain-border rounded overflow-hidden relative">
        <canvas ref={canvasRef} width={800} height={32} className="w-full h-full" />
        {/* Playhead */}
        {duration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-px bg-rain-magenta"
            style={{ left: `${(currentTime / duration) * 100}%`, boxShadow: '0 0 4px #D946EF' }}
          />
        )}
        {/* File info */}
        {!inputBuffer && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[9px] font-mono text-rain-muted">
              Drop audio or click to browse - WAV - MP3 - FLAC - OGG - AAC
            </span>
          </div>
        )}
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 w-32">
        <Volume2 size={12} className="text-rain-dim shrink-0" />
        <input
          type="range"
          min="0"
          max="100"
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value)
            setVolume(v)
            previewEngine.setVolume((v / 100) * 2 - 1)
          }}
          className="rain-slider flex-1"
        />
      </div>

      {/* Time display */}
      <div className="text-[10px] font-mono text-rain-dim tabular-nums w-16 text-right">
        {formatTime(currentTime)}
      </div>
    </div>
  )
}

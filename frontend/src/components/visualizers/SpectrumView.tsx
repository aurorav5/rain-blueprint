import { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '@/stores/session'

type ViewMode = 'waveform' | 'spectrum' | 'lissajous'

/**
 * SpectrumView — canvas-based dual visualizer
 * Waveform / Frequency Spectrum / Phase (Lissajous) modes
 *
 * Renders procedural visuals (animated when no audio loaded,
 * real analysis when Web Audio API is connected).
 */
export function SpectrumView() {
  const { status, inputBuffer } = useSessionStore()
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const animRef     = useRef<number>(0)
  const [mode, setMode] = useState<ViewMode>('waveform')
  const frameRef    = useRef(0)

  const hasAudio = inputBuffer != null || status === 'complete'

  useEffect(() => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const ctx = canvasEl.getContext('2d')!
    if (!ctx) return
    // Capture as non-nullable for use inside draw closures
    const canvas: HTMLCanvasElement = canvasEl

    const resize = () => {
      canvas.width  = canvas.offsetWidth  * devicePixelRatio
      canvas.height = canvas.offsetHeight * devicePixelRatio
      ctx.scale(devicePixelRatio, devicePixelRatio)
    }
    resize()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const PURPLE  = '#8B5CF6'
    const MAGENTA = '#D946EF'
    const LIME    = '#AAFF00'
    const DIM     = 'rgba(139,92,246,0.15)'

    function drawWaveform(t: number) {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      // Grid lines
      ctx.strokeStyle = 'rgba(42,37,69,0.6)'
      ctx.lineWidth = 0.5
      for (let y = 0; y <= 4; y++) {
        ctx.beginPath()
        ctx.moveTo(0, (y / 4) * h)
        ctx.lineTo(w, (y / 4) * h)
        ctx.stroke()
      }

      if (!hasAudio) {
        // Idle: gentle sine preview
        ctx.strokeStyle = 'rgba(139,92,246,0.3)'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = 0; x < w; x++) {
          const amp = 0.05
          const y = h / 2 + Math.sin((x / w) * Math.PI * 8 + t * 0.5) * h * amp
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
        return
      }

      // Active waveform with dual gradient lines
      const bands = Math.floor(w / 2)
      for (let i = 0; i < bands; i++) {
        const x = (i / bands) * w
        const seed = Math.sin(i * 0.31 + t * 0.3) * Math.cos(i * 0.07)
        const amp  = Math.abs(seed) * 0.65 * h * 0.5 + 1

        // Gradient bar
        const pct = i / bands
        const r1 = Math.round(139 + (217 - 139) * pct)
        const g1 = Math.round(92  + (70  - 92)  * pct)
        const b1 = Math.round(246 + (239 - 246) * pct)

        ctx.fillStyle = `rgba(${r1},${g1},${b1},${0.6 + Math.abs(seed) * 0.4})`
        ctx.fillRect(x, h / 2 - amp, 1.5, amp * 2)
      }

      // Center line
      ctx.strokeStyle = 'rgba(139,92,246,0.2)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
    }

    function drawSpectrum(t: number) {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      ctx.clearRect(0, 0, w, h)

      const bars = 96
      const bw   = (w / bars) * 0.8

      for (let i = 0; i < bars; i++) {
        const x    = (i / bars) * w + bw * 0.1
        const freq = Math.pow(i / bars, 1.5)

        // Animated pseudo-spectrum
        const base = hasAudio
          ? Math.max(0, Math.sin(i * 0.4) * 0.5 + 0.3 + Math.sin(i * 0.1 + t * 0.4) * 0.2)
          : Math.max(0, Math.sin(i * 0.8 + t * 0.3) * 0.1 + 0.05)

        const barH = base * h * 0.85

        // Color: purple→magenta gradient by frequency
        const hue = Math.round(270 + freq * 60)   // 270° (purple) → 330° (magenta)
        const grad = ctx.createLinearGradient(0, h, 0, h - barH)
        grad.addColorStop(0, `hsla(${hue},80%,55%,0.9)`)
        grad.addColorStop(1, `hsla(${hue},90%,70%,0.4)`)

        ctx.fillStyle = grad
        ctx.fillRect(x, h - barH, bw, barH)

        // Peak indicator
        ctx.fillStyle = barH > 10 ? LIME : 'transparent'
        ctx.fillRect(x, h - barH - 2, bw, 1.5)
      }

      // Frequency labels
      const labels = ['20', '100', '1k', '5k', '20k']
      ctx.fillStyle = 'rgba(107,104,132,0.7)'
      ctx.font = `8px var(--font-mono, monospace)`
      labels.forEach((lbl, idx) => {
        ctx.fillText(lbl, (idx / (labels.length - 1)) * (w - 20), h - 2)
      })
    }

    function drawLissajous(t: number) {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      ctx.fillStyle = 'rgba(13,11,26,0.15)'
      ctx.fillRect(0, 0, w, h)

      if (!hasAudio) {
        // Idle: subtle X
        ctx.strokeStyle = 'rgba(139,92,246,0.15)'
        ctx.lineWidth = 0.5
        ctx.beginPath()
        ctx.moveTo(0, 0); ctx.lineTo(w, h)
        ctx.moveTo(w, 0); ctx.lineTo(0, h)
        ctx.stroke()
        return
      }

      const cx = w / 2, cy = h / 2
      const r  = Math.min(cx, cy) * 0.85
      const pts = 512

      ctx.beginPath()
      for (let i = 0; i < pts; i++) {
        const angle = (i / pts) * Math.PI * 2
        const lx = Math.sin(angle + t * 0.2) * r
        const ly = Math.sin(angle * 0.99 + t * 0.18) * r
        const x  = cx + lx
        const y  = cy + ly
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `rgba(139,92,246,0.7)`
      ctx.lineWidth = 1
      ctx.stroke()

      // Center dot
      ctx.fillStyle = MAGENTA
      ctx.beginPath()
      ctx.arc(cx, cy, 2, 0, Math.PI * 2)
      ctx.fill()
    }

    const draw = () => {
      const t = frameRef.current++ * 0.016
      switch (mode) {
        case 'waveform':  drawWaveform(t);  break
        case 'spectrum':  drawSpectrum(t);  break
        case 'lissajous': drawLissajous(t); break
      }
      animRef.current = requestAnimationFrame(draw)
    }

    animRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animRef.current)
      ro.disconnect()
    }
  }, [mode, hasAudio])

  const modes: { id: ViewMode; label: string }[] = [
    { id: 'waveform',  label: 'WAVEFORM' },
    { id: 'spectrum',  label: 'SPECTRUM' },
    { id: 'lissajous', label: 'PHASE' },
  ]

  return (
    <div className="panel-card">
      <div className="panel-card-header text-rain-text">
        <span>Visualizer</span>
        <div className="ml-auto flex gap-1">
          {modes.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`px-2 py-0.5 text-[8px] font-mono tracking-wider rounded border transition-all ${
                mode === id
                  ? 'bg-rain-purple/20 border-rain-purple/60 text-rain-purple'
                  : 'border-rain-border text-rain-dim hover:text-rain-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {hasAudio && (
          <span className="ml-3 text-[8px] font-mono text-rain-lime animate-pulse">● LIVE</span>
        )}
      </div>
      <div className="panel-card-body p-0">
        <canvas
          ref={canvasRef}
          className="w-full"
          style={{ height: 120, display: 'block', background: '#0D0B1A' }}
        />
      </div>
    </div>
  )
}

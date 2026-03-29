import { useEffect, useRef } from 'react'

const BAND_LABELS = ['SUB', 'LOW', 'MID', 'HI-MID', 'AIR']
const BAND_FREQS  = [60, 250, 2000, 8000, 20000]

interface Props {
  frequencyData?: Uint8Array | null
  sampleRate?: number
  height?: number
}

export function Spectrum({ frequencyData, sampleRate = 48000, height = 120 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !frequencyData || frequencyData.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#111111'
    ctx.fillRect(0, 0, W, H)

    const binCount = frequencyData.length
    const barW = W / binCount

    for (let i = 0; i < binCount; i++) {
      const v = (frequencyData[i] ?? 0) / 255
      const barH = v * H
      const hue = 200 + v * 60
      ctx.fillStyle = `hsl(${hue}, 70%, ${40 + v * 30}%)`
      ctx.fillRect(i * barW, H - barH, barW - 1, barH)
    }

    // Platform compliance line at -1 dBTP (approx 90% of full scale)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = '#FFB347'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, H * 0.10)
    ctx.lineTo(W, H * 0.10)
    ctx.stroke()
    ctx.setLineDash([])

    ctx.fillStyle = '#666666'
    ctx.font = '9px monospace'
    ctx.fillText('−1 dBTP', 4, H * 0.10 - 2)
  }, [frequencyData, sampleRate, height])

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={800}
        height={height}
        className="w-full rounded"
        style={{ height }}
      />
      <div className="absolute bottom-1 left-0 right-0 flex justify-between px-2 pointer-events-none">
        {BAND_LABELS.map((label, i) => (
          <span key={label} className="text-[9px] font-mono text-rain-dim">
            {label}<br /><span className="text-[8px]">{BAND_FREQS[i]}Hz</span>
          </span>
        ))}
      </div>
    </div>
  )
}

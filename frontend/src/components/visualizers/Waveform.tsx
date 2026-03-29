import { useEffect, useRef } from 'react'

interface Props {
  audioBuffer?: AudioBuffer | null
  liveData?: Uint8Array | null
  inputLufs?: number | null
  outputLufs?: number | null
  height?: number
}

export function Waveform({ audioBuffer, liveData, inputLufs, outputLufs, height = 80 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#0A0A0A'
    ctx.fillRect(0, 0, W, H)

    if (liveData && liveData.length > 0) {
      ctx.beginPath()
      ctx.strokeStyle = '#00D4FF'
      ctx.lineWidth = 1
      const sliceW = W / liveData.length
      for (let i = 0; i < liveData.length; i++) {
        const v = (liveData[i] ?? 128) / 128.0
        const y = (v * H) / 2
        i === 0 ? ctx.moveTo(i * sliceW, y) : ctx.lineTo(i * sliceW, y)
      }
      ctx.stroke()
    } else if (audioBuffer) {
      const data = audioBuffer.getChannelData(0)
      const step = Math.ceil(data.length / W)
      ctx.beginPath()
      ctx.strokeStyle = '#666666'
      ctx.lineWidth = 1
      for (let i = 0; i < W; i++) {
        let min = 1, max = -1
        for (let j = 0; j < step; j++) {
          const datum = data[i * step + j]
          if (datum !== undefined) {
            if (datum < min) min = datum
            if (datum > max) max = datum
          }
        }
        ctx.moveTo(i, (1 + min) * H / 2)
        ctx.lineTo(i, (1 + max) * H / 2)
      }
      ctx.stroke()
    }

    // LUFS overlay
    if (inputLufs !== null && inputLufs !== undefined) {
      ctx.fillStyle = '#666666'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.fillText(`IN ${inputLufs.toFixed(1)} LUFS`, 8, 14)
    }
    if (outputLufs !== null && outputLufs !== undefined) {
      ctx.fillStyle = '#00D4FF'
      ctx.font = '10px JetBrains Mono, monospace'
      ctx.fillText(`OUT ${outputLufs.toFixed(1)} LUFS`, 8, 28)
    }
  }, [audioBuffer, liveData, inputLufs, outputLufs])

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={height}
      className="w-full rounded bg-rain-black"
      style={{ height }}
    />
  )
}

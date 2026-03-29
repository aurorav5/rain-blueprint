interface RainScoreGaugeProps {
  score: number // 0-100
  label?: string
  size?: number
}

export function RainScoreGauge({ score, label = 'RAIN SCORE', size = 120 }: RainScoreGaugeProps) {
  const r = size / 2 - 8
  const circumference = 2 * Math.PI * r
  const progress = Math.min(100, Math.max(0, score)) / 100
  const dashOffset = circumference * (1 - progress)

  const getColor = (s: number): string => {
    if (s >= 80) return '#4AFF8A'
    if (s >= 60) return '#AAFF00'
    if (s >= 40) return '#FFB347'
    return '#FF4444'
  }

  const color = getColor(score)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="score-gauge" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Track */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            className="score-gauge-track"
          />
          {/* Fill */}
          <circle
            cx={size / 2} cy={size / 2} r={r}
            className="score-gauge-fill"
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ filter: `drop-shadow(0 0 8px ${color}60)` }}
          />
        </svg>
        <div className="score-gauge-value">
          <span className="text-3xl font-mono" style={{ color }}>{Math.round(score)}</span>
          <span className="text-[8px] font-mono text-rain-dim mt-1">PSS</span>
        </div>
      </div>
      <span className="text-[9px] font-mono font-bold tracking-widest text-rain-dim uppercase">
        {label}
      </span>
    </div>
  )
}

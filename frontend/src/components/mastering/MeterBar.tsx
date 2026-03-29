interface MeterBarProps {
  value: number // 0-1 normalized
  peak?: number // 0-1
  height?: number
  label?: string
}

export function MeterBar({ value, peak, height = 140, label }: MeterBarProps) {
  const fillHeight = Math.min(1, Math.max(0, value)) * 100

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="meter-bar" style={{ height }}>
        <div className="meter-bar-fill" style={{ height: `${fillHeight}%` }} />
        {peak != null && (
          <div
            className="absolute left-0 right-0 h-[2px] bg-rain-red"
            style={{ bottom: `${peak * 100}%`, boxShadow: '0 0 4px rgba(255,68,68,0.6)' }}
          />
        )}
      </div>
      {label && (
        <span className="text-[8px] font-mono text-rain-dim">{label}</span>
      )}
    </div>
  )
}

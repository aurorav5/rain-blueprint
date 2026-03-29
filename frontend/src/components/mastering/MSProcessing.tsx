interface MSProcessingProps {
  enabled: boolean
  midGain: number
  sideGain: number
  stereoWidth: number
  onEnabledChange: (v: boolean) => void
  onMidGainChange: (v: number) => void
  onSideGainChange: (v: number) => void
  onStereoWidthChange: (v: number) => void
}

export function MSProcessing({
  enabled, midGain, sideGain, stereoWidth,
  onEnabledChange, onMidGainChange, onSideGainChange, onStereoWidthChange,
}: MSProcessingProps) {
  return (
    <div className="panel-card flex-1">
      <div className="panel-card-header">
        <span className="text-rain-text">M/S Processing</span>
        <button
          onClick={() => onEnabledChange(!enabled)}
          className={`ml-auto w-8 h-4 rounded-full transition-colors ${enabled ? 'bg-rain-purple' : 'bg-rain-muted'}`}
        >
          <div className={`w-3 h-3 rounded-full bg-rain-text transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </div>
      <div className={`panel-card-body space-y-3 ${!enabled ? 'opacity-40 pointer-events-none' : ''}`}>
        <SliderRow label="LR Crossover (Mono Below)" value={120} unit="Hz" min={20} max={300} onChange={() => {}} />
        <SliderRow label="Side HPF Cutoff" value={200} unit="Hz" min={20} max={500} onChange={() => {}} />
        <SliderRow label="Mid Gain" value={midGain} unit="dB" min={-6} max={6} onChange={onMidGainChange} step={0.1} />
        <SliderRow label="Side Gain" value={sideGain} unit="dB" min={-6} max={6} onChange={onSideGainChange} step={0.1} />
        <SliderRow label="Stereo Width" value={stereoWidth * 100} unit="" min={0} max={200} onChange={(v) => onStereoWidthChange(v / 100)} step={1} displayValue={`${(stereoWidth * 100).toFixed(0)}%`} />
      </div>
    </div>
  )
}

function SliderRow({ label, value, unit, min, max, onChange, step = 1, displayValue }: {
  label: string; value: number; unit: string; min: number; max: number;
  onChange: (v: number) => void; step?: number; displayValue?: string;
}) {
  return (
    <div>
      <div className="flex justify-between text-[9px] font-mono text-rain-dim mb-1">
        <span>{label}</span>
        <span className="text-rain-cyan">{displayValue ?? `${value} ${unit}`}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={typeof value === 'number' ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rain-slider"
      />
    </div>
  )
}

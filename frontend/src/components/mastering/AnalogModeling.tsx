const UNITS = [
  { id: 'tape', name: 'Manley Massive Passive', type: 'EQ', badge: 'TUBE' },
  { id: 'tube', name: 'Shadow Hills Compressor', type: 'COMP', badge: 'CLASS-A' },
  { id: 'transistor', name: 'Neve 1073', type: 'PREAMP', badge: 'DISCRETE' },
  { id: 'tape2', name: 'SSL G-Bus Compressor', type: 'BUS', badge: 'VCA' },
]

interface AnalogModelingProps {
  mode: string
  drive: number
  onModeChange: (mode: string) => void
  onDriveChange: (drive: number) => void
}

export function AnalogModeling({ mode, drive, onModeChange, onDriveChange }: AnalogModelingProps) {
  return (
    <div className="panel-card flex-1">
      <div className="panel-card-header">
        <span className="text-rain-text">Analog Soul Modeling</span>
        <span className="ml-auto px-2 py-0.5 bg-rain-panel border border-rain-orange/30 rounded text-[8px] font-mono text-rain-orange">
          MOORE-GLASBERG 2007
        </span>
      </div>
      <div className="panel-card-body space-y-3">
        {/* Unit cards */}
        <div className="grid grid-cols-2 gap-2">
          {UNITS.map((unit) => (
            <div
              key={unit.id}
              className={`analog-unit ${mode === unit.id ? 'selected' : ''}`}
              onClick={() => onModeChange(unit.id)}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono font-bold text-rain-text">{unit.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[8px] font-mono text-rain-dim">{unit.type}</span>
                <span className="px-1.5 py-0.5 bg-rain-bg border border-rain-border rounded text-[7px] font-mono text-rain-purple">
                  {unit.badge}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Drive slider */}
        <div>
          <div className="flex justify-between text-[9px] font-mono text-rain-dim mb-1">
            <span>DRIVE</span>
            <span className="text-rain-orange">{(drive * 100).toFixed(0)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={drive * 100}
            onChange={(e) => onDriveChange(Number(e.target.value) / 100)}
            className="rain-slider"
          />
        </div>
      </div>
    </div>
  )
}

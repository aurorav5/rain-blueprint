import { MacroKnob } from './MacroKnob'

interface CreativeMacrosProps {
  brighten: number
  glue: number
  width: number
  punch: number
  warmth: number
  onChange: (key: string, value: number) => void
}

const TENSION_PAIRS: { keys: [string, string]; message: string }[] = [
  { keys: ['brighten', 'warmth'], message: 'High shelf + THD boost may cause harshness' },
  { keys: ['glue', 'width'],     message: 'Heavy compression + wide stereo may cause instability' },
  { keys: ['glue', 'punch'],     message: 'Bus compression + transient boost creates conflicting dynamics' },
  { keys: ['warmth', 'punch'],   message: 'Saturation + transient emphasis may over-distort attacks' },
]

export function CreativeMacros({ brighten, glue, width, punch, warmth, onChange }: CreativeMacrosProps) {
  const macroMap: Record<string, number> = { brighten, glue, width, punch, warmth }

  const tensionWarning = TENSION_PAIRS.find(
    ({ keys }) => (macroMap[keys[0]] ?? 0) > 7.0 && (macroMap[keys[1]] ?? 0) > 7.0
  )

  return (
    <div className="panel-card flex-1">
      <div className="panel-card-header text-rain-text">Creative Macro System</div>
      <div className="panel-card-body">
        {/* Tension warning banner */}
        {tensionWarning && (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded border mb-3 text-[9px] font-mono"
            style={{
              background: 'rgba(251,146,60,0.15)',
              borderColor: 'rgba(251,146,60,0.4)',
              color: '#FBB440',
            }}
          >
            <span>⚠</span>
            <span>{tensionWarning.message}</span>
          </div>
        )}

        <div className="flex justify-around flex-wrap gap-4">
          <MacroKnob
            label="BRIGHTEN"
            value={brighten}
            onChange={(v) => onChange('brighten', v)}
            color="#AAFF00"
            subParams={['High shelf gain', 'Air band (12-16kHz)', 'Side high shelf', 'Transient presence']}
          />
          <MacroKnob
            label="GLUE"
            value={glue}
            onChange={(v) => onChange('glue', v)}
            color="#8B5CF6"
            subParams={['Bus comp ratio', 'Knee width', 'Attack', 'Release', 'AR tightening']}
          />
          <MacroKnob
            label="WIDTH"
            value={width}
            onChange={(v) => onChange('width', v)}
            color="#00D4FF"
            subParams={['Side channel gain', 'Side HPF cutoff', 'Stereo decorrelation', 'Bass micro-delay']}
          />
          <MacroKnob
            label="PUNCH"
            value={punch}
            onChange={(v) => onChange('punch', v)}
            color="#F97316"
            subParams={['Transient enhance', 'Kick transient boost', 'Snare lookahead', 'Low-end tightening']}
          />
          <MacroKnob
            label="WARMTH"
            value={warmth}
            onChange={(v) => onChange('warmth', v)}
            color="#D946EF"
            subParams={['THD amount', 'Low-mid harmonic', 'HF roll-off', 'Micro-drift amount']}
          />
        </div>
      </div>
    </div>
  )
}

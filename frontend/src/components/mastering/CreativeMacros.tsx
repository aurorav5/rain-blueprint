import { MacroKnob } from './MacroKnob'

interface CreativeMacrosProps {
  brighten: number
  glue: number
  width: number
  punch: number
  warmth: number
  onChange: (key: string, value: number) => void
}

export function CreativeMacros({ brighten, glue, width, punch, warmth, onChange }: CreativeMacrosProps) {
  return (
    <div className="panel-card flex-1">
      <div className="panel-card-header text-rain-text">Creative Macro System</div>
      <div className="panel-card-body">
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

import { TierGate } from '../common/TierGate'

const STEM_SLOTS = ['VOCALS', 'DRUMS', 'BASS', 'INSTRUMENTS', 'FX', 'ACCOMPANIMENT']

export function StemsTab() {
  return (
    <TierGate requiredTier="creator" feature="Stem mastering">
      <div className="p-4 grid grid-cols-2 gap-3">
        {STEM_SLOTS.map((slot) => (
          <div
            key={slot}
            className="border border-rain-border rounded p-3 flex flex-col items-center gap-2 min-h-[80px] cursor-pointer hover:border-rain-muted transition-colors"
          >
            <span className="text-rain-dim text-[10px] font-mono tracking-widest">{slot}</span>
            <span className="text-rain-muted text-xs">+ DROP FILE</span>
          </div>
        ))}
      </div>
    </TierGate>
  )
}

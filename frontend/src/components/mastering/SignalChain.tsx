import { useSessionStore } from '@/stores/session'

/**
 * 12-stage signal chain matching Aurora's pipeline depth
 * but using RAIN's naming conventions (RAIN-MASTER-SPEC-v6.0)
 * No stage numbers per Phil's direction.
 */
const STAGES: { label: string; sub: string }[] = [
  { label: 'UPLOAD',     sub: 'PCM / WAV' },
  { label: 'ANALYSIS',   sub: '43-dim feat' },
  { label: 'GENRE',      sub: 'Classifier' },
  { label: 'INFERENCE',  sub: 'RainNet v2' },
  { label: 'VALIDATE',   sub: 'Schema gate' },
  { label: 'M/S PROC',   sub: 'Mid/Side' },
  { label: 'MB COMP',    sub: '3-band dyn' },
  { label: 'EQ',         sub: '8-band LPF' },
  { label: 'ANALOG',     sub: 'THD engine' },
  { label: 'SAIL',       sub: 'Limiter' },
  { label: 'VERIFY',     sub: 'LUFS check' },
  { label: 'COMPLETE',   sub: 'RAIN-CERT' },
]

/** Maps session store status → active stage index */
const STATUS_TO_STAGE: Record<string, number> = {
  idle:       -1,
  uploading:   0,
  analyzing:   1,
  processing:  5,   // enters M/S Proc when DSP starts
  complete:   11,
  failed:     -1,
}

export function SignalChain() {
  const { status } = useSessionStore()
  const activeIdx = STATUS_TO_STAGE[status] ?? -1

  return (
    <div className="panel-card">
      <div className="panel-card-header text-rain-text">
        Signal Chain
        <span className="ml-auto text-[9px] font-mono text-rain-dim tracking-widest">
          RAIN-DSP v6.0 · 12 STAGES
        </span>
      </div>
      <div className="panel-card-body">
        <div className="flex gap-1 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {STAGES.map((stage, i) => {
            const isDone   = i < activeIdx
            const isActive = i === activeIdx
            const isBackground = i === 11 && status !== 'complete'

            let borderColor = 'border-rain-border'
            let textColor   = 'text-rain-muted'
            let subColor    = 'text-rain-muted opacity-50'
            let bg          = 'bg-rain-surface'

            if (isDone) {
              borderColor = 'border-rain-lime/40'
              textColor   = 'text-rain-lime'
              subColor    = 'text-rain-lime opacity-60'
            } else if (isActive) {
              borderColor = 'border-rain-purple'
              textColor   = 'text-rain-text'
              subColor    = 'text-rain-purple'
              bg          = 'bg-rain-purple/10'
            }

            return (
              <div
                key={stage.label}
                className={`flex flex-col items-center min-w-[68px] px-1.5 py-2 border rounded
                  transition-all duration-300 shrink-0 ${bg} ${borderColor}`}
              >
                {/* Active pulse dot */}
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-rain-purple mb-1 animate-pulse" />
                )}
                {/* Done checkmark */}
                {isDone && (
                  <div className="text-rain-lime text-[8px] mb-0.5">✓</div>
                )}
                {/* Idle/pending dot */}
                {!isActive && !isDone && (
                  <div className={`w-1 h-1 rounded-full mb-1 ${isBackground ? 'bg-rain-muted/30' : 'bg-rain-muted/20'}`} />
                )}

                <span className={`text-[8.5px] font-mono font-bold tracking-widest text-center leading-tight ${textColor}`}>
                  {stage.label}
                </span>
                <span className={`text-[7px] font-mono text-center mt-0.5 leading-tight ${subColor}`}>
                  {stage.sub}
                </span>

                {/* Connector arrow (between stages) */}
              </div>
            )
          })}
        </div>

        {/* Progress connector line */}
        <div className="relative mt-1.5 h-px bg-rain-border rounded-full overflow-hidden">
          <div
            className="absolute left-0 top-0 h-full bg-gradient-to-r from-rain-purple to-rain-magenta rounded-full transition-all duration-700"
            style={{
              width: activeIdx < 0 ? '0%' : `${((activeIdx + 1) / STAGES.length) * 100}%`,
            }}
          />
        </div>

        <div className="flex justify-between mt-1">
          <span className="text-[7px] font-mono text-rain-muted">INPUT</span>
          <span className="text-[7px] font-mono text-rain-muted">
            {activeIdx >= 0
              ? `${STAGES[activeIdx]?.label ?? ''} · Stage ${activeIdx + 1}/${STAGES.length}`
              : status === 'complete' ? 'COMPLETE · RAIN-CERT ISSUED' : 'IDLE'}
          </span>
          <span className="text-[7px] font-mono text-rain-muted">OUTPUT</span>
        </div>
      </div>
    </div>
  )
}

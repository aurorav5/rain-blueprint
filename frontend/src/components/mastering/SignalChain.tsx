import { useSessionStore } from '@/stores/session'

const STAGES = [
  'UPLOAD', 'ANALYSIS', 'INFERENCE', 'VALIDATE',
  'DSP', 'VERIFY', 'COMPLETE', 'BACKGROUND',
]

const STATUS_TO_STAGE: Record<string, number> = {
  idle: -1,
  uploading: 0,
  analyzing: 1,
  processing: 4,
  complete: 6,
  failed: -1,
}

export function SignalChain() {
  const { status } = useSessionStore()
  const activeIdx = STATUS_TO_STAGE[status] ?? -1

  return (
    <div className="panel-card">
      <div className="panel-card-header text-rain-text">Signal Chain</div>
      <div className="panel-card-body">
        <div className="flex gap-1.5 flex-wrap">
          {STAGES.map((stage, i) => {
            let cls = 'chain-stage'
            if (i < activeIdx) cls += ' completed'
            else if (i === activeIdx) cls += ' active'
            return <div key={stage} className={cls}>{stage}</div>
          })}
        </div>
      </div>
    </div>
  )
}

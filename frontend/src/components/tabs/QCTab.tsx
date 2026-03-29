import { useState } from 'react'
import { useAuthStore } from '@/stores/auth'

// ── Types ──────────────────────────────────────────────────────────────────

type CheckStatus = 'pass' | 'warn' | 'fail' | 'locked'

interface QCCheck {
  id: number
  name: string
  detail: string
  status: CheckStatus
  flag?: string
  locked?: boolean
  auto?: boolean
}

// ── Static data ────────────────────────────────────────────────────────────

const QC_CHECKS: QCCheck[] = [
  { id: 1,  name: 'Digital Clipping',        detail: 'No clipped samples detected',                       status: 'pass' },
  { id: 2,  name: 'Inter-Sample Peaks',       detail: '-0.8 dBTP max, within ceiling',                    status: 'pass' },
  { id: 3,  name: 'Phase Cancellation',       detail: 'Mono correlation: 0.94',                            status: 'pass' },
  { id: 4,  name: 'Codec Pre-Ring',           detail: 'No pre-ring artifacts at 20kHz',                   status: 'pass' },
  { id: 5,  name: 'Pops / Clicks',            detail: '0 transient artifacts detected',                   status: 'pass' },
  { id: 6,  name: 'Bad Edits / Glitches',     detail: 'No discontinuities detected',                      status: 'pass' },
  { id: 7,  name: 'DC Offset',                detail: '< 0.1% DC component',                              status: 'pass', auto: true },
  { id: 8,  name: 'Head / Tail Silence',      detail: '0.3s head · 0.5s tail — within spec',              status: 'pass' },
  { id: 9,  name: 'Sample Rate',              detail: '44100 Hz detected · Matches project',              status: 'pass' },
  { id: 10, name: 'Bit-Depth Integrity',      detail: '24-bit depth preserved',                           status: 'pass' },
  { id: 11, name: 'Loudness Compliance',      detail: '-14.2 LUFS integrated · Target: -14.0 ±0.5',       status: 'pass' },
  { id: 12, name: 'True Peak Compliance',     detail: '-1.1 dBTP · Ceiling: -1.0 dBTP',                   status: 'warn', flag: '0.1 dB over ceiling' },
  { id: 13, name: 'LRA Compliance',           detail: '8.4 LU · Target: 6–14 LU',                         status: 'pass' },
  { id: 14, name: 'Mono Compatibility',       detail: 'ΔE = 1.8 dB · Below 3 dB threshold',              status: 'pass' },
  { id: 15, name: 'Sibilance',                detail: '2 sibilant events at 7.8kHz',                      status: 'warn' },
  { id: 16, name: 'Low-Frequency Rumble',     detail: 'No subsonic content above -60 dBFS',               status: 'pass', auto: true },
  { id: 17, name: 'Stereo Balance',           detail: 'L/R balance: +0.2 dB (within ±0.5)',              status: 'pass' },
  { id: 18, name: 'Perceptual Quality (PEAQ)', detail: 'ODG: -0.3 · Excellent',                           status: 'pass', locked: true },
]

const PLATFORM_STATUS: { name: string; status: 'pass' | 'warn' | 'fail' }[] = [
  { name: 'Spotify',     status: 'pass' },
  { name: 'Apple Music', status: 'pass' },
  { name: 'YouTube',     status: 'warn' },
  { name: 'Tidal',       status: 'pass' },
]

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'pass')
    return <span className="text-[#AAFF00] text-sm leading-none select-none">✓</span>
  if (status === 'warn')
    return <span className="text-amber-400 text-sm leading-none select-none">⚠</span>
  if (status === 'fail')
    return <span className="text-[#FF4444] text-sm leading-none select-none">✗</span>
  // locked
  return <span className="text-rain-dim text-sm leading-none select-none">🔒</span>
}

function StatusBadge({ status, flag }: { status: CheckStatus; flag?: string }) {
  if (status === 'pass')
    return (
      <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider bg-[#AAFF00]/15 text-[#AAFF00] border border-[#AAFF00]/30">
        PASS
      </span>
    )
  if (status === 'warn')
    return (
      <span
        className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30"
        title={flag}
      >
        WARN
      </span>
    )
  if (status === 'fail')
    return (
      <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider bg-[#FF4444]/15 text-[#FF4444] border border-[#FF4444]/30">
        FAIL
      </span>
    )
  return (
    <span className="shrink-0 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider bg-[#8B5CF6]/15 text-[#8B5CF6] border border-[#8B5CF6]/30">
      LOCKED
    </span>
  )
}

function CheckRow({ check, isFree }: { check: QCCheck; isFree: boolean }) {
  const isLocked = check.locked && isFree
  const effectiveStatus: CheckStatus = isLocked ? 'locked' : check.status

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 rounded border transition-colors ${
        effectiveStatus === 'locked'
          ? 'border-[#2A2545]/60 bg-[#0D0B1A]/40 opacity-70'
          : effectiveStatus === 'warn'
          ? 'border-amber-500/20 bg-amber-500/5'
          : effectiveStatus === 'fail'
          ? 'border-[#FF4444]/20 bg-[#FF4444]/5'
          : 'border-[#2A2545] bg-[#141225]/50'
      }`}
    >
      {/* Icon */}
      <div className="w-4 h-4 flex items-center justify-center shrink-0 mt-px">
        <StatusIcon status={effectiveStatus} />
      </div>

      {/* Name + detail */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`text-[10px] font-mono font-semibold tracking-wide ${
            effectiveStatus === 'locked' ? 'text-rain-dim' : 'text-[#E8E6F0]'
          }`}>
            {check.name}
          </span>
          {isLocked && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider bg-[#8B5CF6]/20 text-[#8B5CF6] border border-[#8B5CF6]/30">
              🔒 Studio Pro
            </span>
          )}
          {check.flag && !isLocked && (
            <span className="text-[8px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              {check.flag}
            </span>
          )}
        </div>
        <p className="text-[9px] font-mono text-rain-dim mt-0.5 leading-snug">
          {effectiveStatus === 'locked' ? '——— Upgrade to Studio Pro to view ———' : check.detail}
        </p>
      </div>

      {/* Badge */}
      <StatusBadge status={effectiveStatus} flag={check.flag} />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function QCTab() {
  const { tierGte } = useAuthStore()
  const isStudioPro = tierGte('studio_pro')
  const isFreeForLock = !isStudioPro

  const [isRunning, setIsRunning] = useState(false)
  const [isRemediating, setIsRemediating] = useState(false)
  const [hasRun, setHasRun] = useState(true) // show mock data by default

  const passCount  = QC_CHECKS.filter(c => c.status === 'pass').length
  const warnCount  = QC_CHECKS.filter(c => c.status === 'warn').length
  const failCount  = QC_CHECKS.filter(c => c.status === 'fail').length
  const autoCount  = QC_CHECKS.filter(c => c.auto === true).length

  // Simulate running
  const handleRunQC = () => {
    if (isRunning) return
    setIsRunning(true)
    setTimeout(() => { setIsRunning(false); setHasRun(true) }, 1800)
  }

  const handleRemediate = () => {
    if (isRemediating || !hasRun) return
    setIsRemediating(true)
    setTimeout(() => setIsRemediating(false), 2200)
  }

  const overallBadgeColor =
    failCount > 0
      ? 'bg-[#FF4444]/15 text-[#FF4444] border-[#FF4444]/30'
      : warnCount > 0
      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
      : 'bg-[#AAFF00]/15 text-[#AAFF00] border-[#AAFF00]/30'

  const overallLabel = failCount > 0 ? 'FAIL' : warnCount > 0 ? 'WARN' : 'PASS'

  return (
    <div className="p-4 space-y-4 max-w-4xl">

      {/* ── Summary header ─────────────────────────────────────────────── */}
      <div className="panel-card">
        <div className="panel-card-header">
          <span className="text-[10px] font-mono tracking-widest text-[#E8E6F0]">
            QC ANALYSIS — RAIN ENGINE
          </span>
          <span className={`ml-auto px-2 py-0.5 rounded border text-[9px] font-mono font-bold tracking-wider ${overallBadgeColor}`}>
            {overallLabel}
          </span>
        </div>
        <div className="panel-card-body py-3">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Counters */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="text-[#AAFF00] text-base font-mono font-black">{passCount}</span>
                <span className="text-[9px] font-mono text-rain-dim tracking-widest">PASS</span>
              </div>
              <div className="w-px h-6 bg-[#2A2545]" />
              <div className="flex items-center gap-2">
                <span className="text-amber-400 text-base font-mono font-black">{warnCount}</span>
                <span className="text-[9px] font-mono text-rain-dim tracking-widest">WARN</span>
              </div>
              <div className="w-px h-6 bg-[#2A2545]" />
              <div className="flex items-center gap-2">
                <span className="text-[#FF4444] text-base font-mono font-black">{failCount}</span>
                <span className="text-[9px] font-mono text-rain-dim tracking-widest">FAIL</span>
              </div>
              <div className="w-px h-6 bg-[#2A2545]" />
              <div className="flex items-center gap-2">
                <span className="text-[#60A5FA] text-base font-mono font-black">{autoCount}</span>
                <span className="text-[9px] font-mono text-rain-dim tracking-widest">AUTO</span>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleRunQC}
                disabled={isRunning}
                className={`flex items-center gap-2 px-4 py-2 rounded border text-[10px] font-mono font-bold tracking-wider transition-all ${
                  isRunning
                    ? 'bg-[#8B5CF6]/10 border-[#8B5CF6]/30 text-[#8B5CF6] cursor-wait'
                    : 'bg-[#8B5CF6]/20 border-[#8B5CF6]/50 text-[#8B5CF6] hover:bg-[#8B5CF6]/30 hover:shadow-[0_0_12px_rgba(139,92,246,0.3)]'
                }`}
              >
                {isRunning ? (
                  <>
                    <span className="inline-block w-2.5 h-2.5 border border-[#8B5CF6] border-t-transparent rounded-full animate-spin" />
                    SCANNING…
                  </>
                ) : 'RUN QC ANALYSIS'}
              </button>

              <button
                onClick={handleRemediate}
                disabled={isRemediating || !hasRun}
                className={`flex items-center gap-2 px-4 py-2 rounded border text-[10px] font-mono font-bold tracking-wider transition-all ${
                  !hasRun
                    ? 'bg-[#141225] border-[#2A2545] text-rain-dim cursor-not-allowed opacity-50'
                    : isRemediating
                    ? 'bg-[#D946EF]/10 border-[#D946EF]/30 text-[#D946EF] cursor-wait'
                    : 'bg-[#D946EF]/15 border-[#D946EF]/40 text-[#D946EF] hover:bg-[#D946EF]/25 hover:shadow-[0_0_12px_rgba(217,70,239,0.25)]'
                }`}
              >
                {isRemediating ? (
                  <>
                    <span className="inline-block w-2.5 h-2.5 border border-[#D946EF] border-t-transparent rounded-full animate-spin" />
                    REMEDIATING…
                  </>
                ) : 'AUTO-REMEDIATE'}
              </button>
            </div>
          </div>

          {/* Certificate Eligible badge */}
          {failCount === 0 && autoCount >= 0 && (
            <div className="mt-3 pt-3 border-t border-[#2A2545]">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-[9px] font-mono font-bold tracking-widest bg-[#AAFF00]/10 text-[#AAFF00] border-[#AAFF00]/40">
                RAIN-CERT ELIGIBLE ✓
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Check grid ─────────────────────────────────────────────────── */}
      <div className="panel-card">
        <div className="panel-card-header">
          <span className="text-[10px] font-mono tracking-widest text-[#E8E6F0]">
            18 QC CHECKS
          </span>
          <span className="ml-auto text-[9px] font-mono text-rain-dim">
            {hasRun ? 'Last run: just now' : 'Not yet analysed'}
          </span>
        </div>
        <div className="panel-card-body">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {QC_CHECKS.map(check => (
              <CheckRow key={check.id} check={check} isFree={isFreeForLock} />
            ))}
          </div>
        </div>
      </div>

      {/* ── Platform compliance status bar ─────────────────────────────── */}
      <div className="panel-card">
        <div className="panel-card-header">
          <span className="text-[10px] font-mono tracking-widest text-[#E8E6F0]">
            PLATFORM COMPLIANCE
          </span>
        </div>
        <div className="panel-card-body py-3">
          <div className="flex items-center gap-1 flex-wrap text-[10px] font-mono">
            <span className="text-rain-dim mr-1 tracking-wider">STATUS:</span>
            {PLATFORM_STATUS.map((p, i) => (
              <span key={p.name} className="flex items-center gap-1">
                {i > 0 && <span className="text-[#2A2545] mx-1">·</span>}
                <span className="text-[#E8E6F0]">{p.name}</span>
                {p.status === 'pass' && <span className="text-[#AAFF00]">✓</span>}
                {p.status === 'warn' && <span className="text-amber-400">⚠</span>}
                {p.status === 'fail' && <span className="text-[#FF4444]">✗</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}

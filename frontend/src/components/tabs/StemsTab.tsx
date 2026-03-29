import { useState, useCallback, useMemo } from 'react'
import { TierGate } from '../common/TierGate'

// ─── Types ────────────────────────────────────────────────────────────────────

type StemType = 'VOCAL' | 'BASS' | 'DRUM' | 'INSTRUMENT' | 'KEYS' | 'SYNTH' | 'FX'
type QualityStatus = 'PASS' | 'WARN' | 'FAIL'
type SeparationPhase = 'idle' | 'running' | 'done'

interface StemDef {
  id: string
  label: string
  type: StemType
  borderColor: string
  badgeColor: string
  waveColor: string
  confidence: number
  levelDbfs: number
  /** Deterministic waveform bar heights 0–100, pre-seeded so they don't re-render each tick */
  waveHeights: readonly number[]
}

interface StemState {
  muted: boolean
  solo: boolean
  level: number // -inf (0) … 0 dBFS as fader value 0–100
}

interface ConflictEntry {
  stemA: string
  stemB: string
  severity: 'low' | 'medium' | 'high'
  description: string
}

// ─── Static stem definitions ──────────────────────────────────────────────────

// Wave heights are fixed (not random) to avoid re-render flicker and comply with
// determinism rules. These are aesthetically designed static shapes per stem.
const WAVE_PRESETS: Record<string, readonly number[]> = {
  lead_vocals: [20,35,55,72,80,90,85,70,60,75,88,92,78,65,50,42,58,74,82,89,76,60,44,30,48,66,80,88,84,72,56,40,28,44,62,78,86,80,68,52],
  backing_vocals:[12,22,38,50,58,62,55,45,35,48,60,66,58,46,34,26,38,52,62,68,58,44,30,20,32,46,58,64,60,50,38,28,18,30,44,56,64,58,48,36],
  bass:          [80,90,95,88,75,60,70,85,92,80,65,50,60,78,88,82,68,55,65,80,90,85,72,60,72,86,94,88,76,62,70,84,92,80,66,54,64,78,86,80],
  kick:          [95,20,5,5,90,15,5,5,92,18,5,5,88,12,5,5,94,16,5,5,90,14,5,5,86,10,5,5,92,20,5,5,88,14,5,5,90,18,5,5],
  snare:         [5,5,5,88,5,5,5,82,5,5,5,90,5,5,5,85,5,5,5,88,5,5,5,80,5,5,5,86,5,5,5,84,5,5,5,88,5,5,5,82],
  hi_hats:       [40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60,40,60],
  cymbals:       [30,50,70,85,75,55,40,60,78,88,80,62,46,34,52,70,82,86,76,58,44,32,48,68,80,84,74,56,40,28,46,66,78,82,72,54,38,26,44,64],
  room:          [22,30,38,44,48,50,48,44,40,42,46,50,48,44,40,36,38,42,46,50,48,42,36,32,36,42,48,52,50,44,38,32,28,34,40,46,50,48,42,36],
  guitar:        [35,55,70,80,75,60,45,65,78,84,76,60,44,32,50,68,78,80,70,54,38,28,44,62,74,78,68,52,36,24,40,58,70,74,64,50,34,24,38,56],
  piano:         [25,45,65,78,85,80,68,52,38,56,72,82,86,76,60,44,30,50,68,80,84,74,58,40,28,48,66,78,82,72,56,38,26,46,64,76,80,70,54,36],
  synths_pads:   [15,25,38,52,64,72,78,80,76,68,58,48,40,34,30,32,38,46,56,66,74,78,76,68,58,46,36,28,26,32,40,50,60,70,76,78,72,62,50,38],
  fx_atmo:       [10,15,20,28,35,42,48,52,55,54,50,44,36,28,22,20,25,32,40,48,54,58,56,50,42,34,26,20,18,24,32,42,50,56,58,54,46,36,26,18],
}

const STEM_DEFS: readonly StemDef[] = [
  {
    id: 'lead_vocals',
    label: 'Lead Vocals',
    type: 'VOCAL',
    borderColor: '#8B5CF6',
    badgeColor: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    waveColor: '#8B5CF6',
    confidence: 94,
    levelDbfs: -6.2,
    waveHeights: WAVE_PRESETS.lead_vocals!,
  },
  {
    id: 'backing_vocals',
    label: 'Backing Vocals',
    type: 'VOCAL',
    borderColor: '#A78BFA',
    badgeColor: 'bg-purple-400/15 text-purple-300 border-purple-400/25',
    waveColor: '#A78BFA',
    confidence: 87,
    levelDbfs: -12.4,
    waveHeights: WAVE_PRESETS.backing_vocals!,
  },
  {
    id: 'bass',
    label: 'Bass',
    type: 'BASS',
    borderColor: '#FF4444',
    badgeColor: 'bg-red-500/20 text-red-400 border-red-500/30',
    waveColor: '#FF4444',
    confidence: 97,
    levelDbfs: -8.8,
    waveHeights: WAVE_PRESETS.bass!,
  },
  {
    id: 'kick',
    label: 'Kick',
    type: 'DRUM',
    borderColor: '#F97316',
    badgeColor: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    waveColor: '#F97316',
    confidence: 99,
    levelDbfs: -4.1,
    waveHeights: WAVE_PRESETS.kick!,
  },
  {
    id: 'snare',
    label: 'Snare',
    type: 'DRUM',
    borderColor: '#FB923C',
    badgeColor: 'bg-orange-400/15 text-orange-300 border-orange-400/25',
    waveColor: '#FB923C',
    confidence: 98,
    levelDbfs: -5.7,
    waveHeights: WAVE_PRESETS.snare!,
  },
  {
    id: 'hi_hats',
    label: 'Hi-Hats',
    type: 'DRUM',
    borderColor: '#FBBF24',
    badgeColor: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    waveColor: '#FBBF24',
    confidence: 91,
    levelDbfs: -14.3,
    waveHeights: WAVE_PRESETS.hi_hats!,
  },
  {
    id: 'cymbals',
    label: 'Cymbals',
    type: 'DRUM',
    borderColor: '#F59E0B',
    badgeColor: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    waveColor: '#F59E0B',
    confidence: 88,
    levelDbfs: -16.1,
    waveHeights: WAVE_PRESETS.cymbals!,
  },
  {
    id: 'room',
    label: 'Room',
    type: 'DRUM',
    borderColor: '#D97706',
    badgeColor: 'bg-amber-600/20 text-amber-500 border-amber-600/30',
    waveColor: '#D97706',
    confidence: 83,
    levelDbfs: -18.6,
    waveHeights: WAVE_PRESETS.room!,
  },
  {
    id: 'guitar',
    label: 'Guitar',
    type: 'INSTRUMENT',
    borderColor: '#34D399',
    badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    waveColor: '#34D399',
    confidence: 90,
    levelDbfs: -9.5,
    waveHeights: WAVE_PRESETS.guitar!,
  },
  {
    id: 'piano',
    label: 'Piano',
    type: 'KEYS',
    borderColor: '#38BDF8',
    badgeColor: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    waveColor: '#38BDF8',
    confidence: 92,
    levelDbfs: -10.8,
    waveHeights: WAVE_PRESETS.piano!,
  },
  {
    id: 'synths_pads',
    label: 'Synths / Pads',
    type: 'SYNTH',
    borderColor: '#D946EF',
    badgeColor: 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/30',
    waveColor: '#D946EF',
    confidence: 85,
    levelDbfs: -11.2,
    waveHeights: WAVE_PRESETS.synths_pads!,
  },
  {
    id: 'fx_atmo',
    label: 'FX / Atmosphere',
    type: 'FX',
    borderColor: '#AAFF00',
    badgeColor: 'bg-lime-400/20 text-lime-400 border-lime-400/30',
    waveColor: '#AAFF00',
    confidence: 79,
    levelDbfs: -20.3,
    waveHeights: WAVE_PRESETS.fx_atmo!,
  },
]

// ─── Conflict matrix data ─────────────────────────────────────────────────────

const CONFLICT_MATRIX: readonly ConflictEntry[] = [
  { stemA: 'Lead Vocals',    stemB: 'Synths / Pads',    severity: 'medium', description: '200–800 Hz overlap — consider mid-cut on pads' },
  { stemA: 'Bass',           stemB: 'Kick',              severity: 'high',   description: 'Sub-bass energy conflict at 40–80 Hz — sidechain recommended' },
  { stemA: 'Backing Vocals', stemB: 'Guitar',            severity: 'low',    description: 'Minor 2–4 kHz presence overlap' },
  { stemA: 'Hi-Hats',       stemB: 'Cymbals',           severity: 'medium', description: 'High-freq density 8–16 kHz — may blur transients' },
  { stemA: 'Piano',          stemB: 'Synths / Pads',    severity: 'low',    description: 'Mid-range harmonic overlap — EQ spacing advised' },
]

// ─── Quality status data ──────────────────────────────────────────────────────

interface StatusEntry {
  label: string
  status: QualityStatus
  detail: string
}

const QUALITY_CHECKS: readonly StatusEntry[] = [
  { label: 'RECONSTRUCTION QUALITY',   status: 'PASS', detail: 'SDR 14.2 dB — excellent' },
  { label: 'SPECTRAL LEAKAGE',         status: 'WARN', detail: 'Bass → Kick bleed ~−38 dB' },
  { label: 'PHASE COHERENCE',          status: 'PASS', detail: 'Sum ±0.12 dBFS of original' },
  { label: 'TRANSIENT PRESERVATION',   status: 'PASS', detail: 'Attack deviation < 1.2 ms' },
  { label: 'FX BLEED ISOLATION',       status: 'WARN', detail: 'Room mic present in 3 stems' },
]

// ─── Progress bar for separation ─────────────────────────────────────────────

// Fixed progress milestones to avoid randomness in render path
const PROGRESS_STAGES = [
  { pct: 8,  label: 'LOADING MODEL' },
  { pct: 22, label: 'CHUNKING AUDIO' },
  { pct: 40, label: 'PASS 1 — DRUMS' },
  { pct: 58, label: 'PASS 2 — BASS / VOCALS' },
  { pct: 74, label: 'PASS 3 — INSTRUMENTS' },
  { pct: 88, label: 'PASS 4 — FX / ATMO' },
  { pct: 96, label: 'WRITING STEMS' },
  { pct: 100, label: 'COMPLETE' },
] as const

// ─── Sub-components ───────────────────────────────────────────────────────────

function StemTypeBadge({ type, colorClass }: { type: StemType; colorClass: string }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[8px] font-mono font-bold tracking-widest ${colorClass}`}
    >
      {type}
    </span>
  )
}

function ConfidenceBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] font-mono text-[#4A4565] w-16 shrink-0">CONFIDENCE</span>
      <div className="flex-1 h-1.5 bg-[#1C1835] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[8px] font-mono tabular-nums w-7 text-right" style={{ color }}>
        {pct}%
      </span>
    </div>
  )
}

function MiniWaveform({ heights, color, muted }: { heights: readonly number[]; color: string; muted: boolean }) {
  return (
    <div className="h-10 flex items-end gap-px overflow-hidden rounded-sm bg-[#0D0B1A] px-1 py-1">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-opacity duration-200"
          style={{
            height: `${h}%`,
            background: muted ? '#2A2545' : color,
            opacity: muted ? 0.3 : 0.75,
          }}
        />
      ))}
    </div>
  )
}

function LevelFader({
  id,
  value,
  color,
  onChange,
}: {
  id: string
  value: number
  color: string
  onChange: (v: number) => void
}) {
  // value 0–100 maps to -∞ to 0 dBFS display
  const displayDb = value === 0 ? '-∞' : ((value / 100) * 12 - 12).toFixed(1)

  return (
    <div className="flex items-center gap-2">
      <span className="text-[8px] font-mono text-[#4A4565] w-16 shrink-0">LEVEL</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rain-slider flex-1"
        aria-label={`Level fader for ${id}`}
        style={
          {
            '--thumb-color': color,
          } as React.CSSProperties
        }
      />
      <span className="text-[8px] font-mono tabular-nums w-10 text-right text-[#7A7595]">
        {displayDb === '-∞' ? '-∞' : `${displayDb} dB`}
      </span>
    </div>
  )
}

function StemCard({
  def,
  state,
  onSolo,
  onMute,
  onLevel,
}: {
  def: StemDef
  state: StemState
  onSolo: () => void
  onMute: () => void
  onLevel: (v: number) => void
}) {
  const dimmed = state.muted

  return (
    <div
      className="panel-card relative overflow-hidden flex flex-col"
      style={{ borderLeftColor: def.borderColor, borderLeftWidth: 3 }}
    >
      {/* Muted overlay tint */}
      {dimmed && (
        <div
          className="absolute inset-0 pointer-events-none z-10 rounded"
          style={{ background: 'rgba(13,11,26,0.55)' }}
        />
      )}

      {/* Header */}
      <div className="panel-card-header justify-between !gap-0 py-2 px-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="text-[10px] font-mono font-bold tracking-wide truncate"
            style={{ color: def.borderColor }}
          >
            {def.label}
          </span>
          <StemTypeBadge type={def.type} colorClass={def.badgeColor} />
        </div>
        <span className="text-[9px] font-mono tabular-nums text-[#7A7595] shrink-0 ml-2">
          {def.levelDbfs.toFixed(1)} dBFS
        </span>
      </div>

      {/* Body */}
      <div className="panel-card-body !p-3 space-y-2.5 flex-1">
        {/* Waveform */}
        <MiniWaveform heights={def.waveHeights} color={def.waveColor} muted={dimmed} />

        {/* Confidence */}
        <ConfidenceBar pct={def.confidence} color={def.borderColor} />

        {/* Level fader */}
        <LevelFader
          id={def.id}
          value={state.level}
          color={def.borderColor}
          onChange={onLevel}
        />

        {/* Solo / Mute */}
        <div className="flex items-center gap-2 pt-0.5">
          <button
            onClick={onSolo}
            className={`flex-1 h-6 rounded text-[9px] font-mono font-bold tracking-widest border transition-all duration-150 ${
              state.solo
                ? 'bg-yellow-500/20 border-yellow-400/50 text-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.25)]'
                : 'bg-[#0D0B1A] border-[#2A2545] text-[#4A4565] hover:text-[#E8E6F0] hover:border-[#4A4565]'
            }`}
            aria-pressed={state.solo}
            aria-label={`Solo ${def.label}`}
          >
            S
          </button>
          <button
            onClick={onMute}
            className={`flex-1 h-6 rounded text-[9px] font-mono font-bold tracking-widest border transition-all duration-150 ${
              state.muted
                ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_8px_rgba(255,68,68,0.25)]'
                : 'bg-[#0D0B1A] border-[#2A2545] text-[#4A4565] hover:text-[#E8E6F0] hover:border-[#4A4565]'
            }`}
            aria-pressed={state.muted}
            aria-label={`Mute ${def.label}`}
          >
            M
          </button>
        </div>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: QualityStatus }) {
  const styles: Record<QualityStatus, string> = {
    PASS: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    WARN: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
    FAIL: 'bg-red-500/20 border-red-500/30 text-red-400',
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded border text-[8px] font-mono font-bold tracking-widest ${styles[status]}`}
    >
      {status}
    </span>
  )
}

function SeverityDot({ severity }: { severity: ConflictEntry['severity'] }) {
  const styles = {
    low:    'bg-yellow-500/60',
    medium: 'bg-orange-500/80',
    high:   'bg-red-500',
  }
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 mt-px ${styles[severity]}`}
      title={severity.toUpperCase()}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StemsTab() {
  const [stemStates, setStemStates] = useState<Record<string, StemState>>(() =>
    Object.fromEntries(
      STEM_DEFS.map((s) => [s.id, { muted: false, solo: false, level: 80 }])
    )
  )

  const [phase, setPhase] = useState<SeparationPhase>('idle')
  const [progressIdx, setProgressIdx] = useState(0)
  const [elapsed, setElapsed] = useState<number | null>(null)

  // Determine solo-active so non-solo stems auto-dim
  const anySolo = useMemo(
    () => Object.values(stemStates).some((s) => s.solo),
    [stemStates]
  )

  const updateStem = useCallback(
    (id: string, patch: Partial<StemState>) => {
      setStemStates((prev) => ({
        ...prev,
        [id]: { ...prev[id]!, ...patch },
      }))
    },
    []
  )

  const handleSolo = useCallback(
    (id: string) => {
      setStemStates((prev) => ({
        ...prev,
        [id]: { ...prev[id]!, solo: !prev[id]!.solo },
      }))
    },
    []
  )

  const handleMute = useCallback(
    (id: string) => {
      setStemStates((prev) => ({
        ...prev,
        [id]: { ...prev[id]!, muted: !prev[id]!.muted },
      }))
    },
    []
  )

  const handleSeparate = useCallback(() => {
    if (phase === 'running') return
    setPhase('running')
    setProgressIdx(0)
    setElapsed(null)

    const startMs = Date.now()
    let idx = 0

    const tick = () => {
      idx += 1
      setProgressIdx(idx)

      if (idx < PROGRESS_STAGES.length - 1) {
        // Variable tick interval simulates real processing cadence
        const delay = idx === 3 || idx === 4 ? 900 : idx === 5 ? 700 : 400
        setTimeout(tick, delay)
      } else {
        setPhase('done')
        setElapsed(Math.round((Date.now() - startMs) / 100) / 10)
      }
    }

    setTimeout(tick, 400)
  }, [phase])

  const handleReset = useCallback(() => {
    setPhase('idle')
    setProgressIdx(0)
    setElapsed(null)
  }, [])

  const currentStage = PROGRESS_STAGES[Math.min(progressIdx, PROGRESS_STAGES.length - 1)]!
  const progressPct = currentStage.pct

  return (
    <TierGate requiredTier="creator" feature="12-Stem separation">
      <div className="p-4 space-y-4 max-w-[1400px]">

        {/* ── Engine header panel ── */}
        <div className="panel-card">
          <div className="panel-card-header justify-between">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono font-bold tracking-widest text-[#E8E6F0]">
                STEM SEPARATOR
              </span>
              {/* Model badge */}
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 text-[8px] font-mono font-bold tracking-widest text-[#A78BFA]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#8B5CF6] animate-pulse" />
                12-STEM DEMUCS v4
              </span>
              <span className="px-2 py-0.5 rounded border border-[#D946EF]/30 bg-[#D946EF]/10 text-[8px] font-mono tracking-widest text-[#E879F9]">
                htdemucs_6s MULTI-PASS
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4 text-[9px] font-mono">
                <div className="flex flex-col items-end">
                  <span className="text-[#4A4565] tracking-wider">STEMS</span>
                  <span className="text-[#E8E6F0] font-bold tabular-nums">12</span>
                </div>
                <div className="w-px h-6 bg-[#2A2545]" />
                <div className="flex flex-col items-end">
                  <span className="text-[#4A4565] tracking-wider">PASSES</span>
                  <span className="text-[#E8E6F0] font-bold tabular-nums">4</span>
                </div>
                <div className="w-px h-6 bg-[#2A2545]" />
                <div className="flex flex-col items-end">
                  <span className="text-[#4A4565] tracking-wider">PROC TIME</span>
                  <span className="text-[#E8E6F0] font-bold tabular-nums">
                    {elapsed !== null ? `${elapsed}s` : phase === 'running' ? '…' : '--'}
                  </span>
                </div>
              </div>

              {/* Separate / Reset button */}
              {phase === 'idle' || phase === 'done' ? (
                <button
                  onClick={phase === 'done' ? handleReset : handleSeparate}
                  className={`px-4 py-2 rounded border text-[10px] font-mono font-bold tracking-widest transition-all duration-150 ${
                    phase === 'done'
                      ? 'bg-[#141225] border-[#2A2545] text-[#7A7595] hover:border-[#4A4565] hover:text-[#E8E6F0]'
                      : 'bg-gradient-to-r from-[#8B5CF6] to-[#D946EF] border-[#8B5CF6] text-white shadow-[0_0_16px_rgba(139,92,246,0.4)] hover:shadow-[0_0_24px_rgba(139,92,246,0.6)] hover:brightness-110'
                  }`}
                >
                  {phase === 'done' ? 'RESET' : 'SEPARATE STEMS'}
                </button>
              ) : (
                <button
                  disabled
                  className="px-4 py-2 rounded border border-[#8B5CF6]/40 bg-[#8B5CF6]/10 text-[10px] font-mono font-bold tracking-widest text-[#A78BFA] cursor-not-allowed"
                >
                  SEPARATING…
                </button>
              )}
            </div>
          </div>

          {/* Progress bar — visible during and after run */}
          {phase !== 'idle' && (
            <div className="px-4 pb-3 pt-1 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-[#7A7595] tracking-widest">
                  {currentStage.label}
                </span>
                <span className="text-[9px] font-mono tabular-nums text-[#7A7595]">
                  {progressPct}%
                </span>
              </div>
              <div className="h-1.5 bg-[#1C1835] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${progressPct}%`,
                    background:
                      phase === 'done'
                        ? 'linear-gradient(90deg, #8B5CF6, #D946EF, #AAFF00)'
                        : 'linear-gradient(90deg, #8B5CF6, #D946EF)',
                  }}
                />
              </div>
              {/* Stage pill strip */}
              <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                {PROGRESS_STAGES.map((stage, i) => (
                  <div
                    key={stage.label}
                    className={`h-1 flex-1 min-w-[12px] rounded-full transition-all duration-300 ${
                      i <= progressIdx
                        ? 'bg-[#8B5CF6]'
                        : 'bg-[#2A2545]'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── 12-stem grid ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {STEM_DEFS.map((def) => {
            const state = stemStates[def.id]!
            // If any stem is soloed, non-solo stems appear muted visually
            const effectiveMute = state.muted || (anySolo && !state.solo)

            return (
              <StemCard
                key={def.id}
                def={def}
                state={{ ...state, muted: effectiveMute }}
                onSolo={() => handleSolo(def.id)}
                onMute={() => handleMute(def.id)}
                onLevel={(v) => updateStem(def.id, { level: v })}
              />
            )
          })}
        </div>

        {/* ── Quality status summary ── */}
        <div className="panel-card">
          <div className="panel-card-header">
            <span className="text-[10px] font-mono font-bold tracking-widest text-[#E8E6F0]">
              RECONSTRUCTION QUALITY
            </span>
          </div>
          <div className="panel-card-body !p-0">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-[#2A2545]">
                  <th className="text-left px-4 py-2 font-normal text-[#4A4565] tracking-wider">CHECK</th>
                  <th className="text-left px-4 py-2 font-normal text-[#4A4565] tracking-wider">DETAIL</th>
                  <th className="text-right px-4 py-2 font-normal text-[#4A4565] tracking-wider">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {QUALITY_CHECKS.map(({ label, status, detail }) => (
                  <tr
                    key={label}
                    className="border-b border-[#2A2545]/50 hover:bg-[#1C1835]/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-[#E8E6F0] tracking-wide">{label}</td>
                    <td className="px-4 py-2.5 text-[#7A7595]">{detail}</td>
                    <td className="px-4 py-2.5 text-right">
                      <StatusPill status={status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Conflict matrix ── */}
        <div className="panel-card">
          <div className="panel-card-header">
            <span className="text-[10px] font-mono font-bold tracking-widest text-[#E8E6F0]">
              INTER-STEM CONFLICT MATRIX
            </span>
            <span className="ml-auto text-[8px] font-mono text-[#4A4565] tracking-wider">
              SPECTRAL OVERLAP ANALYSIS
            </span>
          </div>
          <div className="panel-card-body !p-0">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-[#2A2545]">
                  <th className="text-left px-4 py-2 font-normal text-[#4A4565] tracking-wider">STEM A</th>
                  <th className="text-left px-4 py-2 font-normal text-[#4A4565] tracking-wider">STEM B</th>
                  <th className="text-left px-4 py-2 font-normal text-[#4A4565] tracking-wider">SEVERITY</th>
                  <th className="text-left px-4 py-2 font-normal text-[#4A4565] tracking-wider">INTERACTION</th>
                </tr>
              </thead>
              <tbody>
                {CONFLICT_MATRIX.map(({ stemA, stemB, severity, description }) => (
                  <tr
                    key={`${stemA}-${stemB}`}
                    className="border-b border-[#2A2545]/50 hover:bg-[#1C1835]/50 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-[#A78BFA]">{stemA}</td>
                    <td className="px-4 py-2.5 text-[#A78BFA]">{stemB}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <SeverityDot severity={severity} />
                        <span
                          className={`uppercase tracking-widest text-[8px] font-bold ${
                            severity === 'high'
                              ? 'text-red-400'
                              : severity === 'medium'
                              ? 'text-orange-400'
                              : 'text-yellow-500'
                          }`}
                        >
                          {severity}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-[#7A7595]">{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </TierGate>
  )
}

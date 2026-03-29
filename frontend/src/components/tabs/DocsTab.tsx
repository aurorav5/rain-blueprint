import { BookOpen, ExternalLink, ChevronRight } from 'lucide-react'

const SECTIONS = [
  {
    title: 'GETTING STARTED',
    color: '#8B5CF6',
    items: [
      { label: 'Quick Start Guide', sub: 'Upload, master, export in 3 minutes' },
      { label: 'Free Tier vs Paid', sub: 'What WASM-local means for your audio' },
      { label: 'Supported Formats', sub: 'WAV, FLAC, AIFF, MP3, M4A — up to 500 MB' },
    ],
  },
  {
    title: 'CREATIVE MACROS',
    color: '#D946EF',
    items: [
      { label: 'BRIGHTEN — High-frequency clarity', sub: 'Air shelf · Side presence · Transient HF' },
      { label: 'GLUE — Bus cohesion', sub: 'Compression ratio · Knee · AR timing' },
      { label: 'WIDTH — Stereo imaging', sub: 'Side gain · HPF cutoff · Decorrelation' },
      { label: 'PUNCH — Transient impact', sub: 'Kick boost · Snare lookahead · Low-end tighten' },
      { label: 'WARMTH — Analog character', sub: 'THD amount · Low-mid harmonics · HF roll-off' },
    ],
  },
  {
    title: 'SIGNAL CHAIN',
    color: '#AAFF00',
    items: [
      { label: 'Stage 1–3: Analysis & Genre', sub: '43-dim feature vector · RainNet v2 inference' },
      { label: 'Stage 4–5: Validate & M/S', sub: 'Schema gate · Mid/Side matrix processing' },
      { label: 'Stage 6–8: Dynamics & EQ', sub: '3-band multiband · 8-band linear-phase EQ' },
      { label: 'Stage 9–10: Analog & SAIL', sub: 'Waveshaper THD · Stem-aware intelligent limiter' },
      { label: 'Stage 11–12: Verify & Cert', sub: 'LUFS gate ±0.5 LU · RAIN-CERT Ed25519 signature' },
    ],
  },
  {
    title: 'RAIN-DSP ARCHITECTURE',
    color: '#F97316',
    items: [
      { label: 'WASM-Local Rendering', sub: 'C++20 · 64-bit double · deterministic' },
      { label: 'Biquad Sign Convention', sub: 'y = b0·x + b1·x1 + b2·x2 − a1·y1 − a2·y2' },
      { label: 'True Peak Metering', sub: '4× polyphase FIR · 48-tap Kaiser · −50 dB stopband' },
      { label: 'LUFS Implementation', sub: 'ITU-R BS.1770-5 · K-weighting · 400 ms gate' },
    ],
  },
]

export default function DocsTab() {
  return (
    <div className="p-4 space-y-4 max-w-3xl">
      {/* Header */}
      <div className="panel-card">
        <div className="panel-card-body flex items-center gap-4 py-3">
          <div className="p-2 rounded bg-rain-purple/20">
            <BookOpen size={20} className="text-rain-purple" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-rain-text" style={{ fontFamily: 'var(--font-ui)' }}>
              R∞N DOCUMENTATION
            </h2>
            <p className="text-[10px] font-mono text-rain-dim">
              RAIN-MASTER-SPEC v6.0 · ARCOVEL Technologies International
            </p>
          </div>
          <a
            href="https://github.com/aurorav5/rain-blueprint"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[9px] font-mono text-rain-purple hover:text-rain-magenta transition-colors"
          >
            <ExternalLink size={10} />
            GITHUB
          </a>
        </div>
      </div>

      {/* Sections */}
      {SECTIONS.map(({ title, color, items }) => (
        <div key={title} className="panel-card">
          <div className="panel-card-header" style={{ borderLeftColor: color }}>
            <span className="text-[10px] font-mono tracking-widest text-rain-text">{title}</span>
          </div>
          <div className="panel-card-body divide-y divide-rain-border">
            {items.map(({ label, sub }) => (
              <div
                key={label}
                className="flex items-center gap-3 py-2.5 group cursor-pointer hover:bg-rain-surface/50 -mx-3 px-3 transition-colors"
              >
                <ChevronRight
                  size={10}
                  className="text-rain-muted group-hover:text-rain-purple transition-colors shrink-0"
                />
                <div>
                  <div className="text-[11px] font-mono text-rain-text group-hover:text-rain-purple transition-colors">
                    {label}
                  </div>
                  <div className="text-[9px] font-mono text-rain-dim mt-0.5">{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Footer */}
      <div className="text-center py-2">
        <p className="text-[9px] font-mono text-rain-muted">
          RAIN v6.0.0 · © 2026 ARCOVEL Technologies International · Phil Weyers Bölke
        </p>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useAuthStore } from '@/stores/auth'

export default function DistributeTab() {
  const { tierGte } = useAuthStore()
  const [isrc, setIsrc] = useState('')
  const [upc, setUpc] = useState('')
  const [ddexStatus, setDdexStatus] = useState<'idle' | 'pending' | 'submitted' | 'error'>('idle')
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set())

  const canDistribute = tierGte('studio_pro')

  const DSP_PLATFORMS = [
    { id: 'spotify', name: 'Spotify', color: '#1DB954' },
    { id: 'apple_music', name: 'Apple Music', color: '#FA2D48' },
    { id: 'tidal', name: 'Tidal', color: '#00D4FF' },
    { id: 'amazon', name: 'Amazon Music', color: '#FF9900' },
    { id: 'deezer', name: 'Deezer', color: '#A238FF' },
    { id: 'youtube_music', name: 'YouTube Music', color: '#FF0000' },
  ] as const

  const togglePlatform = (id: string) => {
    setSelectedPlatforms(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="p-4 space-y-4 max-w-2xl">
      {!canDistribute && (
        <div className="px-3 py-2 bg-rain-panel border border-rain-border rounded">
          <span className="text-[10px] font-mono text-rain-dim">
            Distribution requires Studio Pro tier or above.
          </span>
        </div>
      )}

      {/* DDEX Status */}
      <div className="panel-card">
        <div className="panel-card-header flex items-center justify-between">
          <span className="text-[10px] font-mono tracking-widest text-rain-text">
            DDEX DELIVERY
          </span>
          <span className={`px-2 py-0.5 rounded text-[8px] font-mono tracking-wider ${
            ddexStatus === 'idle' ? 'bg-rain-bg text-rain-muted' :
            ddexStatus === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
            ddexStatus === 'submitted' ? 'bg-green-500/20 text-green-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {ddexStatus.toUpperCase()}
          </span>
        </div>
        <div className="panel-card-body space-y-3">
          {/* ISRC */}
          <div className="space-y-1">
            <span className="text-[9px] font-mono text-rain-dim">ISRC</span>
            <input
              type="text"
              value={isrc}
              onChange={(e) => setIsrc(e.target.value.toUpperCase())}
              placeholder="XX-XXX-XX-XXXXX"
              disabled={!canDistribute}
              className="w-full bg-rain-bg border border-rain-border rounded px-2 py-1.5 text-rain-text text-[10px] font-mono placeholder:text-rain-muted"
            />
          </div>

          {/* UPC */}
          <div className="space-y-1">
            <span className="text-[9px] font-mono text-rain-dim">UPC / EAN</span>
            <input
              type="text"
              value={upc}
              onChange={(e) => setUpc(e.target.value)}
              placeholder="0000000000000"
              disabled={!canDistribute}
              className="w-full bg-rain-bg border border-rain-border rounded px-2 py-1.5 text-rain-text text-[10px] font-mono placeholder:text-rain-muted"
            />
          </div>
        </div>
      </div>

      {/* Platform Selection */}
      <div className="panel-card">
        <div className="panel-card-header">
          <span className="text-[10px] font-mono tracking-widest text-rain-text">
            DSP TARGETS
          </span>
        </div>
        <div className="panel-card-body">
          <div className="grid grid-cols-2 gap-2">
            {DSP_PLATFORMS.map(({ id, name, color }) => (
              <button
                key={id}
                onClick={() => togglePlatform(id)}
                disabled={!canDistribute}
                className={`h-9 rounded text-[10px] font-mono tracking-wider border transition-colors flex items-center justify-center gap-2 ${
                  selectedPlatforms.has(id)
                    ? 'border-rain-purple/40 text-rain-text'
                    : 'bg-rain-bg border-rain-border text-rain-dim hover:text-rain-text'
                }`}
                style={selectedPlatforms.has(id) ? { backgroundColor: `${color}20`, borderColor: `${color}40` } : {}}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* LabelGrid Submission */}
      <div className="panel-card">
        <div className="panel-card-header">
          <span className="text-[10px] font-mono tracking-widest text-rain-text">
            LABELGRID SUBMISSION
          </span>
        </div>
        <div className="panel-card-body space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-rain-dim">RELEASE TITLE</span>
              <input
                type="text"
                placeholder="Track title"
                disabled={!canDistribute}
                className="w-full bg-rain-bg border border-rain-border rounded px-2 py-1.5 text-rain-text text-[10px] font-mono placeholder:text-rain-muted"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[9px] font-mono text-rain-dim">ARTIST NAME</span>
              <input
                type="text"
                placeholder="Primary artist"
                disabled={!canDistribute}
                className="w-full bg-rain-bg border border-rain-border rounded px-2 py-1.5 text-rain-text text-[10px] font-mono placeholder:text-rain-muted"
              />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-[9px] font-mono text-rain-dim">GENRE</span>
            <select
              disabled={!canDistribute}
              className="w-full bg-rain-bg border border-rain-border rounded px-2 py-1.5 text-rain-text text-[10px] font-mono"
            >
              <option>Electronic</option>
              <option>Hip-Hop</option>
              <option>Pop</option>
              <option>Rock</option>
              <option>R&B</option>
              <option>Classical</option>
              <option>Jazz</option>
              <option>Country</option>
              <option>Latin</option>
            </select>
          </div>
          <button
            disabled={!canDistribute}
            className={`w-full h-8 rounded text-[10px] font-mono tracking-widest font-bold transition-colors ${
              canDistribute
                ? 'bg-rain-purple/20 border border-rain-purple/40 text-rain-purple hover:bg-rain-purple/30'
                : 'bg-rain-panel border border-rain-border text-rain-muted cursor-not-allowed'
            }`}
          >
            SUBMIT TO LABELGRID
          </button>
        </div>
      </div>
    </div>
  )
}

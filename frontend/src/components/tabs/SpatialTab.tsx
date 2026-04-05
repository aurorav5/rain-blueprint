import { Disc3 } from 'lucide-react'

export default function SpatialTab() {
  const sources = [
    { label: 'VOCALS', x: 50, y: 30, colorGlow: 'shadow-[0_0_20px_rgba(255,0,255,0.8)]', bg: 'bg-magenta-500' },
    { label: 'DRUMS', x: 30, y: 60, colorGlow: 'shadow-[0_0_20px_rgba(0,229,255,0.8)]', bg: 'bg-cyan-500' },
    { label: 'BASS', x: 70, y: 70, colorGlow: 'shadow-[0_0_20px_rgba(59,130,246,0.8)]', bg: 'bg-blue-500' },
    { label: 'KEYS', x: 20, y: 40, colorGlow: 'shadow-[0_0_20px_rgba(255,215,0,0.8)]', bg: 'bg-yellow-500' }
  ]

  const sliders = [
    { label: 'SPATIAL DEPTH', value: 75, color: '#00E5FF' },
    { label: 'WIDTH', value: 60, color: '#8A2BE2' },
    { label: 'FOCUS', value: 85, color: '#FF00FF' },
  ]

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      
      {/* Top Workspace: 3D Interactive Glass Orb */}
      <div className="crystal-glass flex-1 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center p-8 shadow-2xl bg-[radial-gradient(ellipse_at_center,rgba(0,229,255,0.05)_0%,transparent_70%)]">
        <h2 className="absolute top-6 left-6 text-[11px] font-mono font-black tracking-[0.2em] uppercase text-white/50">Soundstage Mapping</h2>
        
        {/* The Glass Orb */}
        <div className="w-[450px] h-[450px] rounded-full crystal-bubble relative shadow-[0_0_60px_rgba(0,229,255,0.1),inset_0_0_40px_rgba(255,255,255,0.05)] flex items-center justify-center border-t border-b border-white/20">
          
          {/* Inner 3D depth rings */}
          <div className="absolute inset-8 rounded-full border border-white/5 bg-black/20 mix-blend-overlay" />
          <div className="absolute inset-16 rounded-full border border-white/10 bg-black/30" />
          <div className="absolute inset-24 rounded-full border border-[#00E5FF]/20" />
          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[1px] bg-white/10 w-full" />
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-white/10 h-full" />

          {/* Floating Sound Sources */}
          {sources.map((source, i) => (
            <div 
              key={i}
              className={`absolute w-8 h-8 -ml-4 -mt-4 rounded-full crystal-glass flex items-center justify-center cursor-move hover:scale-110 transition-transform ${source.colorGlow}`}
              style={{ left: `${source.x}%`, top: `${source.y}%` }}
            >
              <div className={`w-3 h-3 rounded-full ${source.bg}`} />
              <div className="absolute -bottom-6 w-24 text-center -ml-8 text-[9px] font-mono font-bold tracking-widest text-white/60 pointer-events-none drop-shadow-md">
                {source.label}
              </div>
            </div>
          ))}

          {/* Central Listener Node */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full crystal-glass flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            <Disc3 size={20} className="text-white/80 animate-spin-slow" />
          </div>

        </div>
      </div>

      {/* Bottom Workspace: Spatial Controls */}
      <div className="h-[200px] shrink-0 crystal-glass rounded-2xl p-6 flex flex-col relative shadow-[0_15px_40px_rgba(0,0,0,0.6)]">
        <h2 className="text-[11px] font-mono font-black tracking-[0.2em] uppercase text-white/50 mb-6">Environment Controls</h2>
        
        <div className="flex-1 flex flex-col justify-around px-8">
          {sliders.map((slider, i) => (
            <div key={i} className="flex items-center gap-6 group">
              <span className="w-32 text-right text-[10px] font-bold tracking-[0.15em] text-white/60 group-hover:text-white transition-colors">
                {slider.label}
              </span>
              
              <div className="flex-1 h-3 crystal-bubble rounded-full relative flex items-center cursor-pointer">
                {/* Track */}
                <div className="absolute left-1 flex-1 right-1 h-1 bg-black/60 rounded-full" />
                {/* Fill */}
                <div className="absolute left-1 h-1 rounded-full opacity-80 shadow-[0_0_10px_currentColor] transition-all duration-300" 
                     style={{ width: `calc(${slider.value}% - 8px)`, backgroundColor: slider.color, color: slider.color }} />
                {/* Thumb */}
                <div className="absolute w-5 h-5 crystal-glass rounded-full shadow-[0_0_10px_rgba(255,255,255,0.4)] hover:scale-125 transition-transform"
                     style={{ left: `calc(${slider.value}% - 10px)` }} />
              </div>

              <span className="w-12 text-left text-[10px] font-mono font-bold text-white group-hover:text-[currentColor] transition-colors" style={{ color: slider.color }}>
                {slider.value}%
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

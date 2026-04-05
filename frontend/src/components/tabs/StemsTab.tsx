export default function StemsTab() {
  const stems = [
    { label: 'VOCALS', color: 'bg-magenta-500', value: 85, colorGlow: 'shadow-[0_0_15px_rgba(255,0,255,0.5)]' },
    { label: 'DRUMS', color: 'bg-cyan-500', value: 90, colorGlow: 'shadow-[0_0_15px_rgba(0,229,255,0.5)]' },
    { label: 'BASS', color: 'bg-blue-500', value: 75, colorGlow: 'shadow-[0_0_15px_rgba(0,136,255,0.5)]' },
    { label: 'GUITARS', color: 'bg-yellow-500', value: 60, colorGlow: 'shadow-[0_0_15px_rgba(255,215,0,0.5)]' },
    { label: 'KEYS', color: 'bg-violet-500', value: 65, colorGlow: 'shadow-[0_0_15px_rgba(138,43,226,0.5)]' },
    { label: 'OTHER', color: 'bg-green-500', value: 50, colorGlow: 'shadow-[0_0_15px_rgba(0,255,0,0.5)]' }
  ]

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      
      {/* Top Workspace: Grid of Vertical Faders */}
      <div className="crystal-glass flex-1 rounded-2xl relative overflow-hidden flex flex-col p-8 shadow-2xl">
        <h2 className="text-[11px] font-mono font-black tracking-[0.2em] uppercase text-white/50 mb-8 mt-2 text-center">Stem Group Mixing</h2>
        
        <div className="flex-1 flex justify-around items-end h-full w-full">
          {stems.map((stem, i) => (
            <div key={i} className="h-full flex flex-col items-center justify-end w-24">
              {/* Deep Refractive Channel */}
              <div className="w-10 flex-1 crystal-bubble rounded-full relative flex items-end p-1 mb-4">
                <div className="absolute inset-0 bg-black/40 rounded-full shadow-inner" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[2px] h-[90%] bg-white/10 z-0" />
                
                {/* Polished Glass Slider (Fader Handle) */}
                <div 
                  className={`w-full h-16 crystal-glass rounded-xl z-10 cursor-pointer hover:bg-white/10 transition-colors flex items-center justify-center border-t border-b ${stem.colorGlow}`}
                  style={{ marginBottom: `${stem.value}%` }}
                >
                  <div className="w-full h-1 bg-white/50 shadow-[0_0_5px_white]" />
                </div>
              </div>
              <span className="text-[10px] font-bold tracking-[0.15em] text-white/70">{stem.label}</span>
              <span className="text-[10px] font-mono font-bold text-white mt-1.5">{stem.value}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Workspace: Stem Dynamics */}
      <div className="h-[180px] shrink-0 crystal-glass rounded-2xl p-6 flex flex-col relative shadow-[0_15px_40px_rgba(0,0,0,0.6)]">
        <h2 className="text-[11px] font-mono font-black tracking-[0.2em] uppercase text-white/50 mb-4">Stem Dynamics</h2>
        
        <div className="flex-1 crystal-bubble rounded-xl p-4 flex gap-4 items-center">
          {stems.map((stem, i) => (
            <div key={i} className="flex-1 h-full crystal-glass rounded-lg flex flex-col items-center justify-center border-t border-white/10 relative overflow-hidden group hover:bg-white/5 cursor-pointer transition-colors">
              <span className="text-[9px] font-mono tracking-widest text-white/40 mb-2">COMPRESSION</span>
              <div className="w-[80%] h-1.5 bg-black/60 rounded-full overflow-hidden shadow-inner flex items-center">
                <div className={`h-full opacity-80 ${stem.color} ${stem.colorGlow}`} style={{ width: `${Math.random() * 40 + 20}%` }} />
              </div>
              <div className={`absolute bottom-0 left-0 w-full h-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${stem.color} ${stem.colorGlow}`} />
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}

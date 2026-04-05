export default function MasteringTab() {
  const macros = [
    { label: 'BRIGHTEN', value: '4.5', color: 'border-yellow-400', shadow: 'shadow-[0_0_15px_rgba(250,204,21,0.5)]' },
    { label: 'BLUE', value: '6.0', color: 'border-cyan-400', shadow: 'shadow-[0_0_15px_rgba(34,211,238,0.5)]' },
    { label: 'DEPTH', value: '7.2', color: 'border-blue-500', shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.5)]' },
    { label: 'PLUSH', value: '5.0', color: 'border-purple-500', shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.5)]' },
    { label: 'IMPACT', value: '8.5', color: 'border-red-500', shadow: 'shadow-[0_0_15px_rgba(239,68,68,0.5)]' },
    { label: 'SPACE', value: '3.0', color: 'border-indigo-400', shadow: 'shadow-[0_0_15px_rgba(129,140,248,0.5)]' }
  ]

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      
      {/* Top Workspace: Spectral Analysis */}
      <div className="crystal-glass flex-1 rounded-2xl relative overflow-hidden flex flex-col p-4 shadow-2xl">
        <div className="absolute top-4 left-6 right-6 flex justify-between items-center z-10">
          <h2 className="text-[11px] font-mono font-black tracking-[0.2em] uppercase text-white/50">Spectral Analysis</h2>
          
          {/* Suble Processing Bubble */}
          <div className="crystal-bubble px-4 py-1.5 text-[10px] font-mono font-bold tracking-widest text-[#00E5FF] flex items-center gap-3 animate-pulse shadow-[0_0_15px_rgba(0,229,255,0.2)] bg-black/40">
            <span className="w-2 h-2 rounded-full bg-[#00E5FF] shadow-[0_0_8px_rgba(0,229,255,1)]" />
            PROCESSING IN PROGRESS...
          </div>
        </div>

        {/* The Waterfall Concept */}
        <div className="flex-1 w-full mt-8 relative rounded-xl overflow-hidden bg-black/50 border border-white/5 flex items-end">
          {/* Faked waterfall using multi-layered gradients and absolute divs */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0088FF]/20 via-[#00E5FF]/10 to-transparent mix-blend-screen" />
          <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#8A2BE2]/30 via-transparent mix-blend-screen" />
          
          {/* Faked frequency spikes */}
          <div className="w-full h-full flex items-end justify-between px-2 pb-2 gap-1 opacity-80">
            {Array.from({ length: 64 }).map((_, i) => {
              const height = 10 + Math.random() * 80 + (Math.sin(i / 5) * 20);
              return (
                <div 
                  key={i} 
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${Math.max(5, height)}%`,
                    background: `linear-gradient(to top, #0088FF, #00E5FF ${Math.random() * 50 + 50}%, #FFD700)`
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom Workspace: CREATIVE MACRO SYSTEM */}
      <div className="h-[220px] shrink-0 crystal-glass rounded-2xl p-6 flex flex-col relative shadow-[0_15px_40px_rgba(0,0,0,0.6)]">
        <h2 className="text-[11px] font-mono font-black tracking-[0.2em] uppercase text-white/50 mb-auto text-center">Creative Macro System</h2>
        
        {/* Polished Glass Pill Base */}
        <div className="w-full h-[120px] crystal-bubble rounded-full mt-4 flex items-center justify-around px-8 relative shadow-inner">
          
          {macros.map((macro, i) => (
            <div key={i} className="flex flex-col items-center group relative -mt-8">
              
              {/* Soft Tooltip Bubble */}
              <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity crystal-bubble px-3 py-1 text-[9px] font-mono font-bold tracking-widest text-white whitespace-nowrap z-20">
                Adjust {macro.label}
              </div>

              {/* Massive Crystal Glass Knob */}
              <div className={`w-[90px] h-[90px] rounded-full crystal-glass relative flex items-center justify-center cursor-pointer transition-transform hover:scale-105 border-2 ${macro.color} ${macro.shadow}`}>
                <div className="absolute inset-1 rounded-full bg-gradient-to-b from-white/10 to-transparent border border-white/20" />
                <div className="absolute inset-3 rounded-full bg-black/60 shadow-inner flex items-center justify-center">
                  <span className="font-mono text-xl font-bold text-white drop-shadow-md">{macro.value}</span>
                </div>
                {/* Knob Position Indicator */}
                <div 
                  className="absolute top-2 w-1.5 h-3 rounded-full bg-white shadow-[0_0_5px_rgba(255,255,255,1)]" 
                  style={{ transform: `rotate(${(i * 45) - 45}deg)`, transformOrigin: `0 40px` }} 
                />
              </div>

              {/* Macro Label */}
              <span className="mt-4 text-[11px] font-bold tracking-[0.15em] text-white/70 group-hover:text-white transition-colors">
                {macro.label}
              </span>
            </div>
          ))}

        </div>
      </div>

    </div>
  )
}

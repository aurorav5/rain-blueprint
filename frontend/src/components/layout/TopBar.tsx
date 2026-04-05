import { Play, Pause, Square, Circle } from 'lucide-react'

export function TopBar() {
  return (
    <header className="h-14 bg-white/5 backdrop-blur-md border-b border-white/10 shrink-0 z-20 px-6 flex items-center justify-between shadow-[0_4px_30px_rgba(0,0,0,0.1)]">
      {/* Left: Clock and Transport */}
      <div className="flex items-center gap-6">
        <div className="font-mono text-xl tracking-[0.1em] font-light text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">
          20:22.882
        </div>
        
        <div className="flex items-center gap-2">
          <button className="w-10 h-10 rounded-full crystal-glass flex items-center justify-center hover:bg-white/10 transition text-white hover:text-green-400">
            <Play size={16} className="ml-1" fill="currentColor" />
          </button>
          <button className="w-10 h-10 rounded-full crystal-glass flex items-center justify-center hover:bg-white/10 transition text-white hover:text-yellow-400">
            <Pause size={16} fill="currentColor" />
          </button>
          <button className="w-10 h-10 rounded-full crystal-glass flex items-center justify-center hover:bg-white/10 transition text-white hover:text-red-400">
            <Square size={14} fill="currentColor" />
          </button>
          <button className="w-10 h-10 rounded-full crystal-glass flex items-center justify-center hover:bg-white/10 transition text-red-500 hover:text-red-400 drop-shadow-[0_0_8px_rgba(255,0,0,0.5)]">
            <Circle size={14} fill="currentColor" />
          </button>
        </div>
      </div>

      {/* Center: R∞N text brand ID in a multi-colored gradient */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center">
        <span className="roon-text-gradient text-2xl tracking-[0.2em]">R∞N</span>
        <span className="text-[10px] uppercase font-semibold text-white/50 tracking-[0.3em] ml-3 mt-1.5 border-l border-white/20 pl-3">
          AI Mastering Engine
        </span>
      </div>

      {/* Right: status pills */}
      <div className="flex items-center gap-3">
        <span className="px-3 py-1 font-mono text-[10px] font-bold rounded-full border border-gold/40 text-yellow-500 tracking-wider shadow-[inset_0_0_10px_rgba(255,215,0,0.2)] bg-black/20">
          +ENTERPRISE
        </span>
        <span className="px-3 py-1 font-mono text-[10px] font-bold rounded-full border border-red-500/40 text-red-400 tracking-wider shadow-[inset_0_0_10px_rgba(255,68,68,0.2)] bg-black/20 animate-pulse">
          +LIVE
        </span>
        <span className="px-3 py-1 font-mono text-[10px] font-bold rounded-full border border-cyan-500/40 text-cyan-400 tracking-wider shadow-[inset_0_0_10px_rgba(0,229,255,0.2)] bg-black/20">
          +SAVE
        </span>
      </div>
    </header>
  )
}

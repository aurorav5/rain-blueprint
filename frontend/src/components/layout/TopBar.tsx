import { useAuthStore } from '@/stores/auth'
import { TierBadge } from '@/components/common/Badge'

export function TopBar() {
  const { tier, clearAuth, userId } = useAuthStore()

  return (
    <header className="h-11 bg-rain-surface border-b border-rain-border flex items-center justify-between px-4 shrink-0">
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <span className="text-xl font-mono font-black tracking-tight">
          <span className="rain-logo-r">R</span>
          <span className="rain-logo-inf">&infin;</span>
          <span className="rain-logo-n">N</span>
        </span>
        <span className="text-[9px] font-mono text-rain-dim tracking-widest uppercase">
          AI Mastering Engine v6.0
        </span>
      </div>

      {/* Center: Status badges */}
      <div className="flex items-center gap-2">
        <span className="px-2 py-0.5 bg-rain-panel border border-rain-border rounded text-[9px] font-mono text-rain-dim">
          OFFLINE
        </span>
        <span className="px-2 py-0.5 bg-gradient-to-r from-purple-600/20 to-magenta-500/20 border border-rain-purple/30 rounded text-[9px] font-mono text-rain-purple">
          CLAUDE OPUS 4.6
        </span>
      </div>

      {/* Right: User controls */}
      <div className="flex items-center gap-3">
        <TierBadge tier={tier} />
        <div className="w-7 h-7 rounded-full bg-rain-panel border border-rain-border flex items-center justify-center">
          <span className="text-[10px] font-mono text-rain-dim">
            {userId ? userId.charAt(0).toUpperCase() : 'U'}
          </span>
        </div>
        <button
          onClick={clearAuth}
          className="text-rain-dim text-[10px] font-mono hover:text-rain-text transition-colors"
        >
          SIGN OUT
        </button>
      </div>
    </header>
  )
}

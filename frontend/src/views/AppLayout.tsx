import { NavLink, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'
import { TierBadge } from '@/components/common/Badge'

const NAV_ITEMS = [
  { to: '', label: 'MASTER', end: true },
  { to: 'stems', label: 'STEMS' },
  { to: 'aie', label: 'AIE' },
  { to: 'library', label: 'LIBRARY' },
  { to: 'release', label: 'RELEASE' },
  { to: 'settings', label: 'SETTINGS' },
]

export default function AppLayout() {
  const { tier, clearAuth } = useAuthStore()

  return (
    <div className="min-h-screen bg-rain-black text-rain-white flex flex-col">
      <header className="h-10 border-b border-rain-border flex items-center justify-between px-4 shrink-0">
        <span className="text-lg font-mono font-bold tracking-widest text-rain-white">R∞N</span>
        <div className="flex items-center gap-3">
          <TierBadge tier={tier} />
          <button
            onClick={clearAuth}
            className="text-rain-dim text-xs font-mono hover:text-rain-white transition-colors"
          >
            SIGN OUT
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="w-28 border-r border-rain-border flex flex-col pt-2 shrink-0">
          {NAV_ITEMS.map(({ to, label, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-3 py-2 text-xs font-mono transition-colors border-l-2 ${
                  isActive
                    ? 'border-rain-blue text-rain-white'
                    : 'border-transparent text-rain-dim hover:text-rain-white'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

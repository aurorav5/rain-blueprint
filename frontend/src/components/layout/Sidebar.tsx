import { NavLink } from 'react-router-dom'
import {
  Disc3, Layers, Move3D, ScanSearch, Wrench, Fingerprint, Frame
} from 'lucide-react'

interface NavSection {
  title: string
  items: { to: string, label: string, icon: React.ElementType, end?: boolean }[]
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Workspace',
    items: [
      { to: '/app', label: 'MASTER', icon: Disc3, end: true },
      { to: '/app/stems', label: 'STEMS', icon: Layers },
      { to: '/app/spatial', label: 'SPATIAL', icon: Move3D },
      { to: '/app/reference', label: 'REFERENCE', icon: ScanSearch },
      { to: '/app/repair', label: 'REPAIR', icon: Wrench },
    ],
  },
  {
    title: 'Advanced',
    items: [
      { to: '/app/aie', label: 'IDENTITY', icon: Fingerprint },
      { to: '/app/big', label: 'BIG', icon: Frame },
    ],
  }
]

export function Sidebar() {
  return (
    <aside className="w-[240px] flex flex-col h-full bg-black/40 backdrop-blur-[40px] border-r border-white/5 shrink-0 overflow-hidden z-30 pt-6 px-4">
      
      <nav className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar pb-8 space-y-8" aria-label="Sidebar navigation">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="space-y-3">
            <div className="px-2">
              <span className="text-[10px] font-mono font-black tracking-[0.2em] uppercase text-white/30 hidden">
                {section.title}
              </span>
            </div>

            <div className="space-y-2">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `crystal-bubble relative flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-2xl text-[12px] font-bold uppercase tracking-[0.1em] transition-all duration-300 group overlay-hidden ${
                      isActive
                        ? 'active text-white'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        size={18}
                        className={`shrink-0 transition-colors duration-300 relative z-10 ${
                          isActive ? 'text-[#8A2BE2] drop-shadow-[0_0_8px_rgba(138,43,226,0.8)]' : 'text-white/40 group-hover:text-white/80'
                        }`}
                      />
                      <span className="relative z-10">{item.label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

    </aside>
  )
}

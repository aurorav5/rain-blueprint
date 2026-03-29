import { NavLink } from 'react-router-dom'
import {
  Disc3, Layers, AudioWaveform, ShieldCheck,
  Download, Send, BarChart3, Rocket, Settings,
  GitCompare, Wrench, MessageSquare, BookOpen
} from 'lucide-react'

const TABS = [
  { to: '',           label: 'MASTER',     icon: Disc3,          end: true },
  { to: 'stems',      label: 'STEMS',      icon: Layers },
  { to: 'reference',  label: 'REFERENCE',  icon: GitCompare },
  { to: 'repair',     label: 'REPAIR',     icon: Wrench },
  { to: 'spatial',    label: 'SPATIAL',    icon: AudioWaveform },
  { to: 'qc',         label: 'QC',         icon: ShieldCheck },
  { to: 'export',     label: 'EXPORT',     icon: Download },
  { to: 'distribute', label: 'DISTRIBUTE', icon: Send },
  { to: 'collab',     label: 'COLLAB',     icon: MessageSquare },
  { to: 'analytics',  label: 'ANALYTICS',  icon: BarChart3 },
  { to: 'roadmap',    label: 'ROADMAP',    icon: Rocket },
  { to: 'docs',       label: 'DOCS',       icon: BookOpen },
  { to: 'settings',   label: 'SETTINGS',   icon: Settings },
] as const

export function TabBar() {
  return (
    <nav className="h-10 bg-rain-bg border-b border-rain-border flex items-center gap-0.5 px-3 overflow-x-auto shrink-0"
         style={{ scrollbarWidth: 'none' }}>
      {TABS.map((tab) => {
        const { to, label, icon: Icon } = tab
        const end = 'end' in tab ? (tab as { end: boolean }).end : undefined
        return (
          <NavLink
            key={label}
            to={to}
            end={end}
            className={({ isActive }) =>
              `tab-3d flex items-center gap-1.5 ${isActive ? 'active' : ''}`
            }
          >
            <Icon size={11} />
            <span style={{ fontFamily: 'var(--font-ui)', letterSpacing: '0.08em' }}>
              {label}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}

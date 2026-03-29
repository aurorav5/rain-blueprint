import { NavLink } from 'react-router-dom'
import {
  Disc3, Layers, Move3D, ShieldCheck, Download, Send,
  Settings, BarChart3, Rocket
} from 'lucide-react'

const TABS = [
  { to: '', label: 'MASTER', icon: Disc3, end: true },
  { to: 'stems', label: 'STEMS', icon: Layers },
  { to: 'spatial', label: 'SPATIAL', icon: Move3D },
  { to: 'qc', label: 'QC', icon: ShieldCheck },
  { to: 'export', label: 'EXPORT', icon: Download },
  { to: 'distribute', label: 'DISTRIBUTE', icon: Send },
  { to: 'analytics', label: 'ANALYTICS', icon: BarChart3 },
  { to: 'roadmap', label: 'ROADMAP', icon: Rocket },
  { to: 'settings', label: 'SETTINGS', icon: Settings },
] as const

export function TabBar() {
  return (
    <nav className="h-10 bg-rain-bg border-b border-rain-border flex items-center gap-1 px-3 overflow-x-auto shrink-0">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={label}
          to={to}
          end={end}
          className={({ isActive }) => `tab-3d flex items-center gap-1.5 ${isActive ? 'active' : ''}`}
        >
          <Icon size={12} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

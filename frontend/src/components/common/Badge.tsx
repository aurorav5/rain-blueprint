import { clsx } from 'clsx'
import type { Tier } from '@/stores/auth'

const TIER_STYLES: Record<Tier, string> = {
  free:        'text-rain-dim border-rain-muted',
  spark:       'text-rain-amber border-rain-amber/40',
  creator:     'text-rain-blue border-rain-blue/40',
  artist:      'text-rain-cyan border-rain-cyan/40',
  studio_pro:  'bg-gradient-to-r from-rain-blue to-rain-cyan text-white border-transparent',
  enterprise:  'text-yellow-400 border-yellow-400/40',
}

interface Props {
  tier: Tier
  className?: string
}

export function TierBadge({ tier, className }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest border rounded',
        TIER_STYLES[tier], className,
      )}
    >
      {tier.replace('_', ' ')}
    </span>
  )
}

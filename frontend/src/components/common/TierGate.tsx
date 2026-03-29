import { Lock } from 'lucide-react'
import { useAuthStore, type Tier } from '@/stores/auth'
import { Button } from './Button'

interface Props {
  requiredTier: Tier
  children: React.ReactNode
  feature?: string
}

const TIER_LABELS: Record<Tier, string> = {
  free: 'Free', spark: 'Spark', creator: 'Creator',
  artist: 'Artist', studio_pro: 'Studio Pro', enterprise: 'Enterprise',
}

export function TierGate({ requiredTier, children, feature }: Props) {
  const { tierGte } = useAuthStore()

  if (tierGte(requiredTier)) return <>{children}</>

  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm opacity-40">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-rain-black/70 rounded">
        <Lock size={20} className="text-rain-dim mb-2" />
        <p className="text-rain-silver text-xs font-mono mb-3 text-center px-4">
          {feature ? `${feature} requires` : 'Requires'} {TIER_LABELS[requiredTier]}+
        </p>
        <Button size="sm" variant="ghost">Upgrade</Button>
      </div>
    </div>
  )
}

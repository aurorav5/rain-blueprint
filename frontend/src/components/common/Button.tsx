import { clsx } from 'clsx'
import { Loader2 } from 'lucide-react'

interface Props {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit' | 'reset'
  children: React.ReactNode
  className?: string
}

const variants = {
  primary: 'bg-rain-blue hover:bg-blue-500 text-white border-transparent',
  ghost:   'bg-transparent hover:bg-rain-panel text-rain-silver border-rain-border hover:border-rain-muted',
  danger:  'bg-rain-red hover:bg-red-500 text-white border-transparent',
}

const sizes = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-base px-6 py-3 gap-2.5',
}

export function Button({
  variant = 'primary', size = 'md', loading = false, disabled = false,
  onClick, type = 'button', children, className,
}: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center font-mono border rounded transition-colors duration-150',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className,
      )}
    >
      {loading && <Loader2 className="animate-spin" size={14} />}
      {children}
    </button>
  )
}

interface Props { children: React.ReactNode }

export function AuthLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-rain-black flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-4xl font-mono font-bold text-rain-white text-center mb-8 tracking-widest">
          R∞N
        </h1>
        <div className="bg-rain-panel border border-rain-border rounded-lg p-6">
          {children}
        </div>
      </div>
    </div>
  )
}

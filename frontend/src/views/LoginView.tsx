import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/common/Button'
import { useAuthStore, type Tier } from '@/stores/auth'
import { api, APIError } from '@/utils/api'

export default function LoginView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { setTokens } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await api.auth.login(email, password)
      setTokens(res.access_token, res.refresh_token, res.tier as Tier, res.user_id)
      void navigate('/')
    } catch (err) {
      setError(err instanceof APIError ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label className="text-rain-dim text-xs font-mono block mb-1">EMAIL</label>
          <input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full bg-rain-dark border border-rain-border rounded px-3 py-2 text-rain-white text-sm font-mono focus:border-rain-blue outline-none"
          />
        </div>
        <div>
          <label className="text-rain-dim text-xs font-mono block mb-1">PASSWORD</label>
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            className="w-full bg-rain-dark border border-rain-border rounded px-3 py-2 text-rain-white text-sm font-mono focus:border-rain-blue outline-none"
          />
        </div>
        {error && <p className="text-rain-red text-xs font-mono">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">SIGN IN</Button>
        <p className="text-rain-dim text-xs font-mono text-center">
          No account?{' '}
          <Link to="/register" className="text-rain-blue hover:underline">Register</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

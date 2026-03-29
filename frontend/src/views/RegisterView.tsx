import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { Button } from '@/components/common/Button'
import { useAuthStore, type Tier } from '@/stores/auth'
import { api, APIError } from '@/utils/api'

export default function RegisterView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { setTokens } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await api.auth.register(email, password)
      setTokens(res.access_token, res.refresh_token, res.tier as Tier, res.user_id)
      void navigate('/')
    } catch (err) {
      setError(err instanceof APIError ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        {(['EMAIL', 'PASSWORD', 'CONFIRM'] as const).map((label, i) => (
          <div key={label}>
            <label className="text-rain-dim text-xs font-mono block mb-1">{label}</label>
            <input
              type={i > 0 ? 'password' : 'email'} required
              value={i === 0 ? email : i === 1 ? password : confirm}
              onChange={(e) => [setEmail, setPassword, setConfirm][i]!(e.target.value)}
              className="w-full bg-rain-dark border border-rain-border rounded px-3 py-2 text-rain-white text-sm font-mono focus:border-rain-blue outline-none"
            />
          </div>
        ))}
        {error && <p className="text-rain-red text-xs font-mono">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">CREATE ACCOUNT</Button>
        <p className="text-rain-dim text-xs font-mono text-center">
          Have an account?{' '}
          <Link to="/login" className="text-rain-blue hover:underline">Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  )
}

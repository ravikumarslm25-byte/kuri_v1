import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { FormError } from '../components/common'

export default function Login() {
  const { user, login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={loc.state?.from || '/'} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      await login(email, password)
      nav(loc.state?.from || '/', { replace: true })
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#34211e] p-6" style={{ backgroundImage: 'radial-gradient(ellipse at top, #4a332e 0%, #34211e 55%, #1f1311 100%)' }}>
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 space-y-5">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#34211e] flex items-center justify-center mb-4">
            <svg viewBox="0 0 64 64" className="w-8 h-8" aria-hidden>
              <path d="M32 8 L36 28 L56 32 L36 36 L32 56 L28 36 L8 32 L28 28 Z" fill="#d4b037" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Kuri Oracle</h1>
          <p className="text-sm text-gray-500">Sign in to the admin panel</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <FormError message={err} />
        <button type="submit" disabled={busy} className="w-full h-10 rounded-lg bg-[#34211e] hover:bg-[#4a332e] text-white font-medium flex items-center justify-center gap-2 disabled:opacity-60">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Sign in
        </button>
      </form>
    </div>
  )
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, AUTH_EXPIRED, getToken, setToken, type AdminUser, type Permission } from './api'

interface AuthState {
  user: AdminUser | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  can: (p: Permission) => boolean
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  const [ready, setReady] = useState(false)

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null)
      return
    }
    try {
      const r = await api.get<{ user: AdminUser }>('/admin/auth/me')
      setUser(r.user)
    } catch {
      setToken('')
      setUser(null)
    }
  }, [])

  useEffect(() => {
    refresh().finally(() => setReady(true))
    const onExpired = () => {
      setToken('')
      setUser(null)
    }
    window.addEventListener(AUTH_EXPIRED, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED, onExpired)
  }, [refresh])

  const login = async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: AdminUser }>('/admin/auth/login', { email, password })
    setToken(r.token)
    setUser(r.user)
  }
  const logout = () => {
    setToken('')
    setUser(null)
  }
  const can = (p: Permission) => !!user?.permissions.includes(p)

  return <Ctx.Provider value={{ user, ready, login, logout, can, refresh }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}

import { Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { LayoutDashboard, Calendar, Monitor, FileText, Users, UsersRound, BarChart3, BookOpen, Menu, X, KeyRound, LogOut } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import type { Permission } from '../lib/api'
import { ROLE_LABEL } from '../lib/format'
import { Loading } from './common'
import { ChangePasswordDialog } from './ChangePasswordDialog'

export const NAV: { path: string; label: string; icon: typeof Calendar; perm: Permission }[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard' },
  { path: '/events', label: 'Events', icon: Calendar, perm: 'events' },
  { path: '/bookings', label: 'Bookings', icon: BookOpen, perm: 'bookings' },
  { path: '/machines', label: 'Machines', icon: Monitor, perm: 'machines' },
  { path: '/templates', label: 'Templates', icon: FileText, perm: 'templates' },
  { path: '/readings', label: 'Readings', icon: Users, perm: 'sessions' },
  { path: '/team', label: 'Team', icon: UsersRound, perm: 'team' },
  { path: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports' },
]

export default function Layout() {
  const { user, ready, can, logout } = useAuth()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const loc = useLocation()

  if (!ready) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />

  const items = NAV.filter((i) => can(i.perm))

  return (
    <div className="min-h-screen bg-background">
      <aside
        className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 fixed top-0 left-0 h-screen w-64 bg-[#34211e] transition-transform duration-300 ease-in-out z-30 flex flex-col`}
      >
        <div className="p-6 border-b border-white/10">
          <h1 className="text-white font-semibold text-lg">Kuri Oracle</h1>
          <p className="text-white/60 text-xs">Admin Panel</p>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {items.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-[#d4b037] text-[#34211e] shadow-lg' : 'text-white/70 hover:bg-white/5 hover:text-white'}`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10 relative">
          {menu && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-white rounded-xl shadow-xl overflow-hidden text-sm">
              <button className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 text-gray-700" onClick={() => (setMenu(false), setPwOpen(true))}>
                <KeyRound className="w-4 h-4" /> Change password
              </button>
              <button className="w-full flex items-center gap-2 px-4 py-3 hover:bg-gray-50 text-red-600 border-t" onClick={logout}>
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}
          <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left" onClick={() => setMenu((m) => !m)}>
            <div className="w-10 h-10 bg-[#d4b037] rounded-full flex items-center justify-center text-[#34211e] font-semibold shrink-0">{user.name.charAt(0).toUpperCase()}</div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{user.name}</p>
              <p className="text-white/50 text-xs truncate">{ROLE_LABEL[user.role]}</p>
            </div>
          </button>
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-xl border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden p-2 hover:bg-gray-100 rounded-xl transition-colors" aria-label="Menu">
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="flex-1 lg:hidden" />
            <div className="text-sm text-gray-500">{new Date().toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</div>
          </div>
        </header>
        <main className="p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  )
}

/** Route guard for a module; falls back to the first page the user can open. */
export function RequirePerm({ perm, children }: { perm: Permission; children: React.ReactNode }) {
  const { can } = useAuth()
  if (can(perm)) return <>{children}</>
  const first = NAV.find((i) => can(i.perm))
  if (first && first.perm !== perm) return <Navigate to={first.path} replace />
  return <div className="p-10 text-center text-gray-500">You don't have access to any modules yet. Ask a super admin to grant permissions.</div>
}

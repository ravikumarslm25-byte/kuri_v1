import { Link } from 'react-router'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, AlertTriangle, TrendingDown, TrendingUp, Zap, Wifi, WifiOff } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { chartTooltip, Empty, ErrorNote, Loading, Pill } from '../components/common'
import { useApi } from '../lib/useApi'
import { fileUrl } from '../lib/api'
import { ago, inr, n, pct, signedPct } from '../lib/format'

interface DashboardData {
  kpis: {
    readings30d: number
    readingsChangePct: number | null
    machinesOnline: number
    machinesTotal: number
    utilizationPct: number
    revenue30d: number
    revenueChangePct: number | null
    completionRate: number | null
    printed30d: number
  }
  systemsOnline: boolean
  weekly: { date: string; readings: number }[]
  delivery: { print: number; whatsapp: number; email: number }
  topEvents: { id: string; name: string; readings: number; printed: number }[]
  machines: { machineId: string; name: string; status: string; online: boolean; lastState: string; event: string | null }[]
  recentReadings: { sessionId: string; createdAt: string; event: string | null; machineId: string | null; thumb: string | null }[]
}

function Trend({ v }: { v: number | null }) {
  if (v === null) return <Zap className="w-4 h-4 text-[#d4b037]" />
  return v >= 0 ? <TrendingUp className="w-4 h-4 text-green-500" /> : <TrendingDown className="w-4 h-4 text-red-500" />
}

export default function Dashboard() {
  const { data: d, error, loading, reload } = useApi<DashboardData>('/admin/dashboard')
  if (loading && !d) return <Loading />
  if (error && !d) return <ErrorNote message={error} onRetry={reload} />
  if (!d) return null
  const k = d.kpis

  const kpis = [
    { title: 'Readings (30 days)', value: n(k.readings30d), change: signedPct(k.readingsChangePct), sub: 'vs previous 30 days', trend: k.readingsChangePct },
    { title: 'Machines Online', value: `${k.machinesOnline}/${k.machinesTotal}`, change: `${k.utilizationPct}%`, sub: 'booked right now', trend: null },
    { title: 'Revenue (30 days)', value: inr(k.revenue30d, true), change: signedPct(k.revenueChangePct), sub: 'confirmed bookings', trend: k.revenueChangePct },
    { title: 'Completion Rate', value: pct(k.completionRate), change: n(k.printed30d), sub: 'cards printed', trend: null },
  ]
  const deliveryTotal = d.delivery.print + d.delivery.whatsapp + d.delivery.email
  const delivery = [
    { method: 'Print', count: d.delivery.print, color: '#34211e' },
    { method: 'WhatsApp', count: d.delivery.whatsapp, color: '#d4b037' },
    { method: 'Email', count: d.delivery.email, color: '#8b7355' },
  ]
  const offline = d.machines.filter((m) => m.status === 'active' && !m.online)

  return (
    <div className="space-y-8 max-w-[1600px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 mt-1">Last 30 days across all kiosks</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-gray-200">
          {offline.length ? <AlertTriangle className="w-4 h-4 text-orange-500" /> : <Activity className="w-4 h-4 text-green-500" />}
          <span className="text-sm font-medium text-gray-700">
            {offline.length ? `${offline.length} active machine${offline.length > 1 ? 's' : ''} offline` : 'All active machines online'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <p className="text-sm text-gray-500 font-medium">{kpi.title}</p>
                <Trend v={kpi.trend} />
              </div>
              <p className="text-3xl font-semibold text-gray-900">{kpi.value}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-sm font-medium ${kpi.trend === null ? 'text-[#b8952a]' : kpi.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>{kpi.change}</span>
                <span className="text-sm text-gray-400">{kpi.sub}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Readings, last 7 days</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={d.weekly.map((w) => ({ ...w, label: format(parseISO(w.date), 'MMM d') }))}>
                <defs>
                  <linearGradient id="gReadings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#34211e" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#34211e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" stroke="#999" fontSize={12} />
                <YAxis stroke="#999" fontSize={12} allowDecimals={false} />
                <Tooltip {...chartTooltip} />
                <Area isAnimationActive={false} type="monotone" dataKey="readings" name="Readings" stroke="#34211e" strokeWidth={2} fill="url(#gReadings)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Delivery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {delivery.map((m) => (
              <div key={m.method} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{m.method}</span>
                  <span className="text-gray-500">{n(m.count)}</span>
                </div>
                <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${deliveryTotal ? (m.count / deliveryTotal) * 100 : 0}%`, backgroundColor: m.color }} />
                </div>
              </div>
            ))}
            {!d.delivery.whatsapp && !d.delivery.email && <p className="text-xs text-gray-400 pt-2">WhatsApp and email delivery are not enabled on the kiosks yet.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Fleet status</CardTitle>
            <Link to="/machines" className="text-sm text-[#a8801f] hover:underline">
              All machines
            </Link>
          </CardHeader>
          <CardContent>
            {d.machines.length === 0 ? (
              <Empty title="No machines yet" hint="Add a machine, then register the kiosk from its Setup screen." />
            ) : (
              <div className="divide-y">
                {d.machines.map((m) => (
                  <div key={m.machineId} className="flex items-center gap-3 py-3">
                    {m.online ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-gray-300" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">
                        {m.name} <span className="text-gray-400 font-normal text-sm">{m.machineId}</span>
                      </p>
                      <p className="text-sm text-gray-500 truncate">{m.event ? `At ${m.event}` : 'Not booked now'}{m.online && m.lastState ? ` · ${m.lastState} screen` : ''}</p>
                    </div>
                    <Pill value={m.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Top events</CardTitle>
          </CardHeader>
          <CardContent>
            {d.topEvents.length === 0 ? (
              <Empty title="No readings in the last 30 days" />
            ) : (
              <div className="space-y-3">
                {d.topEvents.map((e, i) => (
                  <div key={e.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#34211e] text-white text-sm font-semibold">{i + 1}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{e.name}</p>
                        <p className="text-sm text-gray-500">{n(e.printed)} printed</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-semibold text-[#b8952a]">{n(e.readings)}</p>
                      <p className="text-xs text-gray-500">readings</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {d.recentReadings.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Latest readings</CardTitle>
            <Link to="/readings" className="text-sm text-[#a8801f] hover:underline">
              All readings
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
              {d.recentReadings.map((r) => (
                <Link key={r.sessionId} to={`/readings?open=${r.sessionId}`} className="group">
                  <div className="aspect-[2/3] rounded-lg bg-[#34211e] overflow-hidden">
                    {r.thumb ? <img src={fileUrl(r.thumb)} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" /> : <div className="w-full h-full" />}
                  </div>
                  <p className="text-xs font-medium text-gray-700 mt-2 truncate">#{r.sessionId}</p>
                  <p className="text-xs text-gray-400 truncate">{ago(r.createdAt)}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

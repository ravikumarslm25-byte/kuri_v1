import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { format, parseISO, subDays } from 'date-fns'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Download, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { chartTooltip, Empty, ErrorNote, Loading, NativeSelect, PageHeader } from '../components/common'
import { useApi } from '../lib/useApi'
import { downloadCsv, qs, type Lookups } from '../lib/api'
import { inputDate, inr, n, pct, signedPct, STEP_LABEL } from '../lib/format'

interface Group {
  id: string
  name: string
  readings: number
  printed: number
  abandoned: number
}
interface ReportData {
  range: { from: string; to: string }
  totals: { readings: number; abandoned: number; completionRate: number | null; printed: number; whatsapp: number; email: number; aiShare: number | null; avgDurationSec: number | null; revenue: number }
  change: { readingsPct: number | null; revenuePct: number | null }
  daily: { date: string; readings: number }[]
  byHour: { hour: number; readings: number }[]
  byEvent: Group[]
  byMachine: Group[]
  byTemplate: Group[]
  byLanguage: { language: string; readings: number }[]
  abandonedAt: { step: string; count: number }[]
}

const PRESETS = [
  { k: '7', label: 'Last 7 days' },
  { k: '30', label: 'Last 30 days' },
  { k: '90', label: 'Last 90 days' },
  { k: 'custom', label: 'Custom range' },
]
type Tab = 'overview' | 'events' | 'machines' | 'templates' | 'guests'

export default function Reports() {
  const [preset, setPreset] = useState('30')
  const [from, setFrom] = useState(inputDate(subDays(new Date(), 29)))
  const [to, setTo] = useState(inputDate(new Date()))
  const [event, setEvent] = useState('all')
  const [machine, setMachine] = useState('all')
  const [template, setTemplate] = useState('all')
  const [tab, setTab] = useState<Tab>('overview')
  const { data: lk } = useApi<Lookups>('/admin/lookups')

  const range = preset === 'custom' ? { from, to } : { from: inputDate(subDays(new Date(), Number(preset) - 1)), to: inputDate(new Date()) }
  const query = qs({ ...range, event, machine, template })
  const { data: r, error, loading, reload } = useApi<ReportData>(`/admin/reports${query}`)

  const daily = useMemo(() => (r?.daily || []).map((d) => ({ ...d, label: format(parseISO(d.date), 'MMM d') })), [r])
  const hours = useMemo(() => (r?.byHour || []).filter((h) => h.hour >= 8 && h.hour <= 22).map((h) => ({ ...h, label: `${h.hour % 12 || 12}${h.hour < 12 ? 'AM' : 'PM'}` })), [r])

  const t = r?.totals
  return (
    <div className="space-y-6">
      <PageHeader title="Reports & Analytics" subtitle="Readings, completion and revenue for any period" />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <Filter label="Date range">
            <NativeSelect value={preset} onChange={setPreset}>
              {PRESETS.map((p) => (
                <option key={p.k} value={p.k}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </Filter>
          <Filter label="Event">
            <NativeSelect value={event} onChange={setEvent}>
              <option value="all">All events</option>
              {lk?.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </NativeSelect>
          </Filter>
          <Filter label="Machine">
            <NativeSelect value={machine} onChange={setMachine}>
              <option value="all">All machines</option>
              {lk?.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.machineId}
                </option>
              ))}
            </NativeSelect>
          </Filter>
          <Filter label="Template">
            <NativeSelect value={template} onChange={setTemplate}>
              <option value="all">All templates</option>
              {lk?.templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </NativeSelect>
          </Filter>
          <Button variant="outline" onClick={() => downloadCsv(`/admin/reports/export.csv${query}`, `kuri-report-${range.from}-to-${range.to}.csv`).catch((e) => toast.error(e.message))}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
          {preset === 'custom' && (
            <>
              <Filter label="From">
                <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              </Filter>
              <Filter label="To">
                <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
              </Filter>
            </>
          )}
        </CardContent>
      </Card>

      {error && <ErrorNote message={error} onRetry={reload} />}
      {loading && !r && <Loading />}

      {r && t && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <Kpi label="Total Readings" value={n(t.readings)} change={r.change.readingsPct} tone="text-[#b8952a]" />
            <Kpi label="Revenue" value={inr(t.revenue)} change={r.change.revenuePct} tone="text-green-600" sub="confirmed bookings starting in this period" />
            <Kpi label="Completion Rate" value={pct(t.completionRate)} tone="text-gray-900" sub={`${n(t.abandoned)} walked away`} />
            <Kpi label="Cards Printed" value={n(t.printed)} tone="text-orange-600" sub={t.readings ? `${Math.round((t.printed / t.readings) * 100)}% of readings` : undefined} />
          </div>

          <div className="inline-flex bg-gray-100 rounded-lg p-1 flex-wrap">
            {(['overview', 'events', 'machines', 'templates', 'guests'] as Tab[]).map((k) => (
              <button key={k} onClick={() => setTab(k)} className={`px-4 py-1.5 text-sm rounded-md capitalize ${tab === k ? 'bg-white shadow-sm font-medium' : 'text-gray-600'}`}>
                {k === 'guests' ? 'Guest journey' : k}
              </button>
            ))}
          </div>

          {tab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Readings per day</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={daily}>
                      <defs>
                        <linearGradient id="gDaily" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#34211e" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#34211e" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" stroke="#999" fontSize={12} minTickGap={24} />
                      <YAxis stroke="#999" fontSize={12} allowDecimals={false} />
                      <Tooltip {...chartTooltip} />
                      <Area isAnimationActive={false} type="monotone" dataKey="readings" name="Readings" stroke="#34211e" strokeWidth={2} fill="url(#gDaily)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Busiest hours</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={hours}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" stroke="#999" fontSize={11} interval={1} />
                      <YAxis stroke="#999" fontSize={12} allowDecimals={false} />
                      <Tooltip {...chartTooltip} />
                      <Bar isAnimationActive={false} dataKey="readings" name="Readings" fill="#d4b037" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {tab === 'events' && <Breakdown title="By event" rows={r.byEvent} />}
          {tab === 'machines' && <Breakdown title="By machine" rows={r.byMachine} />}
          {tab === 'templates' && <Breakdown title="By template" rows={r.byTemplate} />}

          {tab === 'guests' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border-0 shadow-sm lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">Where guests walked away</CardTitle>
                </CardHeader>
                <CardContent>
                  {r.abandonedAt.length === 0 ? (
                    <Empty title="Nobody walked away in this period" />
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={r.abandonedAt.map((a) => ({ ...a, label: STEP_LABEL[a.step] || a.step }))} layout="vertical" margin={{ left: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis type="number" stroke="#999" fontSize={12} allowDecimals={false} />
                        <YAxis type="category" dataKey="label" stroke="#999" fontSize={12} width={110} />
                        <Tooltip {...chartTooltip} />
                        <Bar isAnimationActive={false} dataKey="count" name="Guests" fill="#8b7355" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                  <p className="text-xs text-gray-500 mt-2">High drop-off at the palm scan usually means the scanner box needs better light or the guide text is unclear.</p>
                </CardContent>
              </Card>
              <Card className="border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Experience</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <Stat label="Average time per reading" value={t.avgDurationSec ? `${Math.floor(t.avgDurationSec / 60)}m ${t.avgDurationSec % 60}s` : '–'} />
                  <Stat label="Fortunes written by AI" value={pct(t.aiShare)} hint="the rest came from the offline bank (network or AI unavailable)" />
                  {r.byLanguage.map((l) => (
                    <Stat key={l.language} label={l.language === 'ta' ? 'Tamil readings' : 'English readings'} value={n(l.readings)} />
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm text-gray-600">{label}</p>
      {children}
    </div>
  )
}

function Kpi({ label, value, change, tone, sub }: { label: string; value: string; change?: number | null; tone: string; sub?: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <p className="text-sm text-gray-600">{label}</p>
        <p className={`text-3xl font-semibold mt-2 ${tone}`}>{value}</p>
        {change !== undefined ? (
          <div className={`flex items-center gap-1 text-sm mt-1 ${change === null ? 'text-gray-400' : change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {change !== null && (change >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />)}
            {signedPct(change)} <span className="text-gray-500">vs previous period</span>
          </div>
        ) : (
          sub && <p className="text-sm text-gray-500 mt-1">{sub}</p>
        )}
        {change !== undefined && sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b last:border-0 pb-3">
      <div>
        <p className="text-gray-600">{label}</p>
        {hint && <p className="text-xs text-gray-400">{hint}</p>}
      </div>
      <p className="font-semibold text-gray-900 whitespace-nowrap">{value}</p>
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: Group[] }) {
  if (!rows.length) return <Empty title="No readings in this period" />
  const total = rows.reduce((a, r) => a + r.readings, 0)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 44)}>
            <BarChart data={rows.slice(0, 12)} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" stroke="#999" fontSize={12} allowDecimals={false} />
              <YAxis type="category" dataKey="name" stroke="#999" fontSize={12} width={130} />
              <Tooltip {...chartTooltip} />
              <Bar isAnimationActive={false} dataKey="readings" name="Readings" fill="#34211e" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-600 border-b">
                <th className="py-3 px-4 font-medium">Name</th>
                <th className="py-3 px-4 font-medium text-right">Readings</th>
                <th className="py-3 px-4 font-medium text-right">Share</th>
                <th className="py-3 px-4 font-medium text-right">Printed</th>
                <th className="py-3 px-4 font-medium text-right">Walked away</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="py-3 px-4 font-medium">{r.name}</td>
                  <td className="py-3 px-4 text-right">{n(r.readings)}</td>
                  <td className="py-3 px-4 text-right text-gray-500">{total ? `${Math.round((r.readings / total) * 100)}%` : '–'}</td>
                  <td className="py-3 px-4 text-right">{n(r.printed)}</td>
                  <td className="py-3 px-4 text-right">{n(r.abandoned)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

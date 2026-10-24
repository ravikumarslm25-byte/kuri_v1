import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Download, Eye, Printer, Search, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Confirm, Empty, ErrorNote, Loading, NativeSelect, PageHeader, Pill, StatCard } from '../components/common'
import { useApi } from '../lib/useApi'
import { api, downloadCsv, fileUrl, qs, type Lookups, type Reading } from '../lib/api'
import { dateTime, n, STEP_LABEL } from '../lib/format'

interface ListData {
  page: number
  limit: number
  total: number
  items: Reading[]
}

export default function Readings() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [event, setEvent] = useState(params.get('event') || 'all')
  const [machine, setMachine] = useState('all')
  const [outcome, setOutcome] = useState('all')
  const [page, setPage] = useState(1)
  const openId = params.get('open')

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])
  useEffect(() => setPage(1), [q, event, machine, outcome])

  const filters = { q, event, machine, outcome }
  const { data, error, loading, reload } = useApi<ListData>(`/admin/sessions${qs({ ...filters, page, limit: 20 })}`)
  const { data: stats } = useApi<{ total: number; thisMonth: number; today: number; withContact: number; abandoned: number }>('/admin/sessions/stats')
  const { data: lk } = useApi<Lookups>('/admin/lookups')
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1

  const open = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('open', id)
    else p.delete('open')
    setParams(p, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Readings"
        subtitle="Every guest reading taken on the kiosks"
        actions={
          <Button variant="outline" onClick={() => downloadCsv(`/admin/sessions/export.csv${qs(filters)}`, 'kuri-readings.csv').catch((e) => toast.error(e.message))}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
        }
      />
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Total Readings" value={n(stats.total)} tone="blue" />
          <StatCard label="This Month" value={n(stats.thisMonth)} tone="green" />
          <StatCard label="Today" value={n(stats.today)} tone="purple" />
          <StatCard label="Walked Away" value={n(stats.abandoned)} tone="orange" hint="started but didn't finish" />
        </div>
      )}

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input className="pl-9" placeholder="Search by reading ID, phone or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <NativeSelect value={event} onChange={setEvent} className="w-52">
            <option value="all">All events</option>
            {lk?.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={machine} onChange={setMachine} className="w-40">
            <option value="all">All machines</option>
            {lk?.machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.machineId}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={outcome} onChange={setOutcome} className="w-40">
            <option value="all">All outcomes</option>
            <option value="completed">Completed</option>
            <option value="abandoned">Walked away</option>
          </NativeSelect>
        </CardContent>
      </Card>

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card className="border-0 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">All Readings {data && <span className="text-gray-400 font-normal text-base">({n(data.total)})</span>}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Loading />
          ) : !data?.items.length ? (
            <Empty title="No readings match" hint="The kiosk does not collect names; search by the reading ID printed on the card." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-600 border-b">
                      {['Reading', 'When', 'Event', 'Machine', 'Language', 'Delivery', 'Status', ''].map((h) => (
                        <th key={h} className="py-3 px-3 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={r.sessionId} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => open(r.sessionId)}>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#34211e] to-[#d4b037] overflow-hidden shrink-0 flex items-center justify-center text-white text-xs">
                              {r.thumb ? <img src={fileUrl(r.thumb)} alt="" className="w-full h-full object-cover" /> : <Sparkles className="w-4 h-4" />}
                            </div>
                            <span className="font-medium">#{r.sessionId}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-gray-600">{dateTime(r.createdAt)}</td>
                        <td className="py-3 px-3">{r.event?.name || <span className="text-gray-400">No event</span>}</td>
                        <td className="py-3 px-3 whitespace-nowrap">{r.machine?.machineId}</td>
                        <td className="py-3 px-3 uppercase text-gray-600">{r.language}</td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {r.delivery.printed && <span className="px-2 py-0.5 rounded-full text-xs border border-[#8b7355]/40 text-[#8b7355]">Print</span>}
                            {r.delivery.whatsapp && <span className="px-2 py-0.5 rounded-full text-xs border border-green-300 text-green-700">WhatsApp</span>}
                            {r.delivery.email && <span className="px-2 py-0.5 rounded-full text-xs border border-blue-300 text-blue-700">Email</span>}
                            {!r.delivery.printed && !r.delivery.whatsapp && !r.delivery.email && <span className="text-gray-400 text-xs">—</span>}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {r.outcome === 'abandoned' ? <Pill value="abandoned" label={`Left at ${STEP_LABEL[r.abandonedAt] || r.abandonedAt}`} /> : <Pill value="completed" label="Completed" />}
                        </td>
                        <td className="py-3 px-3">
                          <Eye className="w-4 h-4 text-gray-400" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between pt-4 text-sm text-gray-500">
                <span>
                  Page {data.page} of {pages}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="w-4 h-4" /> Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                    Next <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {openId && <ReadingDetail id={openId} onClose={() => open(null)} onErased={() => (open(null), reload())} />}
    </div>
  )
}

function ReadingDetail({ id, onClose, onErased }: { id: string; onClose: () => void; onErased: () => void }) {
  const { data: r, error, loading } = useApi<Reading>(`/admin/sessions/${encodeURIComponent(id)}`)
  const [erase, setErase] = useState(false)
  const imgs = r?.images
  const tiles = imgs ? ([['Seeker', imgs.face], ['Palm', imgs.palm], ['Enhanced palm', imgs.palmEnhanced], ['Printed card', imgs.card]] as const).filter(([, u]) => u) : []

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reading #{id}</DialogTitle>
        </DialogHeader>
        {loading && !r && <Loading />}
        {error && <ErrorNote message={error} />}
        {r && (
          <div className="space-y-6 py-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Meta label="When" value={dateTime(r.createdAt)} />
              <Meta label="Event" value={r.event?.name || '—'} />
              <Meta label="Machine" value={r.machine?.machineId || '—'} />
              <Meta label="Template" value={r.template?.name || 'Default'} />
              <Meta label="Duration" value={r.durationSec ? `${Math.floor(r.durationSec / 60)}m ${r.durationSec % 60}s` : '—'} />
              <Meta label="Language" value={r.language === 'ta' ? 'Tamil' : 'English'} />
              <Meta label="Fortune by" value={r.fortuneSource === 'ai' ? 'AI (Gemini)' : 'Offline bank'} />
              <Meta label="Outcome" value={r.outcome === 'abandoned' ? `Left at ${STEP_LABEL[r.abandonedAt] || r.abandonedAt}` : r.delivery.printed ? 'Completed · printed' : 'Completed'} />
            </div>

            {r.fortune && (
              <div className="p-5 rounded-xl bg-[#fef3e2] text-[#34211e]">
                <p className="text-xs uppercase tracking-wider text-[#8b7355] mb-2">Fortune</p>
                <p className="text-lg leading-relaxed">“{r.fortune}”</p>
              </div>
            )}

            {(r.delivery.whatsapp || r.delivery.email) && (
              <div className="text-sm p-4 bg-gray-50 rounded-lg">
                {r.delivery.whatsapp && <p>WhatsApp: {r.delivery.whatsapp}</p>}
                {r.delivery.email && <p>Email: {r.delivery.email}</p>}
              </div>
            )}

            {tiles.length > 0 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {tiles.map(([label, url]) => (
                  <a key={label} href={fileUrl(url)} target="_blank" rel="noreferrer" className="block">
                    <div className={`rounded-lg overflow-hidden bg-[#34211e] ${label === 'Printed card' ? 'aspect-[2/3]' : 'aspect-square'}`}>
                      <img src={fileUrl(url)} alt={label} className="w-full h-full object-cover" />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      {label === 'Printed card' && <Printer className="w-3 h-3" />} {label}
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">
                {r.photosErased ? 'Photos were erased automatically after the retention period.' : r.consent ? 'No photos were uploaded for this reading.' : 'The guest did not consent, so no photos were stored.'}
              </p>
            )}

            <div className="flex justify-between gap-3 pt-2 border-t">
              <Button variant="outline" className="text-red-600 mt-3" onClick={() => setErase(true)}>
                Erase this reading
              </Button>
              <Button variant="outline" className="mt-3" onClick={onClose}>
                Close
              </Button>
            </div>
            <Confirm
              open={erase}
              onOpenChange={setErase}
              title={`Erase reading #${r.sessionId}?`}
              body="Deletes the photos, card and fortune permanently. Use this when a guest asks for their data to be removed."
              confirmLabel="Erase"
              onConfirm={async () => {
                await api.del(`/admin/sessions/${encodeURIComponent(r.sessionId)}`)
                toast.success('Reading erased')
                onErased()
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg min-w-0">
      <p className="text-gray-500">{label}</p>
      <p className="font-medium truncate" title={value}>
        {value}
      </p>
    </div>
  )
}

import { useState } from 'react'
import { toast } from 'sonner'
import { Activity, Calendar, IdCard, MapPin, Monitor, Plus, Settings, Wifi, WifiOff } from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Confirm, Empty, ErrorNote, Field, FormError, Loading, NativeSelect, PageHeader, Pill, SaveButton, StatCard, primaryBtn } from '../components/common'
import { useApi } from '../lib/useApi'
import { api, fileUrl, type Machine, type Template } from '../lib/api'
import { ago, date, dateTime, n } from '../lib/format'

interface MachinesData {
  stats: { total: number; active: number; available: number; maintenance: number; online: number }
  items: Machine[]
}

export default function Machines() {
  const { data, error, loading, reload } = useApi<MachinesData>('/admin/machines')
  const [adding, setAdding] = useState(false)
  const [manage, setManage] = useState<Machine | null>(null)
  const s = data?.stats

  return (
    <div className="space-y-6">
      <PageHeader
        title="Machines"
        subtitle="Monitor and manage your kiosk devices"
        actions={
          <Button className={primaryBtn} onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Machine
          </Button>
        }
      />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Total Machines" value={s.total} tone="blue" hint={`${s.online} online now`} />
          <StatCard label="Active" value={s.active} tone="green" />
          <StatCard label="Available" value={s.available} tone="gray" />
          <StatCard label="Maintenance" value={s.maintenance} tone="orange" />
        </div>
      )}
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty title="No machines yet" hint="Add a machine here, then register the kiosk from its Setup screen with the same Machine ID." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {data.items.map((m) => (
            <MachineCard key={m.id} m={m} onManage={() => setManage(m)} />
          ))}
        </div>
      )}
      {adding && <AddMachine onClose={() => setAdding(false)} onSaved={reload} />}
      {manage && <ManageMachine id={manage.id} onClose={() => setManage(null)} onChanged={reload} />}
    </div>
  )
}

function MachineCard({ m, onManage }: { m: Machine; onManage: () => void }) {
  const iconTone = m.status === 'active' ? 'bg-green-50 text-green-600' : m.status === 'maintenance' ? 'bg-orange-50 text-orange-600' : 'bg-[#fef3e2] text-[#b8952a]'
  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconTone}`}>
              <Monitor className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{m.name}</h3>
              <p className="text-gray-500 text-sm">{m.machineId}</p>
            </div>
          </div>
          <span title={m.online ? `Online · ${m.lastState || 'idle'}` : `Offline · last seen ${ago(m.lastHeartbeatAt)}`}>
            {m.online ? <Wifi className="w-5 h-5 text-green-500" /> : <WifiOff className="w-5 h-5 text-gray-300" />}
          </span>
        </div>
        <div className="flex gap-2">
          <Pill value={m.status} />
          {!m.registered && <Pill value="pending" label="Not registered" />}
          {m.pendingUploads > 0 && <Pill value="maintenance" label={`${m.pendingUploads} waiting to sync`} />}
        </div>
        <div className="space-y-3 text-sm">
          <Row icon={MapPin} label="Location" value={m.location || '—'} />
          {m.currentEvent && <Row icon={Calendar} label="Current event" value={m.currentEvent.name} />}
          <Row icon={IdCard} label="Prints" value={printsLabel(m)} />
          <Row icon={Activity} label="Last active" value={ago(m.lastHeartbeatAt)} />
        </div>
        <div className="border-t pt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Today's readings</span>
            <span className="font-semibold">{n(m.readingsToday)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">All-time readings</span>
            <span className="font-semibold">{n(m.readingsTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">App version</span>
            <span className="font-semibold">{m.appVersion || '—'}</span>
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={onManage}>
          <Settings className="w-4 h-4 mr-1" /> Manage
        </Button>
      </CardContent>
    </Card>
  )
}

/** e.g. "Cosmic Fortune · custom card (machine default)" or "Standard Kuri card (no template)". */
function printsLabel(m: Machine) {
  const t = m.currentTemplate
  if (!t) return 'Standard Kuri card (no event booked, no default template)'
  const kind = t.customCard ? 'custom card' : t.hasArtwork ? 'artwork, spaces not set' : 'standard card'
  return `${t.name} · ${kind} (from ${t.source})`
}

function Row({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5" />
      <div>
        <p className="text-gray-500">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  )
}

function AddMachine({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ machineId: '', name: '', location: '', status: 'available' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setErr('')
    setBusy(true)
    try {
      await api.post('/admin/machines', { ...f, name: f.name || f.machineId })
      toast.success(`${f.machineId.toUpperCase()} added. Register it from the kiosk's Setup screen.`)
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register New Machine</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label="Machine ID" hint="Enter the same ID on the kiosk's Setup screen">
            <Input value={f.machineId} onChange={(e) => setF({ ...f, machineId: e.target.value.toUpperCase() })} placeholder="e.g. KURI-007" autoFocus />
          </Field>
          <Field label="Machine name">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Kiosk 007" />
          </Field>
          <Field label="Current location">
            <Input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="e.g. Warehouse - Chennai" />
          </Field>
          <Field label="Status">
            <NativeSelect value={f.status} onChange={(v) => setF({ ...f, status: v })}>
              <option value="available">Available</option>
              <option value="active">Active</option>
              <option value="maintenance">Maintenance</option>
            </NativeSelect>
          </Field>
          <FormError message={err} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SaveButton busy={busy} onClick={save}>
              Register Machine
            </SaveButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface MachineDetail extends Machine {
  upcomingBookings: { id: string; bookingId: string; event: string; startDate: string; endDate: string; status: string }[]
  recentSessions: { sessionId: string; createdAt: string; outcome: string; printed: boolean; thumb: string | null }[]
}

function ManageMachine({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data: m, error, loading, reload } = useApi<MachineDetail>(`/admin/machines/${id}`)
  const { data: templates } = useApi<{ items: Template[] }>('/admin/templates')
  const [f, setF] = useState<{ name: string; location: string; status: string; defaultTemplate: string } | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<'revoke' | 'delete' | null>(null)
  const form = f || (m ? { name: m.name, location: m.location, status: m.status, defaultTemplate: m.defaultTemplate || '' } : null)

  const save = async () => {
    if (!form) return
    setErr('')
    setBusy(true)
    try {
      await api.patch(`/admin/machines/${id}`, { ...form, defaultTemplate: form.defaultTemplate || null })
      toast.success('Machine updated')
      onChanged()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{m ? `${m.name} · ${m.machineId}` : 'Machine'}</DialogTitle>
        </DialogHeader>
        {loading && !m && <Loading />}
        {error && <ErrorNote message={error} />}
        {m && form && (
          <div className="space-y-6 py-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Tile label="Connection" value={m.online ? 'Online' : 'Offline'} sub={m.online ? `${m.lastState || 'idle'} screen` : `seen ${ago(m.lastHeartbeatAt)}`} />
              <Tile label="Registered" value={m.registered ? 'Yes' : 'No'} sub={m.registered ? `v${m.appVersion || '?'}` : 'use the kiosk Setup screen'} />
              <Tile label="Palm camera" value={m.hardware?.palmCamera || '—'} />
              <Tile label="Face camera" value={m.hardware?.faceCamera || '—'} />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Name">
                <Input value={form.name} onChange={(e) => setF({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Location">
                <Input value={form.location} onChange={(e) => setF({ ...form, location: e.target.value })} />
              </Field>
              <Field label="Status" hint="Retired machines can no longer connect">
                <NativeSelect value={form.status} onChange={(v) => setF({ ...form, status: v })}>
                  <option value="available">Available</option>
                  <option value="active">Active</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="retired">Retired</option>
                </NativeSelect>
              </Field>
              <Field label="Default card template" hint="Printed when no confirmed booking or event gives this kiosk a template (testing, showroom).">
                <NativeSelect value={form.defaultTemplate} onChange={(v) => setF({ ...form, defaultTemplate: v })}>
                  <option value="">None (standard Kuri card)</option>
                  {(templates?.items || [])
                    .filter((t) => t.status !== 'archived' || t.id === form.defaultTemplate)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.code}){t.cardLayout && t.cardImageUrl ? ' · custom card' : ''}
                      </option>
                    ))}
                </NativeSelect>
              </Field>
            </div>
            <p className="text-sm -mt-2 px-3 py-2 rounded-lg bg-[#fef3e2] text-[#6b4e1f]">
              <b>Prints now:</b> {printsLabel(m)}. Order used: the booking’s template, then the event’s, then this default. Changes reach the kiosk within 30 seconds.
            </p>

            <div>
              <h4 className="font-semibold mb-2">Upcoming bookings</h4>
              {m.upcomingBookings.length === 0 ? (
                <p className="text-sm text-gray-500 p-3 bg-gray-50 rounded-lg">None.</p>
              ) : (
                <div className="border rounded-lg divide-y text-sm">
                  {m.upcomingBookings.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 p-3">
                      <span className="font-medium w-24">{b.bookingId}</span>
                      <span className="flex-1">{b.event}</span>
                      <span className="text-gray-500">{date(b.startDate)}</span>
                      <Pill value={b.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            {m.recentSessions.length > 0 && (
              <div>
                <h4 className="font-semibold mb-2">Latest readings</h4>
                <div className="grid grid-cols-5 gap-3">
                  {m.recentSessions.slice(0, 5).map((s) => (
                    <div key={s.sessionId} className="text-xs">
                      <div className="aspect-[2/3] rounded bg-[#34211e] overflow-hidden">{s.thumb && <img src={fileUrl(s.thumb)} alt="" className="w-full h-full object-cover" />}</div>
                      <p className="mt-1 truncate">#{s.sessionId}</p>
                      <p className="text-gray-400">{dateTime(s.createdAt)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <FormError message={err} />
            <div className="flex flex-wrap justify-between gap-3 pt-2 border-t">
              <div className="flex gap-2 pt-3">
                {m.registered && (
                  <Button variant="outline" onClick={() => setConfirm('revoke')}>
                    Disconnect kiosk
                  </Button>
                )}
                {m.readingsTotal === 0 && (
                  <Button variant="outline" className="text-red-600" onClick={() => setConfirm('delete')}>
                    Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-3 pt-3">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                <SaveButton busy={busy} onClick={save}>
                  Save changes
                </SaveButton>
              </div>
            </div>
            <Confirm
              open={confirm !== null}
              onOpenChange={(o) => !o && setConfirm(null)}
              title={confirm === 'delete' ? `Delete ${m.machineId}?` : `Disconnect ${m.machineId}?`}
              body={confirm === 'delete' ? 'Its bookings are removed too. This cannot be undone.' : 'The kiosk keeps working offline but stops syncing until staff register it again with the provision key. Use this if a kiosk PC is lost or replaced.'}
              confirmLabel={confirm === 'delete' ? 'Delete' : 'Disconnect'}
              onConfirm={async () => {
                if (confirm === 'delete') {
                  await api.del(`/admin/machines/${id}`)
                  toast.success('Machine deleted')
                  onChanged()
                  onClose()
                } else {
                  await api.post(`/admin/machines/${id}/revoke`)
                  toast.success('Kiosk disconnected')
                  reload()
                  onChanged()
                }
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg min-w-0">
      <p className="text-gray-500">{label}</p>
      <p className="font-medium truncate" title={value}>
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
    </div>
  )
}

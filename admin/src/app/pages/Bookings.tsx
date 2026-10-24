import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Download, Edit, Plus, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Confirm, Empty, ErrorNote, Field, FormError, Loading, NativeSelect, PageHeader, Pill, SaveButton, primaryBtn } from '../components/common'
import { useApi } from '../lib/useApi'
import { api, downloadCsv, qs, type Booking, type Lookups } from '../lib/api'
import { date, inputDate, inr } from '../lib/format'

export default function Bookings() {
  const [params] = useSearchParams()
  const [status, setStatus] = useState('all')
  const [event, setEvent] = useState(params.get('event') || 'all')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Booking | 'new' | null>(null)
  const query = qs({ status, event })
  const { data, error, loading, reload } = useApi<{ items: Booking[] }>(`/admin/bookings${query}`)
  const { data: lk } = useApi<Lookups>('/admin/lookups')

  const items = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return data?.items || []
    return (data?.items || []).filter((b) => [b.bookingId, b.event?.name, b.event?.client, b.machine?.machineId].some((s) => s?.toLowerCase().includes(t)))
  }, [data, q])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        subtitle="Which machine is at which event, and when"
        actions={
          <Button className={primaryBtn} onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4 mr-1" /> New Booking
          </Button>
        }
      />

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input className="pl-9" placeholder="Search bookings, events, clients, machines…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <NativeSelect value={event} onChange={setEvent} className="w-56">
            <option value="all">All events</option>
            {lk?.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect value={status} onChange={setStatus} className="w-40">
            <option value="all">Any status</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </NativeSelect>
          <Button variant="outline" onClick={() => downloadCsv(`/admin/bookings/export.csv${query}`, 'kuri-bookings.csv').catch((e) => toast.error(e.message))}>
            <Download className="w-4 h-4 mr-1" /> Export
          </Button>
        </CardContent>
      </Card>

      {error && <ErrorNote message={error} onRetry={reload} />}

      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">All Bookings</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && !data ? (
            <Loading />
          ) : items.length === 0 ? (
            <Empty title="No bookings" hint="A kiosk only shows an event once it has a confirmed booking for that machine." action={<Button className={primaryBtn} onClick={() => setEditing('new')}>New Booking</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-600 border-b">
                    {['Booking ID', 'Event', 'Client', 'Dates', 'Machine', 'Template', 'Amount', 'Status', ''].map((h) => (
                      <th key={h} className="py-3 px-3 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((b) => (
                    <tr key={b.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-3 font-medium whitespace-nowrap">{b.bookingId}</td>
                      <td className="py-3 px-3">{b.event?.name}</td>
                      <td className="py-3 px-3 text-gray-600">{b.event?.client}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {date(b.startDate)}
                        {inputDate(b.startDate) !== inputDate(b.endDate) && <span className="text-gray-400"> → {date(b.endDate)}</span>}
                        {b.shift !== 'full' && <span className="block text-xs text-gray-400 capitalize">{b.shift}</span>}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">{b.machine?.machineId}</td>
                      <td className="py-3 px-3">
                        {b.template ? (
                          <>
                            {b.template.name}
                            <span className="block text-xs text-gray-400">{b.template.code}</span>
                          </>
                        ) : (
                          <span className="text-gray-400">Event template</span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">{inr(b.amount)}</td>
                      <td className="py-3 px-3">
                        <Pill value={b.status} />
                      </td>
                      <td className="py-3 px-3">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(b)} aria-label="Edit">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && <BookingForm initial={editing === 'new' ? null : editing} presetEvent={event !== 'all' ? event : ''} lk={lk} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  )
}

function BookingForm({ initial, presetEvent, lk, onClose, onSaved }: { initial: Booking | null; presetEvent: string; lk: Lookups | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    event: initial?.event?.id || presetEvent,
    machine: initial?.machine?.id || '',
    startDate: inputDate(initial?.startDate),
    endDate: inputDate(initial?.endDate),
    shift: initial?.shift || 'full',
    template: initial?.template?.id || '',
    status: initial?.status || 'confirmed',
    amount: initial ? String(initial.amount || '') : '',
    notes: initial?.notes || '',
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }))
  const ev = lk?.events.find((e) => e.id === f.event)

  // Default the dates to the event's dates when an event is picked.
  useEffect(() => {
    if (!initial && ev) setF((p) => ({ ...p, startDate: inputDate(ev.startDate), endDate: inputDate(ev.endDate) }))
  }, [ev, initial])

  const save = async () => {
    setErr('')
    if (!f.event || !f.machine) return setErr('Pick an event and a machine')
    setBusy(true)
    const body = { event: f.event, machine: f.machine, startDate: f.startDate || undefined, endDate: f.endDate || undefined, shift: f.shift, template: f.template || null, status: f.status, amount: Number(f.amount) || 0, notes: f.notes }
    try {
      if (initial) await api.patch(`/admin/bookings/${initial.id}`, body)
      else await api.post('/admin/bookings', body)
      toast.success(initial ? 'Booking updated' : 'Booking created')
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
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? `Booking ${initial.bookingId}` : 'New Booking'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label="Event">
            <NativeSelect value={f.event} onChange={(v) => set('event', v)}>
              <option value="">Select event…</option>
              {lk?.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} ({date(e.startDate)})
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Machine">
            <NativeSelect value={f.machine} onChange={(v) => set('machine', v)}>
              <option value="">Select machine…</option>
              {lk?.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.machineId} · {m.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="From">
              <Input type="date" value={f.startDate} min={ev ? inputDate(ev.startDate) : undefined} max={ev ? inputDate(ev.endDate) : undefined} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={f.endDate} min={f.startDate} max={ev ? inputDate(ev.endDate) : undefined} onChange={(e) => set('endDate', e.target.value)} />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Shift">
              <NativeSelect value={f.shift} onChange={(v) => set('shift', v)}>
                <option value="full">Full day</option>
                <option value="morning">Morning</option>
                <option value="evening">Evening</option>
              </NativeSelect>
            </Field>
            <Field label="Status" hint="Only confirmed bookings activate the kiosk">
              <NativeSelect value={f.status} onChange={(v) => set('status', v)}>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Template override">
              <NativeSelect value={f.template} onChange={(v) => set('template', v)}>
                <option value="">Use the event's template</option>
                {lk?.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Amount (₹)" hint="Counts towards revenue when confirmed">
              <Input type="number" min={0} value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" />
            </Field>
          </div>
          <Field label="Notes">
            <Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
          <FormError message={err} />
          <div className="flex justify-between gap-3 pt-2">
            <div>
              {initial && initial.status !== 'confirmed' && (
                <Button variant="outline" className="text-red-600" onClick={() => setConfirmDel(true)}>
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <SaveButton busy={busy} onClick={save}>
                {initial ? 'Save changes' : 'Create Booking'}
              </SaveButton>
            </div>
          </div>
        </div>
        {initial && (
          <Confirm
            open={confirmDel}
            onOpenChange={setConfirmDel}
            title={`Delete ${initial.bookingId}?`}
            body="This removes the booking permanently."
            confirmLabel="Delete"
            onConfirm={async () => {
              await api.del(`/admin/bookings/${initial.id}`)
              toast.success('Booking deleted')
              onSaved()
              onClose()
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

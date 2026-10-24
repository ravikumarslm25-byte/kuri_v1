import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { format, isWithinInterval, parseISO, startOfDay, endOfDay } from 'date-fns'
import { Activity, Calendar as CalendarIcon, Edit, Eye, FileText, MapPin, Monitor, Plus, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Calendar } from '../components/ui/calendar'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Switch } from '../components/ui/switch'
import { Confirm, Empty, ErrorNote, Field, FormError, Loading, NativeSelect, PageHeader, Pill, SaveButton, primaryBtn } from '../components/common'
import { useApi } from '../lib/useApi'
import { api, fileUrl, type EventItem, type Lookups, type Phase } from '../lib/api'
import { dateTime, inputDate, inr, n, range } from '../lib/format'
import { useAuth } from '../lib/auth'

const TABS: { key: 'all' | Phase; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
]

export default function Events() {
  const { data, error, loading, reload } = useApi<{ items: EventItem[] }>('/admin/events')
  const [tab, setTab] = useState<'all' | Phase>('all')
  const [selected, setSelected] = useState<Date | undefined>(new Date())
  const [editing, setEditing] = useState<EventItem | 'new' | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)

  const events = data?.items || []
  const eventDays = useMemo(
    () =>
      events
        .filter((e) => e.phase !== 'cancelled')
        .flatMap((e) => {
          const out: Date[] = []
          for (let d = startOfDay(parseISO(e.startDate)); d <= parseISO(e.endDate); d = new Date(d.getTime() + 86_400_000)) out.push(d)
          return out
        }),
    [events],
  )
  const onDay = selected ? events.filter((e) => isWithinInterval(selected, { start: startOfDay(parseISO(e.startDate)), end: endOfDay(parseISO(e.endDate)) })) : []
  const shown = tab === 'all' ? events : events.filter((e) => e.phase === tab)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        subtitle="Client events, their dates and fortune template"
        actions={
          <Button className={primaryBtn} onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4 mr-1" /> Add Event
          </Button>
        }
      />
      {error && <ErrorNote message={error} onRetry={reload} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-0 shadow-sm self-start">
          <CardHeader>
            <CardTitle className="text-lg">Event Calendar</CardTitle>
          </CardHeader>
          <CardContent>
            <Calendar
              mode="single"
              selected={selected}
              onSelect={setSelected}
              className="rounded-md border"
              modifiers={{ hasEvent: eventDays }}
              modifiersStyles={{ hasEvent: { backgroundColor: '#fef3e2', fontWeight: 'bold', color: '#34211e' } }}
            />
            <div className="mt-4 space-y-2">
              {onDay.length ? (
                <>
                  <p className="font-medium text-sm">{selected && format(selected, 'MMM d, yyyy')}</p>
                  {onDay.map((e) => (
                    <button key={e.id} className="w-full text-left text-sm p-3 bg-[#fef3e2] rounded-lg hover:bg-[#fce8c9]" onClick={() => setViewId(e.id)}>
                      <p className="font-medium text-[#34211e]">{e.name}</p>
                      <p className="text-[#8b7355] text-xs">{e.client}</p>
                    </button>
                  ))}
                </>
              ) : (
                selected && <p className="p-3 bg-gray-50 rounded-lg text-center text-sm text-gray-500">No events on this date</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">All Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="inline-flex bg-gray-100 rounded-lg p-1 mb-4 flex-wrap">
              {TABS.map((t) => (
                <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 text-sm rounded-md ${tab === t.key ? 'bg-white shadow-sm font-medium' : 'text-gray-600'}`}>
                  {t.label}
                  <span className="ml-1 text-gray-400">{t.key === 'all' ? events.length : events.filter((e) => e.phase === t.key).length}</span>
                </button>
              ))}
            </div>
            {loading && !data ? (
              <Loading />
            ) : shown.length === 0 ? (
              <Empty title="No events here" hint="Create an event, then book machines for it on the Bookings page." />
            ) : (
              <div className="space-y-4">
                {shown.map((e) => (
                  <EventCard key={e.id} e={e} onView={() => setViewId(e.id)} onEdit={() => setEditing(e)} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {editing && <EventForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {viewId && <EventDetail id={viewId} onClose={() => setViewId(null)} onChanged={reload} onEdit={(e) => (setViewId(null), setEditing(e))} />}
    </div>
  )
}

function EventCard({ e, onView, onEdit }: { e: EventItem; onView: () => void; onEdit: () => void }) {
  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h3 className="font-semibold text-lg">{e.name}</h3>
            <Pill value={e.phase} />
          </div>
          <p className="text-gray-600">{e.client || '—'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onView} aria-label="View">
            <Eye className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit} aria-label="Edit">
            <Edit className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Info icon={CalendarIcon} label="Dates" value={range(e.startDate, e.endDate)} />
        <Info icon={MapPin} label="Venue" value={e.venue || '—'} />
        <Info icon={FileText} label="Template" value={e.template?.name || 'Default'} />
        <Info icon={Users} label="Scans" value={<span className="font-semibold text-[#b8952a]">{n(e.scans)}</span>} />
      </div>
    </div>
  )
}

function Info({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-gray-500">{label}</p>
        <p className="font-medium truncate">{value}</p>
      </div>
    </div>
  )
}

function EventForm({ initial, onClose, onSaved }: { initial: EventItem | null; onClose: () => void; onSaved: () => void }) {
  const { data: lk } = useApi<Lookups>('/admin/lookups')
  const [f, setF] = useState({
    name: initial?.name || '',
    client: initial?.client || '',
    venue: initial?.venue || '',
    startDate: inputDate(initial?.startDate),
    endDate: inputDate(initial?.endDate),
    template: initial?.template?.id || '',
    language: initial?.language || 'en',
    expectedAttendees: initial?.expectedAttendees ? String(initial.expectedAttendees) : '',
    contactName: initial?.contact?.name || '',
    contactPhone: initial?.contact?.phone || '',
    cardFooter: initial?.branding?.cardFooter || '',
    print: initial ? initial.deliveryOptions.print : true,
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f, v: string | boolean) => setF((p) => ({ ...p, [k]: v }))

  const save = async () => {
    setErr('')
    if (!f.name.trim() || !f.startDate || !f.endDate) return setErr('Name, start date and end date are required')
    setBusy(true)
    const body = {
      name: f.name.trim(),
      client: f.client.trim(),
      venue: f.venue.trim(),
      startDate: f.startDate,
      endDate: f.endDate,
      template: f.template || null,
      language: f.language,
      expectedAttendees: Number(f.expectedAttendees) || 0,
      contact: { name: f.contactName.trim(), phone: f.contactPhone.trim() },
      branding: { cardFooter: f.cardFooter.trim(), logoUrl: '' },
      deliveryOptions: { print: f.print, whatsapp: false, email: false },
    }
    try {
      if (initial) await api.patch(`/admin/events/${initial.id}`, body)
      else await api.post('/admin/events', body)
      toast.success(initial ? 'Event updated' : 'Event created')
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Event' : 'Add New Event'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Event name">
              <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Tech Summit 2026" />
            </Field>
            <Field label="Client">
              <Input value={f.client} onChange={(e) => set('client', e.target.value)} placeholder="Client company" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Start date">
              <Input type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </Field>
            <Field label="End date">
              <Input type="date" value={f.endDate} min={f.startDate} onChange={(e) => set('endDate', e.target.value)} />
            </Field>
          </div>
          <Field label="Venue">
            <Input value={f.venue} onChange={(e) => set('venue', e.target.value)} placeholder="Venue, city" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Fortune template" hint="A booking can override this per machine">
              <NativeSelect value={f.template} onChange={(v) => set('template', v)}>
                <option value="">Default (Cosmic, general)</option>
                {lk?.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Language on the kiosk">
              <NativeSelect value={f.language} onChange={(v) => set('language', v)}>
                <option value="en">English only</option>
                <option value="ta">Tamil only</option>
                <option value="en+ta">Guest chooses (English / Tamil)</option>
              </NativeSelect>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Expected attendees">
              <Input type="number" min={0} value={f.expectedAttendees} onChange={(e) => set('expectedAttendees', e.target.value)} placeholder="e.g. 5000" />
            </Field>
            <Field label="Card footer" hint="Printed on every keepsake card">
              <Input value={f.cardFooter} maxLength={48} onChange={(e) => set('cardFooter', e.target.value)} placeholder="e.g. Tech Summit 2026 · Chennai" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Contact person">
              <Input value={f.contactName} onChange={(e) => set('contactName', e.target.value)} />
            </Field>
            <Field label="Contact phone">
              <Input value={f.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} placeholder="+91 XXXXX XXXXX" />
            </Field>
          </div>
          <label className="flex items-center justify-between gap-4 p-3 rounded-lg bg-gray-50">
            <span className="text-sm">
              <span className="font-medium">Print keepsake cards</span>
              <span className="block text-gray-500">Turn off for events without a printer</span>
            </span>
            <Switch checked={f.print} onCheckedChange={(v) => set('print', v)} />
          </label>
          <FormError message={err} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SaveButton busy={busy} onClick={save}>
              {initial ? 'Save changes' : 'Create Event'}
            </SaveButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface EventDetailData extends EventItem {
  abandoned: number
  bookings: { id: string; bookingId: string; machine: { machineId: string; name: string } | null; template: { name: string } | null; startDate: string; endDate: string; status: string; amount: number }[]
  recentSessions: { sessionId: string; createdAt: string; outcome: string; printed: boolean; fortune: string; face: string | null; palm: string | null }[]
}

function EventDetail({ id, onClose, onChanged, onEdit }: { id: string; onClose: () => void; onChanged: () => void; onEdit: (e: EventItem) => void }) {
  const { can } = useAuth()
  const { data: e, error, loading } = useApi<EventDetailData>(`/admin/events/${id}`)
  const [confirm, setConfirm] = useState<'cancel' | 'restore' | 'delete' | null>(null)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Event Details</DialogTitle>
        </DialogHeader>
        {loading && !e && <Loading />}
        {error && <ErrorNote message={error} />}
        {e && (
          <div className="space-y-6 py-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-2xl font-semibold">{e.name}</h3>
                <p className="text-gray-500">{e.client}</p>
              </div>
              <Pill value={e.phase} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Box icon={CalendarIcon} label="Dates" value={range(e.startDate, e.endDate)} />
              <Box icon={MapPin} label="Venue" value={e.venue || '—'} />
              <Box icon={Monitor} label="Machines" value={`${e.machineCount} booked`} />
              <Box icon={Users} label="Expected attendees" value={e.expectedAttendees ? n(e.expectedAttendees) : '—'} />
              <Box icon={FileText} label="Template" value={e.template?.name || 'Default'} />
              <div className="p-4 bg-[#fef3e2] rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-[#d4b037]" />
                  <p className="text-sm text-[#8b7355]">Total scans</p>
                </div>
                <p className="font-semibold text-2xl text-[#34211e]">{n(e.scans)}</p>
                {e.abandoned > 0 && <p className="text-xs text-[#8b7355]">{n(e.abandoned)} walked away</p>}
              </div>
            </div>

            {(e.contact?.name || e.contact?.phone) && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium mb-1">Contact person</p>
                <p className="text-gray-700">{e.contact.name}</p>
                <p className="text-sm text-gray-500">{e.contact.phone}</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold">Machine bookings</h4>
                {can('bookings') && (
                  <Link to={`/bookings?event=${e.id}`} className="text-sm text-[#a8801f] hover:underline">
                    Manage bookings
                  </Link>
                )}
              </div>
              {e.bookings.length === 0 ? (
                <p className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">No machines booked. Kiosks only show this event once a booking is confirmed.</p>
              ) : (
                <div className="border rounded-lg divide-y">
                  {e.bookings.map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                      <span className="font-medium w-24">{b.bookingId}</span>
                      <span className="w-24">{b.machine?.machineId}</span>
                      <span className="flex-1 text-gray-500">{range(b.startDate, b.endDate)}</span>
                      <span className="text-gray-500">{b.template?.name || 'Event template'}</span>
                      <span className="w-24 text-right">{inr(b.amount)}</span>
                      <Pill value={b.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="font-semibold mb-2">Recent readings</h4>
              {e.recentSessions.length === 0 ? (
                <p className="text-sm text-gray-500 p-4 bg-gray-50 rounded-lg">{e.phase === 'upcoming' ? "This event hasn't started yet." : 'No readings yet.'}</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {e.recentSessions.map((s) => (
                    <div key={s.sessionId} className="flex items-center gap-4 p-3 border rounded-lg">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#34211e] to-[#d4b037] overflow-hidden shrink-0">
                        {(s.face || s.palm) && <img src={fileUrl(s.face || s.palm)} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">#{s.sessionId}</p>
                        <p className="text-sm text-gray-500 truncate">{s.fortune || '—'}</p>
                      </div>
                      <div className="text-right text-xs text-gray-500 shrink-0">
                        <p>{dateTime(s.createdAt)}</p>
                        <p>{s.outcome === 'abandoned' ? 'Walked away' : s.printed ? 'Printed' : 'Not printed'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {e.scans > 0 && can('sessions') && (
                <Link to={`/readings?event=${e.id}`} className="block text-center text-sm text-[#a8801f] hover:underline mt-3">
                  View all {n(e.scans)} readings
                </Link>
              )}
            </div>

            <div className="flex flex-wrap justify-between gap-3 pt-2 border-t">
              <div className="flex gap-2 pt-3">
                {e.phase === 'cancelled' ? (
                  <Button variant="outline" onClick={() => setConfirm('restore')}>
                    Restore event
                  </Button>
                ) : (
                  <Button variant="outline" className="text-red-600" onClick={() => setConfirm('cancel')}>
                    Cancel event
                  </Button>
                )}
                {e.scans === 0 && e.abandoned === 0 && (
                  <Button variant="outline" className="text-red-600" onClick={() => setConfirm('delete')}>
                    Delete
                  </Button>
                )}
              </div>
              <div className="pt-3">
                <Button className={primaryBtn} onClick={() => onEdit(e)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit
                </Button>
              </div>
            </div>

            <Confirm
              open={confirm !== null}
              onOpenChange={(o) => !o && setConfirm(null)}
              destructive={confirm !== 'restore'}
              title={confirm === 'delete' ? 'Delete this event?' : confirm === 'restore' ? 'Restore this event?' : 'Cancel this event?'}
              body={confirm === 'delete' ? 'Its bookings are deleted too. This cannot be undone.' : confirm === 'restore' ? 'Kiosks with confirmed bookings will show it again.' : 'Kiosks stop showing it straight away. Readings are kept.'}
              confirmLabel={confirm === 'delete' ? 'Delete' : confirm === 'restore' ? 'Restore' : 'Cancel event'}
              onConfirm={async () => {
                if (confirm === 'delete') {
                  await api.del(`/admin/events/${e.id}`)
                  toast.success('Event deleted')
                  onChanged()
                  onClose()
                  return
                }
                await api.patch(`/admin/events/${e.id}`, { status: confirm === 'restore' ? 'upcoming' : 'cancelled' })
                toast.success(confirm === 'restore' ? 'Event restored' : 'Event cancelled')
                onChanged()
                onClose()
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Box({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-gray-400" />
        <p className="text-sm text-gray-500">{label}</p>
      </div>
      <p className="font-medium">{value}</p>
    </div>
  )
}

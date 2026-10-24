import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Edit, ImagePlus, LayoutTemplate, Plus, Sparkles, Trash2 } from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Confirm, Empty, ErrorNote, Field, FormError, Loading, NativeSelect, PageHeader, Pill, SaveButton, StatCard, primaryBtn } from '../components/common'
import { useApi } from '../lib/useApi'
import { api, fileToDataUrl, fileUrl, type Template } from '../lib/api'
import { n } from '../lib/format'
import { CardLayoutEditor } from '../components/CardLayoutEditor'
import { useCardPreview } from '../lib/cardPreview'

interface TemplatesData {
  stats: { total: number; active: number; drafts: number; totalUsage: number }
  items: Template[]
}

const THEMES: { v: Template['theme']; label: string; hint: string }[] = [
  {
    v: 'general',
    label: 'General destiny',
    hint: 'Purpose, prosperity, people around them',
  },
  {
    v: 'love',
    label: 'Love & relationships',
    hint: 'Bonds of the heart (weddings, expos)',
  },
  {
    v: 'career',
    label: 'Career & ambition',
    hint: 'Work, recognition (corporate events)',
  },
  {
    v: 'wealth',
    label: 'Wealth & fortune',
    hint: 'Abundance, good fortune (festivals)',
  },
  {
    v: 'health',
    label: 'Energy & balance',
    hint: 'Inner strength (never mentions illness)',
  },
]

export default function Templates() {
  const { data, error, loading, reload } = useApi<TemplatesData>('/admin/templates')
  const [editing, setEditing] = useState<Template | 'new' | null>(null)
  const s = data?.stats

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        subtitle="Fortune themes and keepsake card artwork"
        actions={
          <Button className={primaryBtn} onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4 mr-1" /> New Template
          </Button>
        }
      />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Total Templates" value={s.total} />
          <StatCard label="Active" value={s.active} tone="green" />
          <StatCard label="Total Usage" value={n(s.totalUsage)} tone="gold" hint="readings" />
          <StatCard label="Drafts" value={s.drafts} tone="gray" />
        </div>
      )}
      {loading && !data ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty title="No templates yet" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {data.items.map((t) => (
            <Card key={t.id} className="border-0 shadow-sm overflow-hidden group">
              <div className="relative aspect-[2/3] max-h-[420px] w-full bg-gradient-to-b from-[#3a2412] to-[#0c0703] flex items-center justify-center">
                {t.cardImageUrl ? (
                  <CardThumb template={t} />
                ) : (
                  <div className="text-center text-[#d4b037]/70 px-6">
                    <Sparkles className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">Standard Kuri card design</p>
                  </div>
                )}
                <div className="absolute top-4 right-4">
                  <Pill value={t.status} />
                </div>
                {t.cardImageUrl && (
                  <div className="absolute bottom-3 left-3 right-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium shadow ${t.cardLayout ? 'bg-white/90 text-green-700' : 'bg-orange-50/95 text-orange-700'}`}
                    >
                      {t.cardLayout ? 'Custom card · photo & text spaces set' : 'Artwork only · spaces not set'}
                    </span>
                  </div>
                )}
              </div>
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-lg">{t.name}</h3>
                    <p className="text-sm text-gray-500">
                      {t.code} · {THEMES.find((x) => x.v === t.theme)?.label}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-semibold text-[#b8952a]">{n(t.usageCount)}</p>
                    <p className="text-xs text-gray-500">readings</p>
                  </div>
                </div>
                {t.promptHint && <p className="text-sm text-gray-600 line-clamp-2">“{t.promptHint}”</p>}
                <Button variant="outline" className="w-full" onClick={() => setEditing(t)}>
                  <Edit className="w-4 h-4 mr-1" /> Edit
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {editing && <TemplateForm initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  )
}

/** Template card in the list: the artwork with sample photos + fortune in their spaces. */
function CardThumb({ template: t }: { template: Template }) {
  const preview = useCardPreview(t.cardImageUrl, t.cardLayout)
  return <img src={preview || fileUrl(t.cardImageUrl)} alt="" className="absolute inset-0 w-full h-full object-contain" />
}

function TemplateForm({ initial, onClose, onSaved }: { initial: Template | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: initial?.name || '',
    theme: initial?.theme || 'general',
    status: initial?.status || 'draft',
    promptHint: initial?.promptHint || '',
    fallback: (initial?.fallbackFortunes || []).join('\n'),
  })
  const [card, setCard] = useState(initial?.cardImageUrl || '')
  const [current, setCurrent] = useState<Template | null>(initial)
  const [editingLayout, setEditingLayout] = useState(false)
  const preview = useCardPreview(card, current?.cardLayout ?? null, 440)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [confirm, setConfirm] = useState<'delete' | 'removeArt' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const save = async () => {
    setErr('')
    if (!f.name.trim()) return setErr('Name is required')
    setBusy(true)
    const body = {
      name: f.name.trim(),
      theme: f.theme,
      status: f.status,
      promptHint: f.promptHint.trim(),
      fallbackFortunes: f.fallback
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    }
    try {
      if (initial) await api.patch(`/admin/templates/${initial.id}`, body)
      else await api.post('/admin/templates', body)
      toast.success(initial ? 'Template saved' : 'Template created')
      onSaved()
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const upload = async (file: File) => {
    if (!initial) return
    if (file.size > 8 * 1024 * 1024) return setErr('Image must be under 8 MB')
    setUploading(true)
    setErr('')
    try {
      const t = await api.put<Template>(`/admin/templates/${initial.id}/card`, {
        image: await fileToDataUrl(file),
      })
      setCard(t.cardImageUrl)
      setCurrent(t)
      onSaved()
      setEditingLayout(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
    }
  }

  const shortLines = f.fallback.split('\n').filter((s) => s.trim() && s.trim().length < 20).length

  return (
    <>
      {/* The form dialog hides while the full-screen layout editor is open (a Radix modal would block it). */}
      <Dialog open={!editingLayout} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{initial ? `${initial.name} (${initial.code})` : 'New Template'}</DialogTitle>
          </DialogHeader>
          <div className="grid md:grid-cols-[1fr_220px] gap-6 py-2">
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Name">
                  <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Love & Destiny" />
                </Field>
                <Field label="Status" hint="Drafts can't be picked for events">
                  <NativeSelect value={f.status} onChange={(v) => setF({ ...f, status: v as Template['status'] })}>
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </NativeSelect>
                </Field>
              </div>
              <Field label="Fortune theme" hint={THEMES.find((x) => x.v === f.theme)?.hint}>
                <NativeSelect value={f.theme} onChange={(v) => setF({ ...f, theme: v as Template['theme'] })}>
                  {THEMES.map((x) => (
                    <option key={x.v} value={x.v}>
                      {x.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Extra instruction for the AI (optional)" hint="Added to every fortune prompt for this template. Max 300 characters.">
                <Textarea
                  rows={2}
                  maxLength={300}
                  value={f.promptHint}
                  onChange={(e) => setF({ ...f, promptHint: e.target.value })}
                  placeholder="e.g. Mention new beginnings and family blessings."
                />
              </Field>
              <Field
                label="Offline fortunes (one per line)"
                hint={`Used when the kiosk can't reach the AI. Lines under 20 characters are ignored.${shortLines ? ` ${shortLines} line(s) too short.` : ''}`}
              >
                <Textarea
                  rows={6}
                  value={f.fallback}
                  onChange={(e) => setF({ ...f, fallback: e.target.value })}
                  placeholder="Your heart line runs deep and unbroken. A kindness you gave long ago is returning to you."
                />
              </Field>
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Print card design</p>
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-gradient-to-b from-[#3a2412] to-[#0c0703] flex items-center justify-center">
                {card ? (
                  <img src={preview || fileUrl(card)} alt="" className="w-full h-full object-cover" />
                ) : (
                  <p className="text-xs text-[#d4b037]/70 text-center px-4">Standard Kuri design</p>
                )}
              </div>
              {card && current?.cardLayout ? (
                <p className="flex items-start gap-1.5 text-xs text-green-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0" /> Photo and text spaces set. Shown with sample photos.
                </p>
              ) : card ? (
                <p className="text-xs text-orange-700">Spaces not set yet: the kiosk prints the standard Kuri card on top of this artwork. Click “Set photo & text spaces”.</p>
              ) : (
                <p className="text-xs text-gray-500">
                  Design your own 4×6" card (1200×1800 px, portrait) with empty spaces for the face photo, palm photo and fortune. Upload it, then drag the boxes onto those spaces.
                </p>
              )}
              {initial ? (
                <>
                  {card && (
                    <Button className={`w-full ${primaryBtn}`} onClick={() => setEditingLayout(true)}>
                      <LayoutTemplate className="w-4 h-4 mr-1" /> {current?.cardLayout ? 'Edit photo & text spaces' : 'Set photo & text spaces'}
                    </Button>
                  )}
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                  <Button variant="outline" className="w-full" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    <ImagePlus className="w-4 h-4 mr-1" /> {uploading ? 'Uploading…' : card ? 'Replace artwork' : 'Upload artwork'}
                  </Button>
                  {card && (
                    <Button variant="ghost" className="w-full text-red-600" onClick={() => setConfirm('removeArt')}>
                      Remove artwork
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-xs text-gray-400">Save the template first, then upload artwork.</p>
              )}
            </div>
          </div>
          <FormError message={err} />
          <div className="flex justify-between gap-3 pt-2">
            <div>
              {initial && (
                <Button variant="outline" className="text-red-600" onClick={() => setConfirm('delete')}>
                  <Trash2 className="w-4 h-4 mr-1" /> Delete
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <SaveButton busy={busy} onClick={save}>
                {initial ? 'Save changes' : 'Create Template'}
              </SaveButton>
            </div>
          </div>
          {initial && (
            <Confirm
              open={confirm !== null}
              onOpenChange={(o) => !o && setConfirm(null)}
              title={confirm === 'delete' ? `Delete ${initial.name}?` : 'Remove card artwork?'}
              body={
                confirm === 'delete'
                  ? 'Templates used by events or bookings cannot be deleted; archive them instead.'
                  : 'Cards go back to the standard Kuri design. The photo & text spaces are kept for the next artwork you upload.'
              }
              confirmLabel={confirm === 'delete' ? 'Delete' : 'Remove'}
              onConfirm={async () => {
                if (confirm === 'delete') {
                  await api.del(`/admin/templates/${initial.id}`)
                  toast.success('Template deleted')
                  onSaved()
                  onClose()
                } else {
                  const t = await api.del<Template>(`/admin/templates/${initial.id}/card`)
                  setCard('')
                  if (t) setCurrent(t)
                  onSaved()
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {editingLayout && current && card && (
        <CardLayoutEditor
          template={{ ...current, cardImageUrl: card }}
          onClose={() => setEditingLayout(false)}
          onSaved={(t) => {
            setCurrent(t)
            setCard(t.cardImageUrl)
            onSaved()
          }}
        />
      )}
    </>
  )
}

import { useState } from 'react'
import { toast } from 'sonner'
import { Copy, Edit, KeyRound, Mail, Phone, Plus, Shield, Trash2 } from 'lucide-react'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Checkbox } from '../components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Confirm, ErrorNote, Field, FormError, Loading, NativeSelect, PageHeader, Pill, SaveButton, StatCard, primaryBtn } from '../components/common'
import { useApi } from '../lib/useApi'
import { useAuth } from '../lib/auth'
import { api, type AdminUser, type Permission, type Role } from '../lib/api'
import { ago, PERM_LABEL, ROLE_LABEL } from '../lib/format'

interface TeamData {
  stats: { total: number; active: number; managers: number; support: number }
  roles: Record<Role, Permission[]>
  permissions: Permission[]
  items: AdminUser[]
}

const ROLE_TONE: Record<Role, string> = {
  super_admin: 'bg-red-50 text-red-700',
  event_manager: 'bg-blue-50 text-blue-700',
  operations_manager: 'bg-green-50 text-green-700',
  support: 'bg-gray-100 text-gray-700',
}

export default function Team() {
  const { user: me } = useAuth()
  const { data, error, loading, reload } = useApi<TeamData>('/admin/team')
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null)
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null)
  const [confirm, setConfirm] = useState<{ kind: 'remove' | 'reset'; u: AdminUser } | null>(null)
  const s = data?.stats

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        subtitle="Who can sign in to the admin panel, and what they can see"
        actions={
          <Button className={primaryBtn} onClick={() => setEditing('new')}>
            <Plus className="w-4 h-4 mr-1" /> Add Team Member
          </Button>
        }
      />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {s && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard label="Total Team Members" value={s.total} tone="blue" />
          <StatCard label="Active Members" value={s.active} tone="green" />
          <StatCard label="Managers" value={s.managers} tone="purple" />
          <StatCard label="Support Staff" value={s.support} tone="orange" />
        </div>
      )}
      {loading && !data ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {data?.items.map((u) => {
            const self = u.id === me?.id
            return (
              <Card key={u.id} className="border-0 shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#34211e] to-[#d4b037] flex items-center justify-center text-white font-semibold text-lg shrink-0">{u.name.charAt(0).toUpperCase()}</div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-lg truncate">
                          {u.name} {self && <span className="text-xs text-gray-400 font-normal">(you)</span>}
                        </h3>
                        <p className="text-xs text-gray-400">Joined {ago(u.createdAt)}</p>
                      </div>
                    </div>
                    <Pill value={u.status} />
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${ROLE_TONE[u.role]}`}>{ROLE_LABEL[u.role]}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-700 truncate">
                      <Mail className="w-4 h-4 text-gray-400 shrink-0" /> {u.email}
                    </div>
                    {u.phone && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <Phone className="w-4 h-4 text-gray-400" /> {u.phone}
                      </div>
                    )}
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-xs text-gray-500 mb-2">Access</p>
                    <div className="flex flex-wrap gap-1.5">
                      {u.role === 'super_admin' ? (
                        <span className="px-2.5 py-1 rounded-full text-xs border">All access</span>
                      ) : (
                        u.permissions.map((p) => (
                          <span key={p} className="px-2.5 py-1 rounded-full text-xs border">
                            {PERM_LABEL[p]}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="border-t pt-3 text-sm">
                    <p className="text-xs text-gray-500">Last active</p>
                    <p className="font-medium">{u.lastActiveAt ? ago(u.lastActiveAt) : 'Never signed in'}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(u)}>
                      <Edit className="w-4 h-4" /> Edit
                    </Button>
                    <Button variant="outline" size="sm" disabled={self} onClick={() => setConfirm({ kind: 'reset', u })}>
                      <KeyRound className="w-4 h-4" /> Reset
                    </Button>
                    <Button variant="outline" size="sm" disabled={self} className="text-red-600" onClick={() => setConfirm({ kind: 'remove', u })}>
                      <Trash2 className="w-4 h-4" /> Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {editing && data && (
        <MemberForm
          initial={editing === 'new' ? null : editing}
          roles={data.roles}
          permissions={data.permissions}
          isSelf={editing !== 'new' && editing.id === me?.id}
          canMakeSuper={me?.role === 'super_admin'}
          onClose={() => setEditing(null)}
          onSaved={(pw, email) => {
            reload()
            if (pw) setSecret({ email, password: pw })
          }}
        />
      )}

      {confirm && (
        <Confirm
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          destructive={confirm.kind === 'remove'}
          title={confirm.kind === 'remove' ? `Remove ${confirm.u.name}?` : `Reset ${confirm.u.name}'s password?`}
          body={confirm.kind === 'remove' ? 'They lose access immediately.' : 'A new temporary password is generated and they are signed out everywhere.'}
          confirmLabel={confirm.kind === 'remove' ? 'Remove' : 'Reset password'}
          onConfirm={async () => {
            if (confirm.kind === 'remove') {
              await api.del(`/admin/team/${confirm.u.id}`)
              toast.success('Team member removed')
              reload()
            } else {
              const r = await api.post<{ tempPassword: string }>(`/admin/team/${confirm.u.id}/reset-password`)
              setSecret({ email: confirm.u.email, password: r.tempPassword })
            }
          }}
        />
      )}

      <Dialog open={!!secret} onOpenChange={(o) => !o && setSecret(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
          </DialogHeader>
          {secret && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">
                Share this with <b>{secret.email}</b> privately. It is shown only once; they should change it after signing in.
              </p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 font-mono text-lg">
                <span className="flex-1 break-all">{secret.password}</span>
                <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(secret.password).then(() => toast.success('Copied'))}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex justify-end">
                <Button className={primaryBtn} onClick={() => setSecret(null)}>
                  Done
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MemberForm({
  initial,
  roles,
  permissions,
  isSelf,
  canMakeSuper,
  onClose,
  onSaved,
}: {
  initial: AdminUser | null
  roles: Record<Role, Permission[]>
  permissions: Permission[]
  isSelf: boolean
  canMakeSuper: boolean
  onClose: () => void
  onSaved: (tempPassword: string | undefined, email: string) => void
}) {
  const [f, setF] = useState({
    name: initial?.name || '',
    email: initial?.email || '',
    phone: initial?.phone || '',
    role: (initial?.role || 'support') as Role,
    status: initial?.status || 'active',
    perms: new Set<Permission>(initial?.permissions || roles.support),
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const setRole = (role: Role) => setF((p) => ({ ...p, role, perms: new Set(roles[role]) }))
  const toggle = (p: Permission) =>
    setF((x) => {
      const perms = new Set(x.perms)
      if (perms.has(p)) perms.delete(p)
      else perms.add(p)
      return { ...x, perms }
    })

  const save = async () => {
    setErr('')
    setBusy(true)
    const perms = f.role === 'super_admin' ? undefined : permissions_(f.perms, permissions)
    try {
      if (initial) {
        await api.patch(`/admin/team/${initial.id}`, { name: f.name, phone: f.phone, ...(isSelf ? {} : { role: f.role, status: f.status }), permissions: perms })
        toast.success('Saved')
        onSaved(undefined, f.email)
      } else {
        const r = await api.post<{ user: AdminUser; tempPassword?: string }>('/admin/team', { name: f.name, email: f.email, phone: f.phone, role: f.role, permissions: perms })
        toast.success('Team member added')
        onSaved(r.tempPassword, r.user.email)
      }
      onClose()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? `Edit ${initial.name}` : 'Add Team Member'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label="Name">
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Email" hint={initial ? 'Email cannot be changed' : 'Used to sign in'}>
              <Input type="email" value={f.email} disabled={!!initial} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+91 XXXXX XXXXX" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Role" hint={isSelf ? "You can't change your own role" : undefined}>
              <NativeSelect value={f.role} onChange={(v) => setRole(v as Role)} className={isSelf ? 'opacity-60 pointer-events-none' : ''}>
                {(Object.keys(roles) as Role[])
                  .filter((r) => r !== 'super_admin' || canMakeSuper || f.role === 'super_admin')
                  .map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
              </NativeSelect>
            </Field>
            {initial && (
              <Field label="Status">
                <NativeSelect value={f.status} onChange={(v) => setF({ ...f, status: v as AdminUser['status'] })} className={isSelf ? 'opacity-60 pointer-events-none' : ''}>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled (signed out, can't sign in)</option>
                </NativeSelect>
              </Field>
            )}
          </div>
          {f.role !== 'super_admin' && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Access</p>
              <div className="grid grid-cols-2 gap-2">
                {permissions.map((p) => (
                  <label key={p} className="flex items-center gap-2 p-2 rounded-lg border text-sm cursor-pointer hover:bg-gray-50">
                    <Checkbox checked={f.perms.has(p)} onCheckedChange={() => toggle(p)} />
                    {PERM_LABEL[p]}
                  </label>
                ))}
              </div>
            </div>
          )}
          {!initial && <p className="text-xs text-gray-500">A temporary password is generated and shown once after saving.</p>}
          <FormError message={err} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <SaveButton busy={busy} onClick={save}>
              {initial ? 'Save changes' : 'Add member'}
            </SaveButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Keep the server's permission order. */
function permissions_(set: Set<Permission>, order: Permission[]) {
  return order.filter((p) => set.has(p))
}

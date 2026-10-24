import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Field, FormError, SaveButton } from './common'
import { api, setToken } from '../lib/api'

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr('')
    if (next !== confirm) return setErr('New passwords do not match')
    setBusy(true)
    try {
      const r = await api.post<{ token: string }>('/admin/auth/change-password', { current, next })
      setToken(r.token)
      toast.success('Password changed. Other devices were signed out.')
      onOpenChange(false)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <Field label="Current password">
            <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </Field>
          <Field label="New password" hint="At least 10 characters, letters and numbers">
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
          <FormError message={err} />
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SaveButton busy={busy} onClick={submit}>
              Change password
            </SaveButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

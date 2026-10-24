import { useState, type ReactNode } from 'react'
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import { Card, CardContent } from './ui/card'
import { Button } from './ui/button'
import { Label } from './ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'

export const BRAND = { dark: '#34211e', darkHover: '#4a332e', gold: '#d4b037', cream: '#fef3e2', mid: '#8b7355' }
export const primaryBtn = 'bg-[#34211e] hover:bg-[#4a332e] text-white'

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function StatCard({ label, value, hint, tone = 'dark' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'dark' | 'gold' | 'green' | 'blue' | 'orange' | 'purple' | 'gray' }) {
  const color = { dark: 'text-gray-900', gold: 'text-[#b8952a]', green: 'text-green-600', blue: 'text-blue-600', orange: 'text-orange-600', purple: 'text-purple-600', gray: 'text-gray-700' }[tone]
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className={`text-3xl font-semibold mt-2 ${color}`}>{value}</p>
        {hint && <div className="text-sm text-gray-400 mt-1">{hint}</div>}
      </CardContent>
    </Card>
  )
}

const PILL: Record<string, string> = {
  active: 'bg-green-50 text-green-700',
  confirmed: 'bg-green-50 text-green-700',
  completed: 'bg-gray-100 text-gray-700',
  live: 'bg-green-50 text-green-700',
  upcoming: 'bg-[#fef3e2] text-[#a8801f]',
  pending: 'bg-[#fef3e2] text-[#a8801f]',
  available: 'bg-gray-100 text-gray-700',
  maintenance: 'bg-orange-50 text-orange-700',
  retired: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-50 text-red-600',
  disabled: 'bg-red-50 text-red-600',
  draft: 'bg-gray-100 text-gray-600',
  archived: 'bg-gray-100 text-gray-500',
  abandoned: 'bg-orange-50 text-orange-700',
}

export function Pill({ value, label }: { value: string; label?: string }) {
  return <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${label ? '' : 'capitalize'} ${PILL[value] || 'bg-gray-100 text-gray-700'}`}>{label || value}</span>
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
      <Loader2 className="w-5 h-5 animate-spin" /> {label}
    </div>
  )
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 text-red-700 text-sm">
      <AlertTriangle className="w-5 h-5 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-[#fef3e2] flex items-center justify-center mb-3">
        <Inbox className="w-6 h-6 text-[#a8801f]" />
      </div>
      <p className="font-medium text-gray-900">{title}</p>
      {hint && <p className="text-sm text-gray-500 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Field({ label, children, hint, htmlFor }: { label: string; children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
    </div>
  )
}

export function FormError({ message }: { message: string }) {
  if (!message) return null
  return <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{message}</p>
}

/** Confirm a destructive action; `onConfirm` may throw to show the error inline. */
export function Confirm({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel = 'Confirm',
  destructive = true,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  body: ReactNode
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        setErr('')
        onOpenChange(o)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{body}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={err} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className={destructive ? 'bg-red-600 hover:bg-red-700 text-white' : primaryBtn}
            onClick={async (e) => {
              e.preventDefault()
              setBusy(true)
              setErr('')
              try {
                await onConfirm()
                onOpenChange(false)
              } catch (x) {
                setErr(x instanceof Error ? x.message : String(x))
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Native select styled like the inputs (simpler + more reliable than Radix for forms). */
export function NativeSelect({ value, onChange, children, id, className = '' }: { value: string; onChange: (v: string) => void; children: ReactNode; id?: string; className?: string }) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 ${/\bw-/.test(className) ? '' : 'w-full'} rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#d4b037]/50 ${className}`}
    >
      {children}
    </select>
  )
}

export function SaveButton({ busy, children, onClick, type = 'button' }: { busy: boolean; children: ReactNode; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <Button type={type} disabled={busy} onClick={onClick} className={primaryBtn}>
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </Button>
  )
}

export const chartTooltip = {
  contentStyle: { backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: 13 },
}

import { useEffect, useState } from 'react'
import { APP_VERSION, saveSettings, type KioskSettings } from '../config/settings'
import { api, type RemoteConfig } from '../lib/api'
import { listCameras } from '../lib/useCamera'
import type { OutboxStatus } from '../lib/outbox'

/** Staff-only setup: server, machine registration, camera assignment, language. */
/** Which print card this kiosk will use, so staff can check the admin set-up from here. */
function cardLabel(c: RemoteConfig | null | undefined) {
  const t = c?.template
  if (!t) return 'Card: standard Kuri design (no template — book an event, or set a default template in Admin → Machines)'
  if (t.cardImageUrl && t.cardLayout) return `Card: ${t.name} — client design with photo & text spaces`
  if (t.cardImageUrl) return `Card: ${t.name} artwork with the standard layout (spaces not set in Admin → Templates)`
  return `Card: ${t.name} — standard Kuri design (no artwork uploaded)`
}

export function SetupScreen({
  settings,
  remote,
  connection,
  outbox,
  onSyncNow,
  onSave,
  onClose,
}: {
  settings: KioskSettings
  remote: RemoteConfig | null
  connection: 'online' | 'offline' | 'unregistered'
  outbox: OutboxStatus
  onSyncNow: () => Promise<void>
  onSave: (s: KioskSettings, remote?: RemoteConfig) => void
  onClose: () => void
}) {
  const [s, setS] = useState(settings)
  const [provisionKey, setProvisionKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listCameras().then(setCams)
  }, [])

  const set = <K extends keyof KioskSettings>(k: K, v: KioskSettings[K]) => setS((p) => ({ ...p, [k]: v }))

  const register = async () => {
    setBusy(true)
    setMsg('')
    try {
      const r = await api.register(s, provisionKey.trim())
      const next = { ...s, machineId: s.machineId.toUpperCase(), token: r.token }
      setS(next)
      saveSettings(next)
      onSave(next, r.config)
      setMsg(`Registered ${r.config.machine.machineId}. Event: ${r.config.event?.name ?? 'none booked now'}. ${cardLabel(r.config)}`)
    } catch (e) {
      setMsg(`Registration failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const test = async () => {
    setBusy(true)
    setMsg('')
    try {
      const c = await api.config(s)
      onSave(s, c)
      setMsg(`OK: ${c.machine.machineId} · event: ${c.event?.name ?? 'none booked now'} · ${cardLabel(c)}`)
    } catch (e) {
      setMsg(`Server check failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const save = () => {
    saveSettings(s)
    onSave(s)
    onClose()
  }

  return (
    <div className="screen setup">
      <h1>Kiosk Setup</h1>
      <p className="muted">Staff only · app v{APP_VERSION}</p>

      <section>
        <h2>Server</h2>
        <label>
          API URL
          <input value={s.apiUrl} onChange={(e) => set('apiUrl', e.target.value)} />
        </label>
        <label>
          Machine ID
          <input value={s.machineId} placeholder="KURI-001" onChange={(e) => set('machineId', e.target.value.toUpperCase())} />
        </label>
        <label>
          Provision key (first registration only)
          <span className="setup-row">
            <input
              type={showKey ? 'text' : 'password'}
              name="kuri-provision-key"
              autoComplete="new-password"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={provisionKey}
              onChange={(e) => setProvisionKey(e.target.value)}
              style={{ flex: 1 }}
            />
            <button type="button" onClick={() => setShowKey((v) => !v)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </span>
        </label>
        <div className="setup-row">
          <button disabled={busy || !s.machineId || !provisionKey} onClick={register}>
            Register machine
          </button>
          <button disabled={busy || !s.token} onClick={test}>
            Test connection
          </button>
        </div>
        <p className="muted">
          Status: {s.token ? `registered as ${s.machineId}` : 'not registered (fortunes run offline)'}
          {remote?.event ? ` · current event: ${remote.event.name}` : ''}
        </p>
        {s.token && <p className="muted">{cardLabel(remote)}</p>}
      </section>

      <section>
        <h2>Sync</h2>
        <div className="sync-box">
          <div>
            Server
            <b style={{ color: connection === 'online' ? '#7fd88a' : connection === 'offline' ? '#f0b429' : '#ff7b7f' }}>
              {connection === 'online' ? 'Connected' : connection === 'offline' ? 'Offline' : 'Not registered'}
            </b>
          </div>
          <div>
            Readings waiting
            <b>{outbox.pending}</b>
          </div>
          <div>
            Last upload
            <b style={{ fontSize: 24 }}>{outbox.lastSyncAt ? new Date(outbox.lastSyncAt).toLocaleTimeString() : '—'}</b>
          </div>
        </div>
        {outbox.lastError && outbox.pending > 0 && <p className="muted">Last problem: {outbox.lastError}</p>}
        <p className="muted">Readings are always saved on this kiosk first and uploaded when it is registered and online. Nothing is lost if the Wi-Fi drops.</p>
        <div className="setup-row">
          <button
            disabled={busy || !s.token || outbox.syncing || outbox.pending === 0}
            onClick={async () => {
              setBusy(true)
              await onSyncNow()
              setBusy(false)
            }}
          >
            {outbox.syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </section>

      <section>
        <h2>Cameras</h2>
        <label>
          Face camera
          <select value={s.faceCameraLabel} onChange={(e) => set('faceCameraLabel', e.target.value)}>
            <option value="">Auto (first camera)</option>
            {cams.map((c, i) => (
              <option key={c.deviceId || i} value={c.label}>
                {c.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Palm camera
          <select value={s.palmCameraLabel} onChange={(e) => set('palmCameraLabel', e.target.value)}>
            <option value="">Auto (second camera)</option>
            {cams.map((c, i) => (
              <option key={c.deviceId || i} value={c.label}>
                {c.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section>
        <h2>Experience</h2>
        <label>
          Default language
          <select value={s.language} onChange={(e) => set('language', e.target.value as KioskSettings['language'])}>
            <option value="en">English</option>
            <option value="ta">Tamil</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={s.checkPalmFacing} onChange={(e) => set('checkPalmFacing', e.target.checked)} />
          Reject the back of the hand (palm must face the camera)
        </label>
        <label>
          Walk-away timeout (seconds)
          <input type="number" min={20} max={180} value={s.idleTimeoutSec} onChange={(e) => set('idleTimeoutSec', Number(e.target.value) || 45)} />
        </label>
      </section>

      {msg && <p className="setup-msg">{msg}</p>}

      <div className="setup-row">
        <button className="primary" onClick={save}>
          Save &amp; close
        </button>
        <button onClick={onClose}>Cancel</button>
        <button onClick={() => location.reload()}>Reload app</button>
      </div>
    </div>
  )
}

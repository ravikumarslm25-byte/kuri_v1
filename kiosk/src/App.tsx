import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Stage } from './components/Stage'
import { StillThere } from './components/StillThere'
import { loadSettings, type KioskSettings, type Language } from './config/settings'
import { strings } from './config/strings'
import { api, type RemoteConfig } from './lib/api'
import { localFortune } from './lib/fortunes'
import { newSessionId } from './lib/ids'
import { useIdle } from './lib/useIdle'
import demoLines from './lib/palm/__fixtures__/demo-lines.json'
import type { DestinyLine } from './lib/palm/enhance'
import { IdleScreen } from './screens/IdleScreen'
import { ConsentScreen } from './screens/ConsentScreen'
import { FaceScreen } from './screens/FaceScreen'
import { PalmScreen, type PalmCapture } from './screens/PalmScreen'
import { loadHandLandmarker } from './lib/hand/detector'
import { enqueue, flush, getOutboxStatus, onOutboxChange, type OutboxStatus } from './lib/outbox'
import { saveSettings } from './config/settings'
import { ReadingScreen, type FortuneOutcome } from './screens/ReadingScreen'
import { ResultScreen } from './screens/ResultScreen'
import { PrintingScreen } from './screens/PrintingScreen'
import { SetupScreen } from './screens/SetupScreen'
import { renderCard } from './lib/print/renderCard'
import { printCard } from './lib/print/printCard'
import { artworkSrc } from './lib/print/artCache'
import { withDefaults } from './lib/print/cardLayout'

export type Step = 'idle' | 'consent' | 'face' | 'palm' | 'reading' | 'result' | 'printing' | 'setup'

interface Session {
  id: string
  startedAt: string
  language: Language
  consent: boolean
  facePhoto: string | null
  palm: PalmCapture | null
  fortune: string
  fortuneSource: 'ai' | 'fallback'
  cardImage: string | null
  printed: boolean
}

const blankSession = (language: Language): Session => ({
  id: newSessionId(),
  startedAt: new Date().toISOString(),
  language,
  consent: false,
  facePhoto: null,
  palm: null,
  fortune: '',
  fortuneSource: 'fallback',
  cardImage: null,
  printed: false,
})

const HEARTBEAT_MS = 30_000
const WALKAWAY_STEPS: Step[] = ['consent', 'face', 'palm', 'result']

export default function App() {
  const [settings, setSettings] = useState<KioskSettings>(loadSettings)
  const [remote, setRemote] = useState<RemoteConfig | null>(null)
  const [step, setStep] = useState<Step>(() => (new URLSearchParams(location.search).get('step') as Step) || 'idle')
  const [session, setSession] = useState<Session>(() => {
    const s = blankSession(settings.language)
    // Dev only: ?step=result&demo=1 jumps straight to a screen with sample data (for design review).
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
      return {
        ...s,
        consent: true,
        facePhoto: '/dev/demo-face.jpg',
        palm: { raw: '/dev/demo-palm.jpg', enhanced: '/dev/demo-palm-enhanced.jpg', art: '/dev/demo-palm-art.jpg', lines: demoLines as DestinyLine[] },
        fortune:
          'Your fate line rises clear and strong from the base of your palm. The road ahead asks for courage once, and rewards it many times over.',
      }
    }
    return s
  })
  const stepRef = useRef(step)
  stepRef.current = step

  const t = strings[session.language]

  // Warm up the hand model while the kiosk is idle, so the palm screen is instant.
  useEffect(() => {
    const id = setTimeout(() => loadHandLandmarker().catch((e) => console.warn('[hand] preload failed', e)), 1500)
    return () => clearTimeout(id)
  }, [])

  // ---- dev convenience: auto-register with the local server ----------------------
  // Set VITE_PROVISION_KEY (and optionally VITE_MACHINE_ID) in kiosk/.env.development.local.
  useEffect(() => {
    const key = import.meta.env.VITE_PROVISION_KEY
    if (!import.meta.env.DEV || settings.token || !key) return
    const s = { ...settings, machineId: settings.machineId || import.meta.env.VITE_MACHINE_ID || 'KURI-001' }
    api
      .register(s, key)
      .then((r) => {
        const next = { ...s, token: r.token }
        saveSettings(next)
        setSettings(next)
        setRemote(r.config)
        console.info(`[dev] kiosk auto-registered as ${next.machineId}`)
      })
      .catch((e) => console.warn('[dev] auto-register failed', e))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- offline outbox (Stage F) ---------------------------------------------------
  const [outbox, setOutbox] = useState<OutboxStatus>(getOutboxStatus)
  useEffect(() => onOutboxChange(setOutbox), [])
  useEffect(() => {
    void flush(settings)
    const iv = setInterval(() => void flush(settings), 60_000)
    const online = () => void flush(settings, { force: true })
    window.addEventListener('online', online)
    return () => {
      clearInterval(iv)
      window.removeEventListener('online', online)
    }
  }, [settings])

  // ---- server config + heartbeat -------------------------------------------------
  const [lastBeatOk, setLastBeatOk] = useState(0)
  useEffect(() => {
    if (!settings.token) return
    let stop = false
    const beat = () =>
      api
        .heartbeat(settings, stepRef.current, { faceCamera: settings.faceCameraLabel || 'auto', palmCamera: settings.palmCameraLabel || 'auto' }, getOutboxStatus().pending)
        .then((c) => {
          if (stop) return
          setRemote(c)
          setLastBeatOk(Date.now())
          // Back online with readings waiting: send them now rather than at the next minute.
          if (getOutboxStatus().pending) void flush(settings, { force: true })
        })
        .catch(() => undefined) // offline is fine; the kiosk keeps working
    beat()
    const iv = setInterval(beat, HEARTBEAT_MS)
    return () => {
      stop = true
      clearInterval(iv)
    }
  }, [settings])
  const [, tick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => tick((n) => n + 1), 15_000)
    return () => clearInterval(iv)
  }, [])
  const connection: 'online' | 'offline' | 'unregistered' = !settings.token ? 'unregistered' : Date.now() - lastBeatOk < HEARTBEAT_MS * 2.5 ? 'online' : 'offline'

  const eventLanguage = remote?.event?.language
  const defaultLanguage: Language = eventLanguage === 'ta' ? 'ta' : eventLanguage === 'en' ? 'en' : settings.language
  const allowLanguageSwitch = !eventLanguage || eventLanguage === 'en+ta'
  const canPrint = remote?.event ? remote.event.deliveryOptions.print : true

  // ---- session lifecycle ---------------------------------------------------------
  const upload = useCallback(
    (s: Session, outcome: 'completed' | 'abandoned', extra: { printed?: boolean; abandonedAt?: string } = {}) => {
      // Always saved on the kiosk first; uploaded now if possible, otherwise later (Stage F).
      void enqueue({
          sessionId: s.id,
          consent: s.consent,
          startedAt: s.startedAt,
          completedAt: outcome === 'completed' ? new Date().toISOString() : undefined,
          language: s.language,
          facePhoto: s.consent ? s.facePhoto ?? undefined : undefined,
          palmPhoto: s.consent ? s.palm?.raw ?? undefined : undefined,
          palmEnhanced: s.consent ? s.palm?.enhanced ?? undefined : undefined,
          fortune: s.fortune,
          fortuneSource: s.fortuneSource,
          cardImage: s.consent ? s.cardImage ?? undefined : undefined,
          delivery: { printed: !!extra.printed },
          outcome,
          abandonedAt: extra.abandonedAt,
        }).then(() => flush(settings))
    },
    [settings],
  )

  const reset = useCallback(() => {
    setSession(blankSession(defaultLanguage))
    setStep('idle')
  }, [defaultLanguage])

  const abandon = useCallback(() => {
    const at = stepRef.current
    if (session.consent && at !== 'idle') upload(session, at === 'result' ? 'completed' : 'abandoned', { abandonedAt: at })
    reset()
  }, [session, upload, reset])

  const idle = useIdle(WALKAWAY_STEPS.includes(step), settings.idleTimeoutSec, 15, abandon)

  const begin = () => {
    setSession(blankSession(defaultLanguage))
    setStep('consent')
  }

  const getFortune = useCallback(async (): Promise<FortuneOutcome> => {
    const palm = session.palm?.enhanced || session.palm?.raw
    if (settings.token && palm) {
      try {
        const r = await api.fortune(settings, palm, session.language)
        return { fortune: r.fortune, source: r.source }
      } catch {
        /* fall through to on-device fortune */
      }
    }
    await new Promise((r) => setTimeout(r, 600))
    return { fortune: localFortune(session.language), source: 'fallback' }
  }, [session.palm, session.language, settings])

  // ---- printing ---------------------------------------------------------------
  // Card artwork of the current template, downloaded ahead of time so printing works offline.
  const art = remote?.template?.cardImageUrl
  const artUrl = art ? (art.startsWith('http') ? art : settings.apiUrl.replace(/\/$/, '') + art) : ''
  useEffect(() => {
    if (artUrl) void artworkSrc(artUrl)
  }, [artUrl])

  const printing = useRef(false)
  const doPrint = useCallback(async () => {
    if (printing.current || session.printed) return // one print per guest
    printing.current = true
    setStep('printing')
    try {
      const frame = artUrl ? await artworkSrc(artUrl) : null
      const cardImage = await renderCard({
        facePhoto: session.facePhoto,
        palmArt: session.palm?.art || session.palm?.raw || null,
        fortune: session.fortune,
        sessionId: session.id,
        language: session.language,
        footer: remote?.event?.branding.cardFooter || remote?.event?.name || 'Kuri · The Digital Oracle',
        dateLabel: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        frameUrl: frame ?? undefined,
        layout: withDefaults(remote?.template?.cardLayout),
      })
      const done = { ...session, cardImage, printed: true }
      setSession(done)
      await printCard(cardImage)
      upload(done, 'completed', { printed: true })
    } catch (e) {
      console.error('[print] failed', e)
      upload(session, 'completed', { printed: false })
    } finally {
      printing.current = false
    }
  }, [session, remote, artUrl, upload])

  const screen = (() => {
    switch (step) {
      case 'idle':
        return <IdleScreen t={t} eventName={remote?.event?.name} connection={connection} pending={outbox.pending} onBegin={begin} onSecretTap={() => setStep('setup')} />
      case 'consent':
        return (
          <ConsentScreen
            t={t}
            language={session.language}
            allowLanguageSwitch={allowLanguageSwitch}
            onLanguage={(language) => setSession((s) => ({ ...s, language }))}
            onAgree={() => {
              setSession((s) => ({ ...s, consent: true }))
              setStep('face')
            }}
            onDecline={reset}
          />
        )
      case 'face':
        return (
          <FaceScreen
            t={t}
            cameraLabel={settings.faceCameraLabel}
            onDone={(facePhoto) => {
              setSession((s) => ({ ...s, facePhoto }))
              setStep('palm')
            }}
          />
        )
      case 'palm':
        return (
          <PalmScreen
            t={t}
            cameraLabel={settings.palmCameraLabel}
            checkPalmFacing={settings.checkPalmFacing}
            onDone={(palm) => {
              setSession((s) => ({ ...s, palm }))
              setStep('reading')
            }}
          />
        )
      case 'reading':
        return (
          <ReadingScreen
            t={t}
            palm={session.palm}
            getFortune={getFortune}
            onDone={(r) => {
              setSession((s) => ({ ...s, fortune: r.fortune, fortuneSource: r.source }))
              setStep('result')
            }}
          />
        )
      case 'result':
        return (
          <ResultScreen
            t={t}
            facePhoto={session.facePhoto}
            palm={session.palm?.art || session.palm?.raw || null}
            fortune={session.fortune}
            sessionId={session.id}
            canPrint={canPrint}
            onPrint={() => void doPrint()}
            onHome={() => {
              upload(session, 'completed')
              reset()
            }}
          />
        )
      case 'printing':
        return <PrintingScreen t={t} cardImage={session.cardImage} onDone={reset} />
      case 'setup':
        return (
          <SetupScreen
            settings={settings}
            remote={remote}
            connection={connection}
            outbox={outbox}
            onSyncNow={() => flush(settings, { force: true })}
            onSave={(s, r) => {
              setSettings(s)
              if (r) setRemote(r)
            }}
            onClose={reset}
          />
        )
    }
  })()

  return (
    <Stage>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="screen-fade"
          lang={session.language}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
        >
          {screen}
        </motion.div>
      </AnimatePresence>
      <AnimatePresence>{idle.warning && <StillThere t={t} remaining={idle.remaining} />}</AnimatePresence>
    </Stage>
  )
}

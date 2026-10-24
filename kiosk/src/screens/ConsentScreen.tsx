import { motion } from 'motion/react'
import { plates } from '../config/plates'
import type { Strings } from '../config/strings'
import type { Language } from '../config/settings'
import { Plate } from '../components/Plate'
import { OrnateButton } from '../components/OrnateButton'
import { Corners, Title } from '../components/Decor'

export function ConsentScreen({
  t,
  language,
  allowLanguageSwitch,
  onLanguage,
  onAgree,
  onDecline,
}: {
  t: Strings
  language: Language
  allowLanguageSwitch: boolean
  onLanguage: (l: Language) => void
  onAgree: () => void
  onDecline: () => void
}) {
  return (
    <div className="screen">
      <Plate plate={plates.oracle} />
      <div className="vignette-bottom tall" />
      <Corners />

      {allowLanguageSwitch && (
        <div className="lang-switch">
          <button className={language === 'en' ? 'on' : ''} onClick={() => onLanguage('en')}>
            English
          </button>
          <button className={language === 'ta' ? 'on' : ''} onClick={() => onLanguage('ta')} style={{ fontFamily: 'var(--font-ta)' }}>
            தமிழ்
          </button>
        </div>
      )}

      <motion.div className="consent-panel" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
        <Title size={76}>{t.consentTitle}</Title>
        <p className="consent-body">{t.consentBody}</p>
        <div className="row-center" style={{ gap: 36, marginTop: 44 }}>
          <OrnateButton variant="ghost" onClick={onDecline} style={{ width: 400, height: 110, fontSize: language === 'ta' ? 30 : 38 }}>
            {t.decline}
          </OrnateButton>
          <OrnateButton variant="gold" onClick={onAgree} style={{ width: 440, height: 120, fontSize: 46 }}>
            {t.agree}
          </OrnateButton>
        </div>
      </motion.div>
    </div>
  )
}

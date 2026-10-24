import kiosk from './cardLayout.ts?raw'
import admin from '../../../../admin/src/app/lib/cardLayout.ts?raw'
import { describe, expect, it } from 'vitest'
import { CARD, DEFAULT_LAYOUT, withDefaults } from './cardLayout'

describe('card layout', () => {
  it('admin preview uses the same renderer as the kiosk print', () => {
    expect(admin, 'admin copy is out of date: run `node tools/sync-card-layout.mjs`').toBe(kiosk)
  })

  it('default boxes sit inside the card', () => {
    for (const s of [DEFAULT_LAYOUT.face, DEFAULT_LAYOUT.palm, DEFAULT_LAYOUT.fortune, DEFAULT_LAYOUT.meta]) {
      expect(s.x >= 0 && s.y >= 0 && s.x + s.w <= CARD.w && s.y + s.h <= CARD.h).toBe(true)
    }
  })

  it('fills missing fields and never switches the fortune off', () => {
    expect(withDefaults(null)).toBeNull()
    const l = withDefaults({ face: { x: 10 } as never, fortune: { enabled: false } as never })!
    expect(l.face.x).toBe(10)
    expect(l.face.shape).toBe('rounded')
    expect(l.fortune.enabled).toBe(true)
    expect(l.meta.enabled).toBe(false)
  })
})

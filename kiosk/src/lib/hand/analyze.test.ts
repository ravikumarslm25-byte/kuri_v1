import { describe, expect, it } from 'vitest'
import { analyzePalm, isPalmFacing, jitter, toSquareCrop, type HandInput, type Pt } from './analyze'
import fixtures from './__fixtures__/hands.json'

// Real MediaPipe output (tasks-vision 1.1.0) on: an open right palm, the same image mirrored
// (= a left palm), and rotated 90°. All images are 800x800.
type Fx = { size: number[]; label: string; score: number; lm: number[][] }
const fx = fixtures as Record<string, Fx>
const hand = (f: Fx): HandInput => ({ landmarks: f.lm.map(([x, y]) => ({ x, y })), handedness: { label: f.label, score: f.score } })
const SQ = { width: 800, height: 800 }

describe('analyzePalm on real landmarks', () => {
  it('accepts an open right palm', () => {
    const a = analyzePalm([hand(fx.demo)], SQ)
    expect(a.palmFacing).toBe(true)
    expect(a.fingersOpen).toBe(4)
    expect(a.status).toBe('ok')
  })
  it('accepts a left palm (mirrored image)', () => {
    const a = analyzePalm([hand(fx.demo_mirror)], SQ)
    expect(a.palmFacing).toBe(true)
    expect(a.status).toBe('ok')
  })
  it('accepts a rotated palm (guest places hand at an angle)', () => {
    expect(analyzePalm([hand(fx.demo_rot90)], SQ).palmFacing).toBe(true)
  })
  it('flags the back of the hand (same hand label, flipped geometry)', () => {
    const h = hand(fx.demo)
    const back: HandInput = { ...h, landmarks: h.landmarks.map((p) => ({ x: 1 - p.x, y: p.y })) } // geometry mirrored, label still Right
    expect(analyzePalm([back], SQ).status).toBe('back')
  })
  it('does not judge palm/back when handedness is uncertain', () => {
    const h = { ...hand(fx.demo), handedness: { label: 'Right', score: 0.6 } }
    expect(isPalmFacing(toSquareCrop(h.landmarks, SQ), h.handedness)).toBeNull()
  })
  it('detects closed fingers', () => {
    const h = hand(fx.demo)
    const lm = h.landmarks.map((p) => ({ ...p }))
    for (const [pip, tip] of [[6, 8], [10, 12], [14, 16], [18, 20]]) lm[tip] = { ...lm[pip] } // curl: tip at PIP
    expect(analyzePalm([{ ...h, landmarks: lm }], SQ).status).toBe('closed')
  })
  it('too far / too close / off-centre', () => {
    const h = hand(fx.demo)
    const scale = (k: number, dx = 0, dy = 0) => ({ ...h, landmarks: h.landmarks.map((p) => ({ x: 0.5 + (p.x - 0.5) * k + dx, y: 0.5 + (p.y - 0.5) * k + dy })) })
    expect(analyzePalm([scale(0.4)], SQ).status).toBe('too-far')
    expect(analyzePalm([scale(1.4)], SQ).status).toBe('too-close')
    expect(analyzePalm([scale(0.6, 0.25, 0)], SQ).status).toBe('off-center')
  })
  it('asks for one hand when two are visible', () => {
    expect(analyzePalm([hand(fx.demo), hand(fx.demo_mirror)], SQ).status).toBe('multiple')
  })
  it('none', () => expect(analyzePalm([], SQ).status).toBe('none'))
})

describe('real photographs (11K Hands sample: palm and back of a real hand)', () => {
  const SQ9 = { width: 900, height: 900 }
  it('palm side is palm-facing', () => {
    expect(analyzePalm([hand(fx.real_m_p)], SQ9).palmFacing).toBe(true)
    expect(analyzePalm([hand(fx.real_f_p)], SQ9).palmFacing).toBe(true)
  })
  it('back of the hand is rejected', () => {
    expect(analyzePalm([hand(fx.real_f_d)], SQ9).status).toBe('back')
  })
})

describe('helpers', () => {
  it('maps a 16:9 frame to the centred square crop', () => {
    const [p] = toSquareCrop([{ x: 0.5, y: 0.5 }, { x: 0.21875, y: 0 }] as Pt[], { width: 1920, height: 1080 })
    expect(p.x).toBeCloseTo(0.5)
    const [, q] = toSquareCrop([{ x: 0.5, y: 0.5 }, { x: 0.21875, y: 0 }], { width: 1920, height: 1080 })
    expect(q.x).toBeCloseTo(0) // left edge of the square crop
  })
  it('jitter', () => {
    expect(jitter([{ x: 0, y: 0 }])).toBe(Infinity)
    expect(jitter([{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: 0.02, y: 0 }])).toBeCloseTo(0.01)
  })
})

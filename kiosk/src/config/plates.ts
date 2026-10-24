import type { CSSProperties } from 'react'

/**
 * Background "plates" for each kiosk scene, plus where the app draws its own UI on them.
 * All geometry is in STAGE pixels (the app is designed on a fixed 1080 x 1920 portrait stage
 * that is scaled to whatever screen the kiosk has).
 *
 * TODAY: images in /public/plates are TEMPORARY stand-ins cut from the 4:5 concept art
 * (tools/make_standin_plates.py). When the artist delivers clean 9:16 plates / video loops,
 * drop them in /public/plates and /public/videos, set `video`, and re-measure the boxes below.
 */
export type Box = { x: number; y: number; w: number; h: number }
export type Circle = { cx: number; cy: number; r: number }

export interface Plate {
  image: string
  /** Optional looping video; image is used as poster and fallback. */
  video?: string
}

export const STAGE = { w: 1080, h: 1920 } as const

export const plates = {
  idle: { image: '/plates/idle.jpg', video: undefined } as Plate,
  oracle: { image: '/plates/portrait.jpg', video: undefined } as Plate, // consent / face / palm screens
  scan: { image: '/plates/scan.jpg', video: undefined } as Plate,
  result: { image: '/plates/result.jpg', video: undefined } as Plate,
}

export const layout = {
  idle: {
    title: { x: 40, y: 430, w: 1000, h: 180 } as Box,
    button: { x: 282, y: 1439, w: 516, h: 110 } as Box,
  },
  scan: {
    /** The energy-ring sphere the guest's palm is shown inside. */
    ring: { cx: 645, cy: 892, r: 287 } as Circle,
    caption: { x: 60, y: 1270, w: 960, h: 270 } as Box,
  },
  result: {
    home: { x: 48, y: 330, w: 150, h: 60 } as Box,
    title: { x: 250, y: 405, w: 580, h: 96 } as Box,
    photo: { x: 79, y: 628, w: 208, h: 270 } as Box,
    palm: { x: 79, y: 1005, w: 208, h: 268 } as Box,
    scroll: { x: 392, y: 634, w: 406, h: 573 } as Box,
    button: { x: 228, y: 1429, w: 627, h: 120 } as Box,
  },
}

export const boxStyle = (b: Box): CSSProperties => ({
  position: 'absolute',
  left: b.x,
  top: b.y,
  width: b.w,
  height: b.h,
})

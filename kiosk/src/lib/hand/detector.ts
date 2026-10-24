import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

/**
 * One shared MediaPipe HandLandmarker for the whole app. It's loaded once at boot
 * (from /public/mediapipe, no network needed) so the palm screen is instant.
 * Tries the GPU delegate first and falls back to CPU (e.g. no WebGL on the kiosk PC).
 */
let loading: Promise<HandLandmarker> | null = null

export function loadHandLandmarker(): Promise<HandLandmarker> {
  if (!loading) {
    loading = (async () => {
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
      const opts = (delegate: 'GPU' | 'CPU') => ({
        baseOptions: { modelAssetPath: '/mediapipe/hand_landmarker.task', delegate },
        runningMode: 'VIDEO' as const,
        numHands: 2, // detect 2 so we can ask the guest to use one hand
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.5,
      })
      // Staff override for PCs with a broken GPU driver: localStorage['kuri.hand.delegate'] = 'CPU'
      let forced: string | null = null
      try {
        forced = localStorage.getItem('kuri.hand.delegate')
      } catch {
        /* ignore */
      }
      if (forced === 'CPU') return await HandLandmarker.createFromOptions(fileset, opts('CPU'))
      try {
        return await HandLandmarker.createFromOptions(fileset, opts('GPU'))
      } catch (e) {
        console.warn('[hand] GPU delegate failed, using CPU', e)
        return await HandLandmarker.createFromOptions(fileset, opts('CPU'))
      }
    })().catch((e) => {
      loading = null // allow a retry on the next palm screen
      throw e
    })
  }
  return loading
}

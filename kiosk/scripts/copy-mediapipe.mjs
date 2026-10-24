// Copies the MediaPipe WASM runtime into public/ so the kiosk runs fully offline.
// Runs automatically after `npm install` (postinstall).
import fs from 'node:fs'
import path from 'node:path'
const src = path.resolve('node_modules/@mediapipe/tasks-vision/wasm')
const dst = path.resolve('public/mediapipe/wasm')
fs.mkdirSync(dst, { recursive: true })
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f))
if (!fs.existsSync('public/mediapipe/hand_landmarker.task')) {
  console.warn('[kuri] public/mediapipe/hand_landmarker.task missing. Download it from\n' +
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task')
}
console.log('[kuri] MediaPipe WASM copied to public/mediapipe/wasm')

// Zero-dependency static server for the built kiosk (dist/). Runs on the kiosk PC so the
// app loads with no internet. Usage: node scripts/serve.mjs [port]   (default 4173)
// Camera access needs a secure context; http://localhost counts as one.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = Number(process.argv[2] || process.env.PORT || 4173)
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.task': 'application/octet-stream', '.ico': 'image/x-icon',
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0])
    let file = path.join(root, url)
    if (!file.startsWith(root)) return res.writeHead(403).end()
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html') // SPA fallback
    const ext = path.extname(file).toLowerCase()
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    fs.createReadStream(file).pipe(res)
  })
  .listen(port, '127.0.0.1', () => console.log(`Kuri kiosk on http://localhost:${port}`))

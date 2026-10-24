import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// Production build is served by the Kuri server under /admin/ (one app: /api, /admin, / = kiosk).
export default defineConfig(({ command }) => ({
  base: command === 'build' ? process.env.ADMIN_BASE || '/admin/' : '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { host: true },
}))

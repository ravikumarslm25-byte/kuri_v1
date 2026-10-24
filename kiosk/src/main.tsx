import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/berkshire-swash/400.css'
import '@fontsource/marcellus/400.css'
import '@fontsource/poppins/400.css'
import '@fontsource/noto-serif-tamil/400.css'
import '@fontsource/noto-serif-tamil/600.css'
import './index.css'
import App from './App'

// Kiosk hardening: no context menu, no pinch/double-tap zoom, no text selection drag.
window.addEventListener('contextmenu', (e) => e.preventDefault())
document.addEventListener('gesturestart', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

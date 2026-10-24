import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import './styles/index.css'
// Card fonts: the template layout preview must measure text exactly like the kiosk.
import '@fontsource/marcellus/400.css'
import '@fontsource/poppins/400.css'
import '@fontsource/berkshire-swash/400.css'
import '@fontsource/noto-serif-tamil/400.css'

createRoot(document.getElementById('root')!).render(<App />)

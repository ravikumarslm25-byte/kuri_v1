import { RouterProvider } from 'react-router'
import { router } from './routes'
import { AuthProvider } from './lib/auth'
import { Toaster } from './components/ui/sonner'

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster position="top-right" richColors />
    </AuthProvider>
  )
}

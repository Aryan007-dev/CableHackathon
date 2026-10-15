import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './theme.css'
import App from './App.tsx'
import { AuthProvider } from './AuthContext'
import { Analytics } from "@vercel/analytics/react"
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
    <Analytics />
  </StrictMode>,
)

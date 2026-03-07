import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App.tsx'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { initTheme } from '@/lib/theme'
import './index.css'

initTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackMessage="Relay encountered an unexpected error. Please restart the app.">
      <App />
      <Toaster position="bottom-right" richColors closeButton />
    </ErrorBoundary>
  </React.StrictMode>,
)

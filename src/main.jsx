import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'
import { isDemoMode } from './lib/supabaseClient'

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

function ClerkConfigurationRequired() {
  return (
    <main className="min-h-screen bg-night-950 text-mist-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-mist-700 bg-night-900 p-6 shadow-xl">
        <p className="text-signal-400 text-sm font-semibold">Authentication setup required</p>
        <h1 className="mt-2 text-2xl font-bold">Add your Clerk publishable key</h1>
        <p className="mt-3 text-mist-400 leading-6">
          Add <code className="text-mist-200">VITE_CLERK_PUBLISHABLE_KEY</code> to <code className="text-mist-200">.env</code>, or set <code className="text-mist-200">VITE_DEMO_MODE=true</code> to continue with local demo data.
        </p>
      </section>
    </main>
  )
}

function Root() {
  if (isDemoMode) return <App />
  if (!clerkPublishableKey) return <ClerkConfigurationRequired />
  return (
    <ClerkProvider standardBrowser={!Capacitor.isNativePlatform()}>
      <App />
    </ClerkProvider>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)

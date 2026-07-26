import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DeviceProvider, useDevice } from './context/DeviceContext'
import { isDemoMode, isSupabaseConfigured } from './lib/supabaseClient'
import Login from './pages/Login'
import Pairing from './pages/Pairing'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Settings from './pages/Settings'
import Diagnostics from './pages/Diagnostics'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace />
  return children
}

function RequireDevice({ children }) {
  const { device, loading } = useDevice()
  if (loading) return <FullScreenLoader />
  if (!device) return <Navigate to="/pairing" replace />
  return children
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-night-950 flex items-center justify-center">
      <p className="text-mist-400 text-sm">Loading…</p>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/pairing"
        element={
          <RequireAuth>
            <Pairing />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <RequireDevice>
              <Dashboard />
            </RequireDevice>
          </RequireAuth>
        }
      />
      <Route
        path="/history"
        element={
          <RequireAuth>
            <RequireDevice>
              <History />
            </RequireDevice>
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <RequireDevice>
              <Settings />
            </RequireDevice>
          </RequireAuth>
        }
      />
      <Route
        path="/diagnostics"
        element={
          <RequireAuth>
            <RequireDevice>
              <Diagnostics />
            </RequireDevice>
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  if (!isSupabaseConfigured && !isDemoMode) {
    return <ConfigurationRequired />
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <DeviceProvider>
          <AppRoutes />
        </DeviceProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

function ConfigurationRequired() {
  return (
    <main className="min-h-screen bg-night-950 text-mist-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-mist-700 bg-night-900 p-6 shadow-xl">
        <p className="text-amber-400 text-sm font-semibold">Setup required</p>
        <h1 className="mt-2 text-2xl font-bold">Connect Supabase to continue</h1>
        <p className="mt-3 text-mist-400 leading-6">
          Create a <code className="text-mist-200">.env</code> file from <code className="text-mist-200">.env.example</code>, then add your Supabase project URL and anon key.
        </p>
        <pre className="mt-5 overflow-x-auto rounded-lg bg-night-950 p-4 text-xs text-mist-300"><code>cp .env.example .env</code></pre>
        <p className="mt-4 text-sm text-mist-500">Restart the development server after saving the credentials.</p>
      </section>
    </main>
  )
}

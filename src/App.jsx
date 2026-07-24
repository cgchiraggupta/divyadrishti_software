import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DeviceProvider, useDevice } from './context/DeviceContext'
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

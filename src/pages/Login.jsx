import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye } from 'lucide-react'
import Button from '../components/Button'
import { useAuth } from '../context/AuthContext'
import { isDemoMode } from '../lib/supabaseClient'

export default function Login() {
  const { signIn, user, authUnavailable } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [navigate, user])

  return (
    <div className="min-h-screen bg-night-950 text-mist-100 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-night-800 border border-night-600">
          <Eye className="text-signal-400" size={28} strokeWidth={2} />
        </div>

        <h1 className="font-display text-2xl font-semibold tracking-tight">Divya Drishti</h1>
        <p className="mt-2 text-sm text-mist-400">
          Pair your glasses, watch live status, and review alerts from anywhere.
        </p>

        <Button onClick={signIn} className="mt-8 w-full">
          {isDemoMode ? 'Continue with demo' : 'Sign in'}
        </Button>

        {authUnavailable && !isDemoMode && (
          <div className="mt-5 rounded-xl border border-signal-500/30 bg-signal-500/10 p-4 text-left">
            <p className="text-sm font-medium text-signal-300">Sign-in connection needs finishing</p>
            <p className="mt-1 text-xs leading-5 text-mist-300">
              This test build needs its mobile sign-in connection enabled. The app is ready; finish the Clerk setup, then reopen it.
            </p>
          </div>
        )}

        <p className="mt-6 text-xs text-mist-500">
          {isDemoMode
            ? 'Demo mode uses local sample data and does not connect to your account.'
            : 'Your account keeps your device, alert history and settings in sync.'}
        </p>
      </div>
    </div>
  )
}

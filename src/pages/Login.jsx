import { Eye } from 'lucide-react'
import Button from '../components/Button'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signInWithGoogle } = useAuth()

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

        <Button onClick={signInWithGoogle} className="mt-8 w-full">
          Continue with Google
        </Button>

        <p className="mt-6 text-xs text-mist-500">
          Your account keeps your device, alert history and settings in sync.
        </p>
      </div>
    </div>
  )
}

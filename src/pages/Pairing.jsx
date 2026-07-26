import { useState } from 'react'
import { Radio } from 'lucide-react'
import Button from '../components/Button'
import { useDevice } from '../context/DeviceContext'

const prototypePairingCode = import.meta.env.VITE_PROTOTYPE_PAIRING_CODE ?? ''

export default function Pairing() {
  const { pairDevice } = useDevice()
  const [code, setCode] = useState(prototypePairingCode)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await pairDevice(code.trim().toUpperCase())
    } catch (err) {
      setError(err.message ?? 'Could not pair with that code. Check it and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-night-950 text-mist-100 flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-night-800 border border-night-600">
          <Radio className="text-signal-400" size={28} strokeWidth={2} />
        </div>

        <h1 className="font-display text-xl font-semibold tracking-tight">Pair your glasses</h1>
        <p className="mt-2 text-sm text-mist-400">
          Power on Divya Drishti and enter the device pairing code below.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 text-left">
          <label htmlFor="pairing-code" className="block text-xs font-medium uppercase tracking-wider text-mist-500 mb-2">
            Pairing code
          </label>
          <input
            id="pairing-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 7F3KQ2"
            maxLength={8}
            autoCapitalize="characters"
            className="w-full rounded-xl border border-night-600 bg-night-900 px-4 py-3 text-center
                       font-data text-lg tracking-[0.3em] text-mist-100 placeholder:text-mist-500
                       focus:border-signal-400 focus:outline-none"
          />
          {error && <p className="mt-2 text-sm text-alert-400">{error}</p>}

          {prototypePairingCode && (
            <p className="mt-3 text-center text-xs leading-5 text-mist-500">
              Prototype setup code is prefilled. You can replace it if needed.
            </p>
          )}

          <Button type="submit" disabled={submitting || code.length < 4} className="mt-6 w-full">
            {submitting ? 'Pairing…' : 'Pair device'}
          </Button>
        </form>
      </div>
    </div>
  )
}

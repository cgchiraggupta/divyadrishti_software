import { useState } from 'react'
import { Bluetooth } from 'lucide-react'
import Button from '../components/Button'
import { provisionOverBle, isBleSupported } from '../services/bleProvisioning'

const PAIRING_CODE_KEY = 'divya-drishti-pairing-code'

const PROGRESS = {
  scanning: 'Looking for your glasses over Bluetooth…',
  connecting: 'Connecting to your glasses…',
  saving: 'Sending Wi-Fi details…',
  connected: 'Done. Your glasses are joining the network now.',
}

export default function WifiSetup() {
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const pairingCode = () => (
    window.localStorage.getItem(PAIRING_CODE_KEY)
    || import.meta.env.VITE_LOCAL_PAIRING_CODE
    || ''
  ).trim()

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    const code = pairingCode()
    try {
      if (!code) throw new Error('Pair your glasses before changing their Wi-Fi network.')
      setMessage(PROGRESS.scanning)
      await provisionOverBle({
        ssid,
        password,
        pairingCode: code,
        onStatus: (state) => setMessage(PROGRESS[state] ?? message),
      })
      setMessage('Saved. Your glasses are joining the network. Keep your phone hotspot on until they reconnect.')
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      setMessage(detail || 'Could not reach your glasses over Bluetooth. Keep them close and try again.')
    } finally {
      setSaving(false)
    }
  }

  return <main className="min-h-screen bg-night-950 px-6 py-12 text-mist-100">
    <div className="mx-auto max-w-sm">
      <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-night-800 text-signal-400"><Bluetooth size={26} /></div>
      <h1 className="font-display text-2xl font-semibold">Connect your glasses</h1>
      <p className="mt-3 text-sm leading-6 text-mist-400">Keep your glasses switched on and nearby. Enter the Wi-Fi you want them to use — or your phone’s hotspot name and password.</p>
      <p className="mt-3 text-sm leading-6 text-mist-500">Using your phone’s hotspot? Turn it on first and keep it on while you connect your glasses over Bluetooth.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <input value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="Wi-Fi name" required className="w-full rounded-xl border border-night-600 bg-night-900 px-4 py-3 text-mist-100 outline-none focus:border-signal-400" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wi-Fi password" type="password" required className="w-full rounded-xl border border-night-600 bg-night-900 px-4 py-3 text-mist-100 outline-none focus:border-signal-400" />
        <Button type="submit" disabled={saving} className="w-full">{saving ? 'Connecting…' : 'Connect glasses'}</Button>
      </form>
      {message && <p className="mt-5 text-sm leading-6 text-mist-300">{message}</p>}
      {!isBleSupported() && <p className="mt-6 text-xs leading-5 text-mist-500">Bluetooth setup is available in the installed Divya Drishti app.</p>}
    </div>
  </main>
}

import { useState } from 'react'
import { Wifi } from 'lucide-react'
import Button from '../components/Button'

const SETUP_URL = 'http://192.168.4.1:8080'

export default function WifiSetup() {
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setMessage('Sending Wi-Fi details to your glasses…')
    try {
      const response = await fetch(`${SETUP_URL}/v1/wifi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Divya-Pairing-Code': 'RA46W4' },
        body: JSON.stringify({ ssid, password }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'The glasses could not save this Wi-Fi network.')
      setMessage('Saved. Your glasses are joining this Wi-Fi now. Reconnect your phone to the same network, then reopen Divya Drishti.')
    } catch (error) {
      const detail = error instanceof Error ? error.message : ''
      setMessage(detail || 'Connect your phone to the DivyaDrishti-Setup Wi-Fi first, then try again.')
    } finally {
      setSaving(false)
    }
  }

  return <main className="min-h-screen bg-night-950 px-6 py-12 text-mist-100">
    <div className="mx-auto max-w-sm">
      <div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-night-800 text-signal-400"><Wifi size={26} /></div>
      <h1 className="font-display text-2xl font-semibold">Connect your glasses</h1>
      <p className="mt-3 text-sm leading-6 text-mist-400">First join <strong className="text-mist-200">DivyaDrishti-Setup</strong> in your phone Wi-Fi settings. Then enter the Wi-Fi you want your glasses to use.</p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <input value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="Wi-Fi name" required className="w-full rounded-xl border border-night-600 bg-night-900 px-4 py-3 text-mist-100 outline-none focus:border-signal-400" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Wi-Fi password" type="password" required className="w-full rounded-xl border border-night-600 bg-night-900 px-4 py-3 text-mist-100 outline-none focus:border-signal-400" />
        <Button type="submit" disabled={saving} className="w-full">{saving ? 'Connecting…' : 'Connect glasses'}</Button>
      </form>
      {message && <p className="mt-5 text-sm leading-6 text-mist-300">{message}</p>}
    </div>
  </main>
}

import { useEffect, useState } from 'react'
import { Volume2, Vibrate, Ruler, LogOut } from 'lucide-react'
import Layout from '../components/Layout'
import Card from '../components/Card'
import Button from '../components/Button'
import { supabase } from '../lib/supabaseClient'
import { useDevice } from '../context/DeviceContext'
import { useAuth } from '../context/AuthContext'

const FEEDBACK_MODES = [
  { id: 'audio', label: 'Audio only' },
  { id: 'vibration', label: 'Vibration only' },
  { id: 'both', label: 'Both' },
]

const DEFAULTS = { sensitivity_mm: 800, feedback_mode: 'both', volume: 70, vibration_intensity: 70 }

export default function Settings() {
  const { device } = useDevice()
  const { signOut } = useAuth()
  const [settings, setSettings] = useState(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    if (!device) return
    supabase
      .from('device_settings')
      .select('*')
      .eq('device_id', device.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSettings(data)
      })
  }, [device])

  const update = (patch) => setSettings((prev) => ({ ...prev, ...patch }))

  const save = async () => {
    if (!device) return
    setSaving(true)
    await supabase
      .from('device_settings')
      .upsert({ device_id: device.id, ...settings, updated_at: new Date().toISOString() })
    setSaving(false)
    setSavedAt(new Date())
  }

  return (
    <Layout title="Settings" subtitle="Tune how Divya Drishti alerts you">
      <div className="space-y-4">
        <Card eyebrow="Detection" title="Sensitivity">
          <div className="flex items-center gap-3 mb-2">
            <Ruler size={18} className="text-signal-400" />
            <span className="font-data text-sm text-mist-200">{settings.sensitivity_mm} mm</span>
          </div>
          <input
            type="range"
            min="200"
            max="2000"
            step="50"
            value={settings.sensitivity_mm}
            onChange={(e) => update({ sensitivity_mm: Number(e.target.value) })}
            className="w-full accent-signal-500"
          />
          <p className="mt-2 text-xs text-mist-500">Alerts trigger when an obstacle is closer than this distance.</p>
        </Card>

        <Card eyebrow="Feedback" title="Alert mode">
          <div className="grid grid-cols-3 gap-2">
            {FEEDBACK_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => update({ feedback_mode: mode.id })}
                className={`rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                  settings.feedback_mode === mode.id
                    ? 'border-signal-500 bg-signal-500/15 text-signal-400'
                    : 'border-night-700 bg-night-800 text-mist-300 hover:border-night-600'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-mist-500">Use vibration-only in noisy environments.</p>
        </Card>

        <Card eyebrow="Audio" title="Volume">
          <div className="flex items-center gap-3">
            <Volume2 size={18} className="text-signal-400" />
            <input
              type="range"
              min="0"
              max="100"
              value={settings.volume}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              className="flex-1 accent-signal-500"
            />
            <span className="font-data text-sm text-mist-200 w-10 text-right">{settings.volume}%</span>
          </div>
        </Card>

        <Card eyebrow="Haptics" title="Vibration intensity">
          <div className="flex items-center gap-3">
            <Vibrate size={18} className="text-signal-400" />
            <input
              type="range"
              min="0"
              max="100"
              value={settings.vibration_intensity}
              onChange={(e) => update({ vibration_intensity: Number(e.target.value) })}
              className="flex-1 accent-signal-500"
            />
            <span className="font-data text-sm text-mist-200 w-10 text-right">{settings.vibration_intensity}%</span>
          </div>
        </Card>

        <div className="flex items-center justify-between pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {savedAt && <span className="text-xs text-mist-500">Saved</span>}
        </div>

        <div className="pt-6 border-t border-night-800">
          <Button variant="danger" onClick={signOut} className="w-full">
            <LogOut size={16} />
            Sign out
          </Button>
        </div>
      </div>
    </Layout>
  )
}

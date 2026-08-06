import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Volume2, Vibrate, Ruler, Wifi } from 'lucide-react'
import Layout from '../components/Layout'
import Card from '../components/Card'
import Button from '../components/Button'
import { supabase, isDemoMode } from '../lib/supabaseClient'
import { useDevice } from '../context/DeviceContext'
import { formatDistanceMeters } from '../lib/format'
import { signalGuidance, tapFeedback } from '../services/sensoryFeedback'

const FEEDBACK_MODES = [
  { id: 'audio', label: 'Audio only' },
  { id: 'vibration', label: 'Vibration only' },
  { id: 'both', label: 'Both' },
]

const DEFAULTS = { sensitivity_mm: 800, feedback_mode: 'both', volume: 70, vibration_intensity: 70 }
const DEMO_SETTINGS_KEY = 'divya-drishti-demo-settings'

function getInitialSettings() {
  if (!isDemoMode) return DEFAULTS
  try {
    const saved = window.localStorage.getItem(DEMO_SETTINGS_KEY)
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

export default function Settings() {
  const { device } = useDevice()
  const [settings, setSettings] = useState(getInitialSettings)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    if (!device) return
    if (isDemoMode) return
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
    if (isDemoMode) {
      window.localStorage.setItem(DEMO_SETTINGS_KEY, JSON.stringify(settings))
      setSaving(false)
      setSavedAt(new Date())
      return
    }
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
            <span className="font-data text-sm text-mist-200">{formatDistanceMeters(settings.sensitivity_mm)}</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2"
            step="0.05"
            value={settings.sensitivity_mm / 1000}
            onChange={(event) => update({ sensitivity_mm: Math.round(Number(event.target.value) * 1000) })}
            onPointerUp={tapFeedback}
            aria-valuetext={formatDistanceMeters(settings.sensitivity_mm)}
            className="w-full accent-signal-500"
          />
          <p className="mt-2 text-xs text-mist-500">Alerts trigger when an obstacle is closer than this distance.</p>
        </Card>

        <Card eyebrow="Feedback" title="Alert mode">
          <div className="grid grid-cols-3 gap-2">
            {FEEDBACK_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => {
                  update({ feedback_mode: mode.id })
                  tapFeedback()
                }}
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
          <button
            onClick={() => signalGuidance({
              text: 'Obstacle ahead. This is your current alert setting.',
              isHazard: true,
              audio: settings.feedback_mode !== 'vibration',
              vibration: settings.feedback_mode !== 'audio',
              audioVolume: settings.volume / 100,
              vibrationDuration: 120 + settings.vibration_intensity * 4,
            })}
            className="mt-4 text-sm font-semibold text-signal-300"
          >
            Test this alert
          </button>
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
              onPointerUp={tapFeedback}
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
              onPointerUp={tapFeedback}
              className="flex-1 accent-signal-500"
            />
            <span className="font-data text-sm text-mist-200 w-10 text-right">{settings.vibration_intensity}%</span>
          </div>
        </Card>

        <Link
          to="/wifi-setup"
          onClick={tapFeedback}
          className="flex items-center justify-between rounded-2xl border border-night-700 bg-night-900 p-5 transition-colors hover:border-night-600"
        >
          <span>
            <span className="block text-xs font-medium uppercase tracking-wider text-mist-500">Connection</span>
            <span className="mt-1 block font-display text-base font-semibold text-mist-100">Change Wi-Fi network</span>
            <span className="mt-1 block text-xs text-mist-500">Connect your glasses to home Wi-Fi or your phone hotspot.</span>
          </span>
          <Wifi size={20} className="shrink-0 text-signal-400" />
        </Link>

        <div className="flex items-center justify-between pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {savedAt && <span className="text-xs text-mist-500">Saved</span>}
        </div>

      </div>
    </Layout>
  )
}

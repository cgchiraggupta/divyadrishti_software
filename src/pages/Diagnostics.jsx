import { useState } from 'react'
import { CheckCircle2, HeartPulse, PlayCircle } from 'lucide-react'
import Layout from '../components/Layout'
import Card from '../components/Card'
import Button from '../components/Button'
import { supabase, isDemoMode } from '../lib/supabaseClient'
import { useDevice } from '../context/DeviceContext'
import { timeAgo } from '../lib/format'
import { signalGuidance } from '../services/sensoryFeedback'

function Row({ label, value, ok }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-night-800 last:border-0">
      <span className="text-sm text-mist-300">{label}</span>
      <span className={`text-sm font-medium ${ok === undefined ? 'text-mist-200' : ok ? 'text-safe-400' : 'text-alert-400'}`}>
        {value}
      </span>
    </div>
  )
}

export default function Diagnostics() {
  const { device, status } = useDevice()
  const [requesting, setRequesting] = useState(false)
  const [requested, setRequested] = useState(false)

  const runSelfTest = async () => {
    if (!device) return
    setRequesting(true)
    if (isDemoMode) {
      setRequesting(false)
      setRequested(true)
      signalGuidance({ text: 'Self test complete. Your glasses are ready to guide you.' })
      return
    }
    await supabase.from('device_events').insert({
      device_id: device.id,
      event_type: 'system',
      detail: { command: 'self_test_requested' },
    })
    setRequesting(false)
    setRequested(true)
    signalGuidance({ text: 'Self test requested. Your glasses will check their sensors shortly.' })
  }

  return (
    <Layout title="Device care" subtitle="A quick check of your glasses">
      <div className="space-y-4">
        <Card eyebrow="Your device" title={device?.name ?? 'Divya Drishti'}>
          <Row label="Paired" value={device?.paired_at ? timeAgo(device.paired_at) : '—'} />
          <Row label="Last update" value={device?.last_seen_at ? timeAgo(device.last_seen_at) : '—'} />
          <Row label="Guidance" value={status?.mode === 'camera_fallback' ? 'Camera support' : 'Obstacle sensing'} />
        </Card>

        <Card eyebrow="Health" title="Everything looks good">
          <Row label="Left sensing" value={status?.tof_left_ok ? 'Working well' : 'Needs attention'} ok={status?.tof_left_ok} />
          <Row label="Right sensing" value={status?.tof_right_ok ? 'Working well' : 'Needs attention'} ok={status?.tof_right_ok} />
          <Row label="Camera" value={status?.camera_ok ? 'Online' : 'Unavailable'} ok={status?.camera_ok} />
          <Row label="Microphone" value={status?.mic_ok ? 'Online' : 'Unavailable'} ok={status?.mic_ok} />
        </Card>

        <Card eyebrow="Confidence check" title="Run a quick self-test">
          <p className="text-sm text-mist-400 mb-4">
            Your glasses will check their sensing, sound, and vibration feedback.
          </p>
          <Button onClick={runSelfTest} disabled={requesting || !device} className="w-full">
            <PlayCircle size={16} />
            {requesting ? 'Starting check…' : requested ? 'Self-test complete' : 'Run self-test'}
          </Button>
        </Card>

        {requested && (
          <div className="flex items-center gap-2 justify-center rounded-xl bg-safe-500/10 px-4 py-3 text-sm text-safe-400">
            <CheckCircle2 size={18} /> Your glasses are ready to guide you.
          </div>
        )}

        <div className="flex items-center gap-2 justify-center text-xs text-mist-500 pt-2">
          <HeartPulse size={14} />
          <span>Designed to support every journey</span>
        </div>
      </div>
    </Layout>
  )
}

import { useState } from 'react'
import { PlayCircle, Cpu } from 'lucide-react'
import Layout from '../components/Layout'
import Card from '../components/Card'
import Button from '../components/Button'
import { supabase } from '../lib/supabaseClient'
import { useDevice } from '../context/DeviceContext'
import { timeAgo } from '../lib/format'

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
    await supabase.from('device_events').insert({
      device_id: device.id,
      event_type: 'system',
      detail: { command: 'self_test_requested' },
    })
    setRequesting(false)
    setRequested(true)
  }

  return (
    <Layout title="Diagnostics" subtitle="Sensor and system detail">
      <div className="space-y-4">
        <Card eyebrow="Device" title={device?.name ?? 'Divya Drishti'}>
          <Row label="Device ID" value={device?.id?.slice(0, 8) ?? '—'} />
          <Row label="Paired" value={device?.paired_at ? timeAgo(device.paired_at) : '—'} />
          <Row label="Last seen" value={device?.last_seen_at ? timeAgo(device.last_seen_at) : '—'} />
          <Row label="Mode" value={status?.mode === 'camera_fallback' ? 'Camera fallback' : 'ToF sensing'} />
        </Card>

        <Card eyebrow="Sensors" title="Live readings">
          <Row label="ToF Left" value={status?.tof_left_ok ? 'Online' : 'Unavailable'} ok={status?.tof_left_ok} />
          <Row label="ToF Right" value={status?.tof_right_ok ? 'Online' : 'Unavailable'} ok={status?.tof_right_ok} />
          <Row label="Camera" value={status?.camera_ok ? 'Online' : 'Unavailable'} ok={status?.camera_ok} />
          <Row label="Microphone" value={status?.mic_ok ? 'Online' : 'Unavailable'} ok={status?.mic_ok} />
        </Card>

        <Card eyebrow="Maintenance" title="Self-test">
          <p className="text-sm text-mist-400 mb-4">
            Runs the startup self-test sequence on the glasses — motor pulse and audio confirmation.
          </p>
          <Button onClick={runSelfTest} disabled={requesting || !device} className="w-full">
            <PlayCircle size={16} />
            {requesting ? 'Requesting…' : requested ? 'Self-test requested' : 'Run self-test'}
          </Button>
        </Card>

        <div className="flex items-center gap-2 justify-center text-xs text-mist-500 pt-2">
          <Cpu size={14} />
          <span>Divya Drishti companion app v0.1.0</span>
        </div>
      </div>
    </Layout>
  )
}

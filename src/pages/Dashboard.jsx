import { BatteryMedium, Camera, Ear, Radar } from 'lucide-react'
import Layout from '../components/Layout'
import Card from '../components/Card'
import StatusPulse from '../components/StatusPulse'
import { useDevice } from '../context/DeviceContext'
import { alertLabel, isHazardEvent, timeAgo } from '../lib/format'

function connectionState(device, status) {
  if (!device?.last_seen_at) return 'offline'
  const staleMs = Date.now() - new Date(device.last_seen_at).getTime()
  if (staleMs > 60_000) return 'offline'
  if (status?.current_alert && isHazardEvent(status.current_alert)) return 'alert'
  return 'online'
}

function SensorPill({ ok, label, Icon }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
        ok ? 'border-safe-500/30 bg-safe-500/10' : 'border-alert-500/30 bg-alert-500/10'
      }`}
    >
      <Icon size={16} className={ok ? 'text-safe-400' : 'text-alert-400'} />
      <div className="text-xs">
        <p className="font-medium text-mist-100">{label}</p>
        <p className={ok ? 'text-safe-400' : 'text-alert-400'}>{ok ? 'OK' : 'Unavailable'}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { device, status, events, loading } = useDevice()

  if (loading) {
    return (
      <Layout title="Dashboard">
        <p className="text-mist-400 text-sm">Loading device…</p>
      </Layout>
    )
  }

  const state = connectionState(device, status)
  const lastEvent = events?.[0]

  return (
    <Layout
      title={device?.name ?? 'Divya Drishti'}
      subtitle={state === 'offline' ? 'Last seen unavailable' : `Last update ${timeAgo(status?.updated_at)}`}
      action={<StatusPulse state={state} />}
    >
      <div className="space-y-4">
        <Card
          eyebrow="Current status"
          title={alertLabel(status?.current_alert ?? 'path_clear')}
          className={isHazardEvent(status?.current_alert) ? 'border-signal-500/40' : ''}
        >
          <p className="text-sm text-mist-400">
            Mode: <span className="text-mist-200">{status?.mode === 'camera_fallback' ? 'Camera fallback' : 'ToF sensing'}</span>
          </p>
        </Card>

        <Card eyebrow="Power" title="Battery">
          <div className="flex items-center gap-3">
            <BatteryMedium size={22} className="text-signal-400" />
            <div className="flex-1">
              <div className="h-2 rounded-full bg-night-700 overflow-hidden">
                <div
                  className="h-full bg-signal-500 rounded-full transition-all"
                  style={{ width: `${status?.battery_pct ?? 0}%` }}
                />
              </div>
            </div>
            <span className="font-data text-sm text-mist-200">
              {status?.battery_pct != null ? `${Math.round(status.battery_pct)}%` : '—'}
            </span>
          </div>
        </Card>

        <Card eyebrow="Sensor health" title="Hardware status">
          <div className="grid grid-cols-2 gap-2.5">
            <SensorPill ok={status?.tof_left_ok} label="ToF Left" Icon={Radar} />
            <SensorPill ok={status?.tof_right_ok} label="ToF Right" Icon={Radar} />
            <SensorPill ok={status?.camera_ok} label="Camera" Icon={Camera} />
            <SensorPill ok={status?.mic_ok} label="Microphone" Icon={Ear} />
          </div>
        </Card>

        <Card eyebrow="Most recent" title={lastEvent ? alertLabel(lastEvent.event_type) : 'No alerts yet'}>
          <p className="text-sm text-mist-400">{lastEvent ? timeAgo(lastEvent.created_at) : 'Alerts will appear here as they happen.'}</p>
        </Card>
      </div>
    </Layout>
  )
}

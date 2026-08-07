import { useState } from 'react'
import { BatteryMedium, Check, ChevronRight, Eye, Footprints, LoaderCircle, Pause, Play, Radio, Sparkles, Volume2, Waves } from 'lucide-react'
import Layout from '../components/Layout'
import Card from '../components/Card'
import StatusPulse from '../components/StatusPulse'
import { useDevice } from '../context/DeviceContext'
import { previewScenes } from '../lib/demoData'
import { alertLabel, isHazardEvent, timeAgo } from '../lib/format'
import { isDemoMode } from '../lib/supabaseClient'
import { signalGuidance, speakGuidance } from '../services/sensoryFeedback'

function connectionState(device, status) {
  const lastSeenAt = status?.updated_at ?? device?.last_seen_at
  if (!lastSeenAt) return 'offline'
  if (Date.now() - new Date(lastSeenAt).getTime() > 60_000) return 'offline'
  if (status?.current_alert && isHazardEvent(status.current_alert)) return 'alert'
  return 'online'
}

function statusCopy(status) {
  const type = status?.current_alert ?? 'path_clear'
  if (type === 'path_clear') return { title: 'Path ahead is clear', body: 'Your glasses are watching for obstacles.', icon: Check }
  if (type === 'uneven_ground') return { title: 'Uneven ground ahead', body: 'Take care with your next step.', icon: Footprints }
  return { title: alertLabel(type), body: 'Your glasses have shared an update.', icon: Eye }
}

export default function Dashboard() {
  const { device, status, events, loading, nearbyLink, playPreviewScene, sendNearbyDeviceCommand } = useDevice()
  const [sensingControl, setSensingControl] = useState({ pending: null, message: '', error: '' })
  const state = connectionState(device, status)
  const sensingPaused = nearbyLink.status?.paused === true
  const displayState = sensingPaused ? 'paused' : nearbyLink.state === 'connected'
    ? (status?.current_alert && isHazardEvent(status.current_alert) ? 'alert' : 'online')
    : state
  const copy = statusCopy(status)
  const HeroIcon = copy.icon
  const latest = events?.[0]
  const nearbyControlAvailable = !isDemoMode && nearbyLink.state === 'connected'
  const commandPending = sensingControl.pending !== null

  const toggleSensing = async () => {
    if (!nearbyControlAvailable || commandPending) return

    const command = sensingPaused ? 'resume' : 'pause'
    const expectedPaused = command === 'pause'
    setSensingControl({ pending: command, message: '', error: '' })

    try {
      const confirmedStatus = await sendNearbyDeviceCommand(command)
      if (confirmedStatus?.paused !== expectedPaused) {
        throw new Error('The glasses did not confirm the requested sensing state.')
      }
      setSensingControl({
        pending: null,
        message: expectedPaused ? 'Sensing paused on glasses.' : 'Sensing resumed on glasses.',
        error: '',
      })
    } catch {
      setSensingControl({
        pending: null,
        message: '',
        error: 'Could not reach nearby glasses. Put this phone and the glasses on the same Wi-Fi, then try again.',
      })
    }
  }

  if (loading) return <Layout title="Divya Drishti"><p className="text-mist-400 text-sm">Getting your device ready…</p></Layout>

  return (
    <Layout
      title="Divya Drishti"
      subtitle={nearbyLink.state === 'connected' ? 'Your glasses are nearby on Wi-Fi' : state === 'offline' ? 'Your glasses are not reachable right now' : 'Your companion is connected'}
      action={<StatusPulse state={displayState} />}
    >
      <div className="space-y-4">
        {isDemoMode && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-night-800 px-3 py-1 text-xs font-medium text-mist-300">
            <Sparkles size={13} className="text-signal-400" /> Preview experience
          </div>
        )}

        <section className={`overflow-hidden rounded-3xl border p-5 ${displayState === 'alert' ? 'border-signal-500/50 bg-signal-500/10' : 'border-safe-500/30 bg-safe-500/10'}`}>
          <div className="flex items-start gap-4">
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${displayState === 'alert' ? 'bg-signal-500 text-night-950' : 'bg-safe-500 text-night-950'}`}>
              <HeroIcon size={24} strokeWidth={2.5} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-mist-400">Live guidance</p>
              <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-mist-100">{copy.title}</h2>
              <p className="mt-1 text-sm leading-6 text-mist-300">{copy.body}</p>
            </div>
          </div>
          <button onClick={() => speakGuidance(`${copy.title}. ${copy.body}`)} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-signal-300">
            <Volume2 size={16} /> Hear this update
          </button>
        </section>

        {!isDemoMode && (
          <Card title="Sensing control" eyebrow="Nearby glasses">
            <div className={`rounded-2xl border p-4 ${sensingPaused ? 'border-alert-500/50 bg-alert-500/10' : 'border-safe-500/30 bg-safe-500/10'}`}>
              <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${sensingPaused ? 'bg-alert-500 text-night-950' : 'bg-safe-500 text-night-950'}`}>
                  {sensingPaused ? <Pause size={20} strokeWidth={2.5} /> : <Play size={20} strokeWidth={2.5} />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-mist-100">{sensingPaused ? 'Sensing is paused' : 'Sensing is active'}</p>
                  <p className="mt-1 text-xs leading-5 text-mist-400">
                    {sensingPaused
                      ? 'Obstacle alerts are off. Resume before you start walking.'
                      : 'Pause alerts while you are sitting or talking to someone.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={toggleSensing}
                disabled={!nearbyControlAvailable || commandPending}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${sensingPaused ? 'bg-safe-500 text-night-950' : 'bg-signal-500 text-night-950'}`}
              >
                {commandPending
                  ? <><LoaderCircle className="animate-spin" size={17} /> Sending to glasses…</>
                  : sensingPaused
                    ? <><Play size={17} /> Resume sensing</>
                    : <><Pause size={17} /> Pause sensing</>}
              </button>

              <p className="mt-3 text-xs leading-5 text-mist-500" role={sensingControl.error ? 'alert' : 'status'} aria-live="polite">
                {sensingControl.error || sensingControl.message || (nearbyControlAvailable
                  ? 'The glasses confirm each change before this screen updates.'
                  : 'Connect this phone and the glasses to the same Wi-Fi to use this control.')}
              </p>
            </div>
          </Card>
        )}

        <Card title="Your glasses" eyebrow={nearbyLink.state === 'connected' ? 'Nearby Wi-Fi connection' : 'Connected now'}>
          <div className="grid grid-cols-3 divide-x divide-night-700">
            <div className="pr-3"><BatteryMedium size={19} className="mb-2 text-signal-400" /><p className="font-data text-lg text-mist-100">{Math.round(status?.battery_pct ?? 0)}%</p><p className="mt-0.5 text-xs text-mist-500">Battery</p></div>
            <div className="px-3"><Radio size={19} className="mb-2 text-safe-400" /><p className="text-lg font-semibold text-mist-100">{nearbyLink.state === 'connected' ? 'Nearby' : state === 'offline' ? 'Away' : 'Ready'}</p><p className="mt-0.5 text-xs text-mist-500">Connection</p></div>
            <div className="pl-3"><Eye size={19} className="mb-2 text-signal-400" /><p className="text-lg font-semibold text-mist-100">{status?.mode === 'camera_fallback' ? 'Camera' : 'Sensing'}</p><p className="mt-0.5 text-xs text-mist-500">Guidance</p></div>
          </div>
        </Card>

        <Card title="Latest update" eyebrow="Recent activity" action={<ChevronRight size={18} className="text-mist-500" />}>
          <p className="text-sm font-medium text-mist-200">{latest ? alertLabel(latest.event_type) : 'No recent updates'}</p>
          <p className="mt-1 text-sm text-mist-500">{latest ? `${timeAgo(latest.created_at)} · Your activity is safely saved here.` : 'Updates from your glasses will appear here.'}</p>
        </Card>

        {isDemoMode && (
          <Card title="Feel the guidance" eyebrow="Live preview">
            <p className="mb-4 text-sm leading-6 text-mist-400">Every preview speaks an alert and vibrates your phone, like the glasses will do in use.</p>
            <button
              onClick={() => signalGuidance({ text: 'Obstacle ahead. Chair, about 60 centimetres away.', isHazard: true })}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-signal-500 px-4 py-3 text-sm font-bold text-night-950 active:scale-[0.99]"
            >
              <Waves size={17} /> Test obstacle alert
            </button>
            <div className="grid grid-cols-2 gap-2">
              {previewScenes.map((scene) => (
                <button key={scene.id} onClick={() => playPreviewScene(scene)} className="rounded-xl border border-night-700 bg-night-800 px-3 py-3 text-left text-sm font-medium text-mist-200 transition hover:border-signal-500/50 hover:bg-night-700 active:scale-[0.98]">
                  <span className="block">{scene.label}</span>
                  <span className="mt-1 block text-xs font-normal text-mist-500">Voice + vibration</span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </Layout>
  )
}

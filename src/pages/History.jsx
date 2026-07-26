import { useMemo, useState } from 'react'
import { AlertTriangle, Mic, ShieldCheck, Settings as SettingsIcon } from 'lucide-react'
import Layout from '../components/Layout'
import { useDevice } from '../context/DeviceContext'
import { alertLabel, formatTimestamp, isHazardEvent } from '../lib/format'
import { signalGuidance, tapFeedback } from '../services/sensoryFeedback'

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'hazard', label: 'Obstacles' },
  { id: 'voice_command', label: 'Voice' },
  { id: 'system', label: 'System' },
]

function eventIcon(eventType) {
  if (isHazardEvent(eventType)) return AlertTriangle
  if (eventType === 'voice_command') return Mic
  if (eventType === 'system') return SettingsIcon
  return ShieldCheck
}

export default function History() {
  const { events, loading } = useDevice()
  const [filter, setFilter] = useState('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return events
    if (filter === 'hazard') return events.filter((e) => isHazardEvent(e.event_type))
    return events.filter((e) => e.event_type === filter)
  }, [events, filter])

  const replayEvent = (event) => {
    const distance = event.detail?.distance_mm ? ` ${Math.round(event.detail.distance_mm / 10) / 100} metres away.` : ''
    const message = event.detail?.response ?? event.detail?.message ?? `${alertLabel(event.event_type)}.${distance}`
    signalGuidance({ text: message, isHazard: isHazardEvent(event.event_type) })
  }

  return (
    <Layout title="Alert History" subtitle="Everything Divya Drishti has logged">
      <div className="flex gap-2 overflow-x-auto pb-4 -mx-1 px-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setFilter(f.id)
              tapFeedback()
            }}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-colors ${
              filter === f.id
                ? 'bg-signal-500 text-night-950 border-signal-500'
                : 'bg-night-900 text-mist-300 border-night-700 hover:border-night-600'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-mist-400 text-sm">Loading…</p>}

      {!loading && filtered.length === 0 && (
        <div className="mt-10 text-center text-mist-500">
          <p className="text-sm">No events in this view yet.</p>
        </div>
      )}

      <ul className="space-y-2.5">
        {filtered.map((event) => {
          const Icon = eventIcon(event.event_type)
          const hazard = isHazardEvent(event.event_type)
          return (
            <li key={event.id}>
              <button
                onClick={() => replayEvent(event)}
                className="flex w-full items-start gap-3 rounded-xl border border-night-700 bg-night-900 p-3.5 text-left transition active:scale-[0.99] hover:border-night-600"
              >
              <span
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  hazard ? 'bg-signal-500/15 text-signal-400' : 'bg-night-700 text-mist-300'
                }`}
              >
                <Icon size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-mist-100">{alertLabel(event.event_type)}</p>
                {event.detail?.command && (
                  <p className="text-xs text-mist-400 truncate">"{event.detail.command}"</p>
                )}
                {event.detail?.response && <p className="mt-1 text-xs text-mist-400">{event.detail.response}</p>}
                {event.detail?.object_label && (
                  <p className="mt-1 text-xs text-mist-400">{event.detail.object_label} {event.detail?.distance_mm ? `· ${Math.round(event.detail.distance_mm / 10) / 100} m away` : ''}</p>
                )}
              </div>
              <span className="font-data text-xs text-mist-500 shrink-0">{formatTimestamp(event.created_at)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </Layout>
  )
}

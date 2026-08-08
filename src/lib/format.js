export const ALERT_LABELS = {
  path_clear: 'Path clear',
  obstacle_ahead: 'Obstacle ahead',
  obstacle_directly_ahead: 'Obstacle directly ahead',
  obstacle_left: 'Obstacle on left',
  obstacle_right: 'Obstacle on right',
  uneven_ground: 'Uneven ground ahead',
  voice_command: 'Voice command',
  sos: 'SOS triggered',
  system: 'System event',
}

export function alertLabel(eventType) {
  return ALERT_LABELS[eventType] ?? eventType?.replaceAll('_', ' ') ?? 'Unknown event'
}

export function isHazardEvent(eventType) {
  return typeof eventType === 'string' && eventType.startsWith('obstacle') || eventType === 'uneven_ground'
}

export function formatDistanceMeters(distanceMm) {
  if (distanceMm == null || !Number.isFinite(Number(distanceMm))) return '—'

  const mm = Number(distanceMm)
  // Under 1 m show centimetres so 320 mm reads "32 cm", not "0.32 m".
  if (mm < 1000) {
    return `${Math.max(1, Math.round(mm / 10))} cm`
  }

  const meters = mm / 1000
  return `${meters.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(meters) ? 0 : 1,
    maximumFractionDigits: 1,
  })} m`
}

export function timeAgo(isoString) {
  if (!isoString) return '—'
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffSec = Math.round(diffMs / 1000)

  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay}d ago`
}

export function formatTimestamp(isoString) {
  if (!isoString) return '—'
  return new Date(isoString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

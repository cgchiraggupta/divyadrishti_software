const STATES = {
  online: { dot: 'bg-safe-500', ring: 'bg-safe-500/60', label: 'Connected' },
  alert: { dot: 'bg-signal-500', ring: 'bg-signal-500/60', label: 'Obstacle detected' },
  paused: { dot: 'bg-alert-500', ring: 'bg-alert-500/50', label: 'Sensing paused' },
  offline: { dot: 'bg-mist-500', ring: 'bg-mist-500/40', label: 'Offline' },
}

/**
 * The signature element: a live "sensing" pulse ring around a status dot,
 * echoing the device's own ToF sensing behaviour. Reduced-motion is respected
 * globally via the .pulse-ring keyframe rule in index.css.
 */
export default function StatusPulse({ state = 'offline', size = 14 }) {
  const config = STATES[state] ?? STATES.offline

  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size * 2.4, height: size * 2.4 }}>
      {state !== 'offline' && state !== 'paused' && (
        <span
          className={`pulse-ring absolute rounded-full ${config.ring}`}
          style={{ width: size, height: size }}
          aria-hidden="true"
        />
      )}
      <span
        className={`relative rounded-full ${config.dot}`}
        style={{ width: size, height: size }}
        role="status"
        aria-label={config.label}
      />
    </span>
  )
}

const VARIANTS = {
  primary: 'bg-signal-500 text-night-950 hover:bg-signal-400 active:bg-signal-500',
  secondary: 'bg-night-800 text-mist-100 border border-night-600 hover:bg-night-700',
  ghost: 'bg-transparent text-mist-300 hover:text-mist-100 hover:bg-night-800',
  danger: 'bg-alert-500/15 text-alert-400 border border-alert-500/30 hover:bg-alert-500/25',
}

export default function Button({ variant = 'primary', className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold
                  transition-colors disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

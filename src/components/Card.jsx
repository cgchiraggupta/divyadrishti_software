export default function Card({ title, eyebrow, action, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-night-700 bg-night-900 p-5 ${className}`}>
      {(title || eyebrow || action) && (
        <div className="flex items-start justify-between mb-3">
          <div>
            {eyebrow && (
              <p className="text-xs font-medium uppercase tracking-wider text-mist-500 mb-1">{eyebrow}</p>
            )}
            {title && <h2 className="font-display text-base font-semibold text-mist-100">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

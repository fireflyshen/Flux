export function PixelLoader({ label = '正在整理账单…' }: { label?: string }) {
  return (
    <div className="pixel-loader" role="status" aria-live="polite">
      <div className="flux-grid-loader" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="flux-cell"
            style={{ animationDelay: `${(i % 3 + Math.floor(i / 3)) * 0.15}s` }}
          />
        ))}
      </div>
      <span>{label}</span>
    </div>
  )
}

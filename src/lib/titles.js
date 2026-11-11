// Text overlays ("titles") for the video editor. Times are in source seconds.
export const TITLE_POSITIONS = [
  ['top', 'Top'],
  ['center', 'Center'],
  ['lower', 'Lower third'],
  ['bottom', 'Bottom'],
]
export const TITLE_STYLES = [
  ['outline', 'Outlined'],
  ['box', 'Boxed'],
  ['plain', 'Plain'],
]

export const activeTitles = (titles, t) => (titles || []).filter((x) => x.text && t >= x.start && t <= x.end)

/** Vertical anchor (0..1) for a position. */
export const titleY = (pos) => ({ top: 0.1, center: 0.5, lower: 0.78, bottom: 0.9 })[pos] ?? 0.9

/** Opacity with a short fade at both ends. */
export function titleAlpha(title, t) {
  const f = 0.25
  return Math.max(0, Math.min(1, (t - title.start) / f, (title.end - t) / f))
}

export function drawTitles(ctx, titles, t) {
  const { width: W, height: H } = ctx.canvas
  for (const title of activeTitles(titles, t)) {
    const size = Math.max(10, (H * (title.size || 6)) / 100)
    const lines = String(title.text).split('\n')
    ctx.save()
    ctx.globalAlpha = titleAlpha(title, t)
    ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const cy = H * titleY(title.position) - ((lines.length - 1) * size * 1.2) / 2
    lines.forEach((line, i) => {
      const y = cy + i * size * 1.2
      if (title.style === 'box') {
        const w = ctx.measureText(line).width
        ctx.fillStyle = 'rgba(0,0,0,0.65)'
        ctx.fillRect(W / 2 - w / 2 - size * 0.4, y - size * 0.65, w + size * 0.8, size * 1.3)
      } else if (title.style !== 'plain') {
        ctx.lineJoin = 'round'
        ctx.lineWidth = size / 6
        ctx.strokeStyle = 'rgba(0,0,0,0.85)'
        ctx.strokeText(line, W / 2, y)
      }
      ctx.fillStyle = title.color || '#ffffff'
      ctx.fillText(line, W / 2, y)
    })
    ctx.restore()
  }
}

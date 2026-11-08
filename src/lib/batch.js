import { LIMITS } from './config'

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** Coerce a possibly-empty/NaN numeric input into a clamped integer. */
export function toInt(value, fallback, lo = -Infinity, hi = Infinity) {
  const n = parseInt(value, 10)
  return clamp(Number.isFinite(n) ? n : fallback, lo, hi)
}

export function toFloat(value, fallback, lo = -Infinity, hi = Infinity) {
  const n = parseFloat(value)
  return clamp(Number.isFinite(n) ? n : fallback, lo, hi)
}

/**
 * Plan batch capture timestamps without floating point drift.
 * modes:
 *  - interval: count shots every intervalMs starting at start
 *  - frames:   count shots every N frames starting at start
 *  - spread:   count shots evenly spaced between start and end (inclusive)
 *  - range:    one shot every intervalMs between start and end (in/out points)
 */
export function planBatch({ mode = 'interval', start = 0, end, duration, count = 5, intervalMs = 500, everyFrames = 10, fps = 30 }) {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : Infinity
  const n = clamp(Math.floor(count) || 0, 0, LIMITS.batchMaxCount)
  const s = clamp(start || 0, 0, dur)
  const e = clamp(Number.isFinite(end) ? end : dur, s, dur)
  const out = []
  if (mode === 'spread') {
    if (n <= 0) return out
    if (!Number.isFinite(e)) return out
    if (n === 1) return [s]
    for (let i = 0; i < n; i++) out.push(s + ((e - s) * i) / (n - 1))
    return out
  }
  if (mode === 'range') {
    const step = Math.max(LIMITS.batchMinIntervalMs, intervalMs) / 1000
    if (!Number.isFinite(e)) return out
    for (let i = 0; i < LIMITS.batchMaxCount; i++) {
      const t = s + i * step
      if (t > e + 1e-9) break
      out.push(t)
    }
    return out
  }
  const step = mode === 'frames' ? Math.max(1, everyFrames) / Math.max(1, fps) : Math.max(LIMITS.batchMinIntervalMs, intervalMs) / 1000
  for (let i = 0; i < n; i++) {
    const t = s + i * step
    if (t > dur + 1e-9) break
    out.push(Math.min(t, dur))
  }
  return out
}

/** Timestamps for sampling a range at a given fps (index based, no drift). */
export function sampleTimes(start, end, fps, duration) {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : Infinity
  const s = clamp(start, 0, dur)
  const e = clamp(end, s, dur)
  const f = clamp(fps, 1, LIMITS.gifMaxFps)
  const count = Math.min(LIMITS.gifMaxFrames, Math.floor((e - s) * f + 1e-6) + 1)
  const out = []
  for (let i = 0; i < count; i++) out.push(Math.min(s + i / f, dur))
  return out
}

/** Order shots for animation: by capture sequence ascending. */
export function sortByCapture(shots) {
  return [...shots].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

/** Fill a naming template like {video}_{index}_{timecode}. */
export function applyNameTemplate(template, vars) {
  const name = String(template || '{index}').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''))
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '_')
      .slice(0, 120) || 'frame'
  )
}

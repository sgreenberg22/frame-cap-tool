const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0')

/** Format seconds as HH:MM:SS:FF (frame-accurate timecode). */
export function formatTimecode(seconds, fps = 30) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const f = Math.max(1, Math.round(fps))
  const totalFrames = Math.round(seconds * f)
  const frames = totalFrames % f
  const totalSec = Math.floor(totalFrames / f)
  const s = totalSec % 60
  const m = Math.floor(totalSec / 60) % 60
  const h = Math.floor(totalSec / 3600)
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(frames)}`
}

/** Format seconds as M:SS.mmm or H:MM:SS.mmm (human friendly). */
export function formatClock(seconds, { ms = true } = {}) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const h = Math.floor(seconds / 3600)
  const m = Math.floor(seconds / 60) % 60
  const s = seconds % 60
  const sec = ms ? s.toFixed(3).padStart(6, '0') : pad(s)
  return h > 0 ? `${h}:${pad(m)}:${sec}` : `${m}:${sec}`
}

/** Filename-safe timecode, e.g. 00-01-02.345 */
export function fileTimecode(seconds) {
  return formatClock(seconds).replace(/:/g, '-')
}

/**
 * Parse user time input. Accepts:
 *  "12.5" (seconds), "1:23", "1:02:03.5", "f120" / "120f" (frame numbers), "00:00:05:12" (timecode with frames)
 * Returns seconds, or NaN when unparseable.
 */
export function parseTime(input, fps = 30) {
  if (input == null) return NaN
  const str = String(input).trim().toLowerCase()
  if (!str) return NaN
  const frameMatch = str.match(/^f(\d+)$|^(\d+)f$/)
  if (frameMatch) return Number(frameMatch[1] ?? frameMatch[2]) / fps
  if (/^-?\d+(\.\d+)?s?$/.test(str)) return Math.max(0, parseFloat(str))
  const parts = str.split(':')
  if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return NaN
  const nums = parts.map(Number)
  if (nums.length === 4) {
    const [h, m, s, f] = nums
    return h * 3600 + m * 60 + s + f / fps
  }
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  return NaN
}

export function secondsToFrames(seconds, fps = 30) {
  return Math.round(seconds * fps)
}

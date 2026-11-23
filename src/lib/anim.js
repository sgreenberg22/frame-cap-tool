// Pure helpers for the animation studio (no DOM).

export const ANIM_SIZES = [
  ['640x360', 'Wide 16:9 (640 × 360)', 640, 360],
  ['480x480', 'Square (480 × 480)', 480, 480],
  ['360x640', 'Tall 9:16 (360 × 640)', 360, 640],
  ['640x480', 'Classic 4:3 (640 × 480)', 640, 480],
  ['320x180', 'Small wide (320 × 180)', 320, 180],
  ['128x128', 'Pixel art (128 × 128)', 128, 128],
]

export const MAX_FRAMES = 200

export function moveItem(arr, from, to) {
  if (from === to || from < 0 || from >= arr.length) return arr
  const t = Math.max(0, Math.min(arr.length - 1, to))
  const out = [...arr]
  const [x] = out.splice(from, 1)
  out.splice(t, 0, x)
  return out
}

/** Forward then back, without doubling the first and last frame: A B C → A B C B */
export function pingPong(items) {
  if (items.length < 3) return [...items]
  return [...items, ...items.slice(1, -1).reverse()]
}

/** Where to draw a source of size sw×sh inside dw×dh. mode: contain | cover | stretch */
export function fitRect(sw, sh, dw, dh, mode = 'contain') {
  if (mode === 'stretch') return { x: 0, y: 0, w: dw, h: dh }
  const k = mode === 'cover' ? Math.max(dw / sw, dh / sh) : Math.min(dw / sw, dh / sh)
  const w = sw * k
  const h = sh * k
  return { x: (dw - w) / 2, y: (dh - h) / 2, w, h }
}

/** Evenly spaced capture times for a video clip. */
export function videoSampleTimes({ start = 0, end, duration, fps = 10, maxFrames = MAX_FRAMES }) {
  const e = Math.min(end ?? duration, duration)
  const s = Math.max(0, Math.min(start, e))
  const span = e - s
  if (span <= 0) return [s]
  let n = Math.max(1, Math.floor(span * fps))
  n = Math.min(n, maxFrames)
  const step = span / n
  return Array.from({ length: n }, (_, i) => s + i * step)
}

export const totalDuration = (frames) => frames.reduce((a, f) => a + f.delay, 0)

/** Index of the frame showing at time t (ms), looping. */
export function frameAtTime(frames, t) {
  const total = totalDuration(frames)
  if (!total) return 0
  let m = ((t % total) + total) % total
  for (let i = 0; i < frames.length; i++) {
    if (m < frames[i].delay) return i
    m -= frames[i].delay
  }
  return frames.length - 1
}

export const clampDelay = (ms) => Math.max(20, Math.min(10000, Math.round(Number(ms) || 100)))
export const fpsToDelay = (fps) => clampDelay(1000 / Math.max(1, Math.min(50, fps)))

/** Paint-bucket fill on RGBA data. colour: [r,g,b,a]. Returns true if anything changed. */
export function floodFillData(data, w, h, sx, sy, colour, tolerance = 24) {
  sx = Math.floor(sx)
  sy = Math.floor(sy)
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return false
  const i0 = (sy * w + sx) * 4
  const t = [data[i0], data[i0 + 1], data[i0 + 2], data[i0 + 3]]
  if (t.every((v, k) => Math.abs(v - colour[k]) <= 1)) return false
  const near = (i) =>
    Math.abs(data[i] - t[0]) <= tolerance &&
    Math.abs(data[i + 1] - t[1]) <= tolerance &&
    Math.abs(data[i + 2] - t[2]) <= tolerance &&
    Math.abs(data[i + 3] - t[3]) <= tolerance
  const seen = new Uint8Array(w * h)
  const stack = [sx, sy]
  while (stack.length) {
    let y = stack.pop()
    const x0 = stack.pop()
    let x = x0
    while (x >= 0 && !seen[y * w + x] && near((y * w + x) * 4)) x--
    x++
    let up = false
    let down = false
    while (x < w && !seen[y * w + x] && near((y * w + x) * 4)) {
      seen[y * w + x] = 1
      const i = (y * w + x) * 4
      data[i] = colour[0]
      data[i + 1] = colour[1]
      data[i + 2] = colour[2]
      data[i + 3] = colour[3]
      if (y > 0) {
        const ok = !seen[(y - 1) * w + x] && near(((y - 1) * w + x) * 4)
        if (ok && !up) stack.push(x, y - 1)
        up = ok
      }
      if (y < h - 1) {
        const ok = !seen[(y + 1) * w + x] && near(((y + 1) * w + x) * 4)
        if (ok && !down) stack.push(x, y + 1)
        down = ok
      }
      x++
    }
  }
  return true
}

export const hexToRgba = (hex, a = 255) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
}

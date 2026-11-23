/**
 * Auto-straighten: find the dominant near-horizontal / near-vertical line direction
 * (horizons, walls, door frames) from the image's edge orientations and return the
 * rotation, in degrees clockwise, that would level it.
 */

/**
 * Estimate tilt of a greyscale image (array, y down). Returns {angle, confidence}.
 * Edge pixels vote for the rotation at which they pile up onto the fewest straight lines
 * (a Hough-style search), which stays reliable on hard, stair-stepped edges where per-pixel
 * edge orientation is biased towards 0°.
 */
export function estimateTilt(gray, w, h, { maxAngle = 20 } = {}) {
  const hx = []
  const hy = []
  const hm = []
  const vx = []
  const vy = []
  const vm = []
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx = gray[i + 1 + w] + 2 * gray[i + 1] + gray[i + 1 - w] - gray[i - 1 + w] - 2 * gray[i - 1] - gray[i - 1 - w]
      const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1]
      const mag = Math.hypot(gx, gy)
      if (mag < 80) continue
      // Gradient mostly vertical => a (near-)horizontal edge; mostly horizontal => (near-)vertical edge.
      if (Math.abs(gy) >= Math.abs(gx)) (hx.push(x), hy.push(y), hm.push(mag))
      else (vx.push(x), vy.push(y), vm.push(mag))
    }
  }
  const n = hx.length + vx.length
  if (n < 30) return { angle: 0, confidence: 0 }
  const size = Math.ceil(Math.hypot(w, h)) * 2 + 4
  const off = size / 2
  const acc = new Float64Array(size)
  const score = (deg) => {
    const r = (deg * Math.PI) / 180
    const c = Math.cos(r)
    const sn = Math.sin(r)
    acc.fill(0)
    for (let k = 0; k < hx.length; k++) acc[Math.floor(-hx[k] * sn + hy[k] * c + off)] += hm[k]
    for (let k = 0; k < vx.length; k++) acc[Math.floor(vx[k] * c + vy[k] * sn + off)] += vm[k]
    let sum = 0
    for (let k = 0; k < size; k++) sum += acc[k] * acc[k]
    return sum
  }
  const coarse = []
  let best = 0
  let bestScore = -1
  for (let d = -maxAngle; d <= maxAngle + 1e-9; d += 0.5) {
    const sc = score(d)
    coarse.push(sc)
    if (sc > bestScore) {
      bestScore = sc
      best = d
    }
  }
  for (let d = best - 0.5; d <= best + 0.5 + 1e-9; d += 0.1) {
    const sc = score(d)
    if (sc > bestScore) {
      bestScore = sc
      best = d
    }
  }
  const sorted = [...coarse].sort((a, b) => a - b)
  const median = sorted[sorted.length >> 1] || 1
  const confidence = Math.max(0, Math.min(1, (bestScore / median - 1.3) / 2))
  return { angle: -Math.round(best * 10) / 10 || 0, confidence }
}

/** Run on a canvas (downscaled for speed). Returns degrees to rotate clockwise, or null if unsure. */
export function detectStraighten(canvas) {
  const scale = Math.min(1, 480 / Math.max(canvas.width, canvas.height))
  const w = Math.max(8, Math.round(canvas.width * scale))
  const h = Math.max(8, Math.round(canvas.height * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  const gray = new Float32Array(w * h)
  for (let i = 0; i < gray.length; i++) gray[i] = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114
  const { angle, confidence } = estimateTilt(gray, w, h)
  if (confidence < 0.25 || Math.abs(angle) < 0.3) return null
  return angle
}

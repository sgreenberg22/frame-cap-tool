// Lightweight image analysis helpers (all local, on downscaled copies).
const LUMA = [0.2126, 0.7152, 0.0722]

function small(src, width = 64) {
  const w0 = src.videoWidth || src.naturalWidth || src.width
  const h0 = src.videoHeight || src.naturalHeight || src.height
  const w = Math.max(1, Math.min(width, w0))
  const h = Math.max(1, Math.round((h0 / w0) * w))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(src, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/** Grayscale signature for change detection. */
export function signature(src, width = 64) {
  const { data, width: w, height: h } = small(src, width)
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = data[i * 4] * LUMA[0] + data[i * 4 + 1] * LUMA[1] + data[i * 4 + 2] * LUMA[2]
  return out
}

/** Mean absolute difference between two signatures, 0..100. */
export function signatureDiff(a, b) {
  if (!a || !b || a.length !== b.length) return 100
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i])
  return (s / a.length / 255) * 100
}

/** Sharpness score: variance of the Laplacian on a grayscale downscale. */
export function sharpness(src, width = 240) {
  const { data, width: w, height: h } = small(src, width)
  const g = new Float32Array(w * h)
  for (let i = 0; i < g.length; i++) g[i] = data[i * 4] * LUMA[0] + data[i * 4 + 1] * LUMA[1] + data[i * 4 + 2] * LUMA[2]
  return laplacianVariance(g, w, h)
}

export function laplacianVariance(g, w, h) {
  let sum = 0,
    sum2 = 0,
    n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]
      sum += lap
      sum2 += lap * lap
      n++
    }
  }
  if (!n) return 0
  const mean = sum / n
  return sum2 / n - mean * mean
}

/** RGB + luma histograms (256 bins each) and a luma waveform column matrix. */
export function histogram(src, width = 256) {
  const { data, width: w, height: h } = small(src, width)
  const r = new Uint32Array(256),
    g = new Uint32Array(256),
    b = new Uint32Array(256),
    l = new Uint32Array(256)
  const wave = new Uint16Array(w * 64)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      r[data[i]]++
      g[data[i + 1]]++
      b[data[i + 2]]++
      const lv = Math.round(data[i] * LUMA[0] + data[i + 1] * LUMA[1] + data[i + 2] * LUMA[2])
      l[lv]++
      wave[x * 64 + (lv >> 2)]++
    }
  }
  return { r, g, b, l, wave, w, h }
}

/** Detect black bars (letterbox/pillarbox). Returns normalized crop rect or null. */
export function detectBars(src, threshold = 18) {
  const { data, width: w, height: h } = small(src, 160)
  const rowDark = (y) => {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      if (data[i] > threshold || data[i + 1] > threshold || data[i + 2] > threshold) return false
    }
    return true
  }
  const colDark = (x) => {
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4
      if (data[i] > threshold || data[i + 1] > threshold || data[i + 2] > threshold) return false
    }
    return true
  }
  let top = 0
  while (top < h / 3 && rowDark(top)) top++
  let bottom = h - 1
  while (bottom > (h * 2) / 3 && rowDark(bottom)) bottom--
  let left = 0
  while (left < w / 3 && colDark(left)) left++
  let right = w - 1
  while (right > (w * 2) / 3 && colDark(right)) right--
  if (top < 2 && left < 2 && h - 1 - bottom < 2 && w - 1 - right < 2) return null
  return { x: left / w, y: top / h, w: (right - left + 1) / w, h: (bottom - top + 1) / h }
}

/** Read one pixel from a drawable at normalized coords. */
export function readPixel(src, nx, ny) {
  const w0 = src.videoWidth || src.width
  const h0 = src.videoHeight || src.height
  const c = document.createElement('canvas')
  c.width = c.height = 1
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(src, Math.floor(nx * w0), Math.floor(ny * h0), 1, 1, 0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  return [d[0], d[1], d[2]]
}

// Image enhancement algorithms (pure, run in a worker). Images are { data: Uint8ClampedArray RGBA, width, height }.
const LR = 0.2126,
  LG = 0.7152,
  LB = 0.0722
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)

export function cloneImage(img) {
  return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height }
}

function lumaHistogram(img, step = 1) {
  const h = new Uint32Array(256)
  const d = img.data
  for (let i = 0; i < d.length; i += 4 * step) h[(d[i] * LR + d[i + 1] * LG + d[i + 2] * LB + 0.5) | 0]++
  return h
}

function percentile(hist, p) {
  let total = 0
  for (let i = 0; i < 256; i++) total += hist[i]
  let acc = 0
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc >= total * p) return i
  }
  return 255
}

/** Stretch black/white points (0.5% clip) and nudge the midtones toward a balanced exposure. */
export function autoTone(img, strength = 1) {
  const hist = lumaHistogram(img, Math.max(1, Math.floor((img.width * img.height) / 400000)))
  let lo = percentile(hist, 0.005)
  let hi = percentile(hist, 0.995)
  if (hi - lo < 16) return img
  lo *= strength
  hi = 255 - (255 - hi) * strength
  const mid = (percentile(hist, 0.5) - lo) / (hi - lo)
  // gamma so that the median lands near 0.46, limited to a gentle range
  let gamma = mid > 0.02 && mid < 0.98 ? Math.log(0.46) / Math.log(mid) : 1
  gamma = 1 + (Math.min(1.6, Math.max(0.65, gamma)) - 1) * 0.6 * strength
  const lut = new Uint8ClampedArray(256)
  for (let i = 0; i < 256; i++) lut[i] = Math.pow(clamp01((i - lo) / (hi - lo)), gamma) * 255 + 0.5
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]]
    d[i + 1] = lut[d[i + 1]]
    d[i + 2] = lut[d[i + 2]]
  }
  return img
}

/** Gray-world white balance computed on mid-tone pixels, blended by strength. */
export function autoWhiteBalance(img, strength = 1) {
  const d = img.data
  let r = 0,
    g = 0,
    b = 0,
    n = 0
  const step = 4 * Math.max(1, Math.floor((img.width * img.height) / 300000))
  for (let i = 0; i < d.length; i += step) {
    const l = d[i] * LR + d[i + 1] * LG + d[i + 2] * LB
    if (l < 30 || l > 225) continue
    r += d[i]
    g += d[i + 1]
    b += d[i + 2]
    n++
  }
  if (n < 50) return img
  r /= n
  g /= n
  b /= n
  const gray = (r + g + b) / 3
  const lim = (x) => Math.min(1.8, Math.max(0.55, x))
  const gr = 1 + (lim(gray / Math.max(1, r)) - 1) * strength
  const gg = 1 + (lim(gray / Math.max(1, g)) - 1) * strength
  const gb = 1 + (lim(gray / Math.max(1, b)) - 1) * strength
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] * gr
    d[i + 1] = d[i + 1] * gg
    d[i + 2] = d[i + 2] * gb
  }
  return img
}

/** Boost muted colors more than saturated ones. amount -1..1 */
export function vibrance(img, amount = 0.25) {
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i],
      g = d[i + 1],
      b = d[i + 2]
    const mx = Math.max(r, g, b),
      mn = Math.min(r, g, b)
    const l = r * LR + g * LG + b * LB
    const k = 1 + amount * (1 - (mx - mn) / 255)
    d[i] = l + (r - l) * k
    d[i + 1] = l + (g - l) * k
    d[i + 2] = l + (b - l) * k
  }
  return img
}

/** Separable box blur on a Float32 plane (in place), radius in px. */
function boxBlurPlane(src, w, h, r, tmp) {
  if (r < 1) return src
  const win = 2 * r + 1
  for (let y = 0; y < h; y++) {
    let acc = 0
    const row = y * w
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]
    for (let y = 0; y < h; y++) {
      src[y * w + x] = acc / win
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return src
}

function lumaPlane(img) {
  const n = img.width * img.height
  const out = new Float32Array(n)
  const d = img.data
  for (let i = 0, p = 0; p < n; i += 4, p++) out[p] = d[i] * LR + d[i + 1] * LG + d[i + 2] * LB
  return out
}

/** Approximate gaussian blur of the luma plane (3 box passes). */
function blurredLuma(img, radius) {
  const { width: w, height: h } = img
  const l = lumaPlane(img)
  const tmp = new Float32Array(w * h)
  const r = Math.max(1, Math.round(radius))
  for (let i = 0; i < 3; i++) boxBlurPlane(l, w, h, r, tmp)
  return l
}

/** Unsharp mask on luminance (no color fringing). amount 0..2, radius px, threshold 0..255 */
export function sharpen(img, amount = 0.6, radius = 1.2, threshold = 2) {
  const blur = blurredLuma(img, radius)
  const d = img.data
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const l = d[i] * LR + d[i + 1] * LG + d[i + 2] * LB
    let diff = l - blur[p]
    if (Math.abs(diff) < threshold) continue
    diff *= amount
    d[i] += diff
    d[i + 1] += diff
    d[i + 2] += diff
  }
  return img
}

/** Local contrast: large-radius unsharp mask weighted toward the midtones. */
export function clarity(img, amount = 0.5) {
  const radius = Math.max(4, Math.round(Math.max(img.width, img.height) / 60))
  const blur = blurredLuma(img, radius)
  const d = img.data
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const l = d[i] * LR + d[i + 1] * LG + d[i + 2] * LB
    const mid = 1 - Math.abs(l / 127.5 - 1) // 0 at black/white, 1 at mid gray
    const diff = (l - blur[p]) * amount * (0.35 + 0.65 * mid)
    d[i] += diff
    d[i + 1] += diff
    d[i + 2] += diff
  }
  return img
}

/** Edge-preserving bilateral denoise. strength 0..1 */
export function denoise(img, strength = 0.5) {
  const { width: w, height: h } = img
  const src = new Uint8ClampedArray(img.data)
  const d = img.data
  const r = strength > 0.6 ? 3 : 2
  const sigma = 6 + strength * 34
  const range = new Float32Array(256 * 3 + 1)
  for (let i = 0; i < range.length; i++) range[i] = Math.exp(-(i * i) / (2 * sigma * sigma * 3))
  const spatial = []
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) spatial.push([dx, dy, Math.exp(-(dx * dx + dy * dy) / (2 * r * r))])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const r0 = src[i],
        g0 = src[i + 1],
        b0 = src[i + 2]
      let sr = 0,
        sg = 0,
        sb = 0,
        sw = 0
      for (let k = 0; k < spatial.length; k++) {
        const s = spatial[k]
        const xx = x + s[0],
          yy = y + s[1]
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
        const j = (yy * w + xx) * 4
        const diff = Math.abs(src[j] - r0) + Math.abs(src[j + 1] - g0) + Math.abs(src[j + 2] - b0)
        const wgt = s[2] * range[diff]
        sr += src[j] * wgt
        sg += src[j + 1] * wgt
        sb += src[j + 2] * wgt
        sw += wgt
      }
      d[i] = sr / sw
      d[i + 1] = sg / sw
      d[i + 2] = sb / sw
    }
  }
  return img
}

/** Haze removal with a simplified dark-channel prior. amount 0..1 */
export function dehaze(img, amount = 0.6) {
  const { width: w, height: h } = img
  const d = img.data
  const n = w * h
  const dark = new Float32Array(n)
  for (let i = 0, p = 0; p < n; i += 4, p++) dark[p] = Math.min(d[i], d[i + 1], d[i + 2])
  // min filter approximated by a small erosion, then smooth
  const r = Math.max(2, Math.round(Math.max(w, h) / 200))
  const er = new Float32Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 255
      for (let k = -r; k <= r; k += r) {
        const xx = Math.min(w - 1, Math.max(0, x + k)),
          yy = Math.min(h - 1, Math.max(0, y + k))
        m = Math.min(m, dark[y * w + xx], dark[yy * w + x])
      }
      er[y * w + x] = m
    }
  }
  const tmp = new Float32Array(n)
  for (let i = 0; i < 2; i++) boxBlurPlane(er, w, h, r * 3, tmp)
  // atmospheric light: mean of the brightest 0.5% of the dark channel
  const hist = new Uint32Array(256)
  for (let p = 0; p < n; p++) hist[er[p] | 0]++
  let cut = 255,
    acc = 0
  for (; cut > 0; cut--) {
    acc += hist[cut]
    if (acc > n * 0.005) break
  }
  let ar = 0,
    ag = 0,
    ab = 0,
    an = 0
  for (let i = 0, p = 0; p < n; i += 4, p++)
    if (er[p] >= cut) {
      ar += d[i]
      ag += d[i + 1]
      ab += d[i + 2]
      an++
    }
  if (!an) return img
  ar = Math.max(120, ar / an)
  ag = Math.max(120, ag / an)
  ab = Math.max(120, ab / an)
  const A = Math.max(ar, ag, ab)
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    const t = Math.max(0.25, 1 - amount * 0.95 * (er[p] / A))
    d[i] = (d[i] - ar) / t + ar
    d[i + 1] = (d[i + 1] - ag) / t + ag
    d[i + 2] = (d[i + 2] - ab) / t + ab
  }
  return img
}

/** Brighten shadows while protecting highlights, then clean up the lifted noise. amount 0..1 */
export function lowLight(img, amount = 0.6) {
  const g = 1 / (1 + amount * 1.4)
  const lut = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const x = i / 255
    const lifted = Math.pow(x, g)
    lut[i] = (lifted * (1 - x) + x * x) / (1 - x + x) // blend: shadows lifted, highlights kept
  }
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * LR + d[i + 1] * LG + d[i + 2] * LB
    const k = l > 1 ? Math.min(4, (lut[Math.min(255, l | 0)] * 255) / l) : 1
    d[i] *= k
    d[i + 1] *= k
    d[i + 2] *= k
  }
  denoise(img, Math.min(0.8, 0.3 + amount * 0.4))
  return img
}

/** Remove interlacing combs by rebuilding odd lines from their neighbors. */
export function deinterlace(img) {
  const { width: w, height: h, data: d } = img
  for (let y = 1; y < h - 1; y += 2) {
    const a = (y - 1) * w * 4,
      b = (y + 1) * w * 4,
      o = y * w * 4
    for (let x = 0; x < w * 4; x++) d[o + x] = (d[a + x] + d[b + x]) >> 1
  }
  return img
}

const lanczos = (x, a) => {
  if (x === 0) return 1
  if (x <= -a || x >= a) return 0
  const px = Math.PI * x
  return (a * Math.sin(px) * Math.sin(px / a)) / (px * px)
}

/** Build per-output-pixel Lanczos contributions for one axis. */
function contributions(srcSize, dstSize, a = 3) {
  const scale = dstSize / srcSize
  const support = scale < 1 ? a / scale : a
  const fscale = Math.min(1, scale)
  const out = new Array(dstSize)
  for (let i = 0; i < dstSize; i++) {
    const center = (i + 0.5) / scale - 0.5
    const lo = Math.max(0, Math.floor(center - support) + 1)
    const hi = Math.min(srcSize - 1, Math.ceil(center + support) - 1)
    const idx = new Int32Array(hi - lo + 1)
    const wts = new Float32Array(hi - lo + 1)
    let sum = 0
    for (let j = lo; j <= hi; j++) {
      const wgt = lanczos((j - center) * fscale, a)
      idx[j - lo] = j
      wts[j - lo] = wgt
      sum += wgt
    }
    for (let k = 0; k < wts.length; k++) wts[k] /= sum || 1
    out[i] = { idx, wts }
  }
  return out
}

/** High-quality Lanczos-3 resize (up or down) to exact dimensions. */
export function resizeLanczos(img, dw, dh) {
  const { width: sw, height: sh, data: s } = img
  dw = Math.max(1, Math.round(dw))
  dh = Math.max(1, Math.round(dh))
  const cx = contributions(sw, dw)
  const cy = contributions(sh, dh)
  const mid = new Float32Array(dw * sh * 4)
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dw; x++) {
      const { idx, wts } = cx[x]
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let k = 0; k < idx.length; k++) {
        const j = (y * sw + idx[k]) * 4
        const wgt = wts[k]
        r += s[j] * wgt
        g += s[j + 1] * wgt
        b += s[j + 2] * wgt
        a += s[j + 3] * wgt
      }
      const o = (y * dw + x) * 4
      mid[o] = r
      mid[o + 1] = g
      mid[o + 2] = b
      mid[o + 3] = a
    }
  }
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const { idx, wts } = cy[y]
    for (let x = 0; x < dw; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0
      for (let k = 0; k < idx.length; k++) {
        const j = (idx[k] * dw + x) * 4
        const wgt = wts[k]
        r += mid[j] * wgt
        g += mid[j + 1] * wgt
        b += mid[j + 2] * wgt
        a += mid[j + 3] * wgt
      }
      const o = (y * dw + x) * 4
      out[o] = r
      out[o + 1] = g
      out[o + 2] = b
      out[o + 3] = a
    }
  }
  return { data: out, width: dw, height: dh }
}

/**
 * Contrast-adaptive sharpening (after AMD CAS): sharpens soft areas more than already-crisp edges,
 * which avoids the halos of a plain unsharp mask. sharpness 0..1
 */
export function cas(img, sharpness = 0.5) {
  const { width: w, height: h } = img
  const src = new Uint8ClampedArray(img.data)
  const d = img.data
  const peak = -1 / (8 - 3 * sharpness)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4
      for (let c = 0; c < 3; c++) {
        const e = src[i + c] / 255
        const b = src[i - w * 4 + c] / 255,
          dd = src[i - 4 + c] / 255,
          f = src[i + 4 + c] / 255,
          hh = src[i + w * 4 + c] / 255
        const mn = Math.min(b, dd, e, f, hh),
          mx = Math.max(b, dd, e, f, hh)
        const amp = Math.sqrt(clamp01(Math.min(mn, 1 - mx) / (mx || 1e-5)))
        const wgt = amp * peak
        d[i + c] = ((b * wgt + dd * wgt + f * wgt + hh * wgt + e) / (1 + 4 * wgt)) * 255
      }
    }
  }
  return img
}

// ---------- Colour bands (HSL) and lens corrections ----------

export const HSL_BANDS = [
  ['red', 'Red', 0],
  ['orange', 'Orange', 30],
  ['yellow', 'Yellow', 60],
  ['green', 'Green', 120],
  ['aqua', 'Aqua', 180],
  ['blue', 'Blue', 240],
  ['purple', 'Purple', 270],
  ['magenta', 'Magenta', 300],
]

function rgbToHsl(r, g, b) {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  if (mx === mn) return [0, 0, l]
  const d = mx - mn
  const sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  let hue
  if (mx === r) hue = (g - b) / d + (g < b ? 6 : 0)
  else if (mx === g) hue = (b - r) / d + 2
  else hue = (r - g) / d + 4
  return [hue * 60, sat, l]
}

function hueToRgb(p, q, t) {
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

function hslToRgb(h, sat, l) {
  if (sat === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat
  const p = 2 * l - q
  const hk = h / 360
  return [hueToRgb(p, q, hk + 1 / 3), hueToRgb(p, q, hk), hueToRgb(p, q, hk - 1 / 3)]
}

/**
 * Per-colour hue / saturation / luminance. bands: { red: {h, s, l}, ... } with h in -100..100
 * (up to 30° of hue), s and l in -100..100. Neighbouring bands blend smoothly.
 */
export function hslAdjust(img, bands) {
  const active = HSL_BANDS.map(([key, , centre]) => ({ centre, ...(bands?.[key] || {}) })).filter((b) => b.h || b.s || b.l)
  if (!active.length) return img
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    let [h, sat, l] = rgbToHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255)
    if (sat < 0.02) continue
    let dh = 0
    let ds = 0
    let dl = 0
    for (const b of active) {
      let dist = Math.abs(h - b.centre)
      if (dist > 180) dist = 360 - dist
      const w = dist >= 45 ? 0 : 0.5 + 0.5 * Math.cos((dist / 45) * Math.PI)
      if (!w) continue
      dh += (b.h || 0) * 0.3 * w
      ds += ((b.s || 0) / 100) * w
      dl += ((b.l || 0) / 100) * 0.5 * w
    }
    h = (h + dh + 360) % 360
    sat = clamp01(sat * (1 + ds))
    l = clamp01(l + dl * Math.min(1, sat * 2))
    const [r, g, b] = hslToRgb(h, sat, l)
    d[i] = r * 255
    d[i + 1] = g * 255
    d[i + 2] = b * 255
  }
  return img
}

/**
 * Three-way colour grading. Each range is { hue (deg), amount (0..100), lum (-100..100) }:
 * amount tints that range towards the hue, lum lifts or lowers it. Ranges blend by brightness.
 */
export function colorGrade(img, g) {
  const ranges = ['shadows', 'mids', 'highlights'].map((k) => {
    const r = g?.[k] || {}
    const [tr, tg, tb] = hslToRgb((((r.hue || 0) % 360) + 360) % 360, 1, 0.5)
    const m = (tr + tg + tb) / 3
    const a = ((r.amount || 0) / 100) * 0.3
    return { t: [(tr - m) * a, (tg - m) * a, (tb - m) * a], lum: ((r.lum || 0) / 100) * 0.25, on: !!(r.amount || r.lum) }
  })
  if (!ranges.some((r) => r.on)) return img
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const r0 = d[i] / 255
    const g0 = d[i + 1] / 255
    const b0 = d[i + 2] / 255
    const l = r0 * LR + g0 * LG + b0 * LB
    const ws = (1 - clamp01(l * 2)) ** 2
    const wh = clamp01(l * 2 - 1) ** 2
    const w = [ws, 1 - ws - wh, wh]
    let r = r0
    let gg = g0
    let b = b0
    for (let k = 0; k < 3; k++) {
      if (!ranges[k].on) continue
      r += (ranges[k].t[0] + ranges[k].lum) * w[k]
      gg += (ranges[k].t[1] + ranges[k].lum) * w[k]
      b += (ranges[k].t[2] + ranges[k].lum) * w[k]
    }
    d[i] = clamp01(r) * 255
    d[i + 1] = clamp01(gg) * 255
    d[i + 2] = clamp01(b) * 255
  }
  return img
}

/** Brighten (amount > 0) or darken (amount < 0) towards the corners; amount -1..1. */
export function devignette(img, amount = 0.5) {
  const { width: w, height: h, data: d } = img
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const maxR2 = cx * cx + cy * cy || 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r2 = ((x - cx) ** 2 + (y - cy) ** 2) / maxR2
      const gain = 1 + amount * 1.2 * r2 * r2 + amount * 0.3 * r2
      const i = (y * w + x) * 4
      d[i] *= gain
      d[i + 1] *= gain
      d[i + 2] *= gain
    }
  }
  return img
}

function sampleChannel(src, w, h, c, x, y) {
  if (x < 0) x = 0
  else if (x > w - 1) x = w - 1
  if (y < 0) y = 0
  else if (y > h - 1) y = h - 1
  const x0 = x | 0
  const y0 = y | 0
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const a = src[(y0 * w + x0) * 4 + c] * (1 - fx) + src[(y0 * w + x1) * 4 + c] * fx
  const b = src[(y1 * w + x0) * 4 + c] * (1 - fx) + src[(y1 * w + x1) * 4 + c] * fx
  return a * (1 - fy) + b * fy
}

/**
 * Lateral chromatic aberration (red/blue colour fringes toward the corners): find the radial
 * scale that makes the red and blue edges line up with green, then resample those channels.
 */
export function defringe(img, strength = 1) {
  const { width: w, height: h } = img
  const src = new Uint8ClampedArray(img.data)
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const step = Math.max(1, Math.round(Math.max(w, h) / 700))
  const best = (c) => {
    let bestS = 1
    let bestErr = Infinity
    for (let k = -8; k <= 8; k++) {
      const sc = 1 + k * 0.0006
      let err = 0
      for (let y = 2; y < h - 2; y += step) {
        for (let x = 2; x < w - 2; x += step) {
          // Compare horizontal + vertical gradients of this channel (sampled at the scaled spot) with green's.
          const sx = cx + (x - cx) * sc
          const sy = cy + (y - cy) * sc
          const gc = sampleChannel(src, w, h, c, sx + 1, sy) - sampleChannel(src, w, h, c, sx - 1, sy)
          const gg = src[(y * w + x + 1) * 4 + 1] - src[(y * w + x - 1) * 4 + 1]
          const vc = sampleChannel(src, w, h, c, sx, sy + 1) - sampleChannel(src, w, h, c, sx, sy - 1)
          const vg = src[((y + 1) * w + x) * 4 + 1] - src[((y - 1) * w + x) * 4 + 1]
          err += Math.abs(gc - gg) + Math.abs(vc - vg)
        }
      }
      if (err < bestErr) {
        bestErr = err
        bestS = sc
      }
    }
    return 1 + (bestS - 1) * strength
  }
  const sr = best(0)
  const sb = best(2)
  if (sr === 1 && sb === 1) return img
  const d = img.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      d[i] = sampleChannel(src, w, h, 0, cx + (x - cx) * sr, cy + (y - cy) * sr)
      d[i + 2] = sampleChannel(src, w, h, 2, cx + (x - cx) * sb, cy + (y - cy) * sb)
    }
  }
  return img
}

/**
 * Barrel / pincushion distortion. amount -1..1: positive pulls the image outwards at the edges
 * (fixes barrel "bulge" from wide lenses), negative pushes inwards (fixes pincushion). The
 * result is zoomed just enough that no empty corners appear.
 */
export function lensDistortion(img, amount = 0.3) {
  if (!amount) return img
  const { width: w, height: h } = img
  const src = new Uint8ClampedArray(img.data)
  const d = img.data
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const norm = Math.hypot(cx, cy) || 1
  const k = -amount * 0.35
  const map = (nx, ny, z) => {
    const f = (1 + k * (nx * nx + ny * ny)) / z
    return [nx * f, ny * f]
  }
  // Smallest zoom at which every output pixel still samples inside the source.
  let z = 1
  for (let t = 0; t <= 1.0001; t += 0.01) {
    for (const [ex, ey] of [
      [-cx + 2 * cx * t, -cy],
      [-cx + 2 * cx * t, cy],
      [-cx, -cy + 2 * cy * t],
      [cx, -cy + 2 * cy * t],
    ]) {
      const [mx, my] = map(ex / norm, ey / norm, 1)
      z = Math.max(z, Math.abs(mx * norm) / cx, Math.abs(my * norm) / cy)
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [mx, my] = map((x - cx) / norm, (y - cy) / norm, z)
      const sx = Math.min(w - 1, Math.max(0, cx + mx * norm))
      const sy = Math.min(h - 1, Math.max(0, cy + my * norm))
      const x0 = sx | 0
      const y0 = sy | 0
      const x1 = Math.min(w - 1, x0 + 1)
      const y1 = Math.min(h - 1, y0 + 1)
      const fx = sx - x0
      const fy = sy - y0
      const o = (y * w + x) * 4
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * w + x0) * 4 + c] * (1 - fx) + src[(y0 * w + x1) * 4 + c] * fx
        const b = src[(y1 * w + x0) * 4 + c] * (1 - fx) + src[(y1 * w + x1) * 4 + c] * fx
        d[o + c] = a * (1 - fy) + b * fy
      }
    }
  }
  return img
}

/** Smart upscale: Lanczos-3 followed by contrast-adaptive sharpening. */
export function smartUpscale(img, scale = 2, sharpness = 0.45) {
  const out = resizeLanczos(img, img.width * scale, img.height * scale)
  return sharpness > 0 ? cas(out, sharpness) : out
}

/** Combine several same-size frames: mean, or median for 3+ frames (removes noise and moving specks). */
export function stackFrames(images, mode = 'median') {
  const first = images[0]
  const n = images.length
  const out = new Uint8ClampedArray(first.data.length)
  if (n === 1) return cloneImage(first)
  if (mode === 'mean' || n < 3) {
    for (let i = 0; i < out.length; i++) {
      let s = 0
      for (let k = 0; k < n; k++) s += images[k].data[i]
      out[i] = s / n
    }
  } else {
    const buf = new Uint8Array(n)
    const mid = n >> 1
    for (let i = 0; i < out.length; i++) {
      for (let k = 0; k < n; k++) buf[k] = images[k].data[i]
      buf.sort()
      out[i] = n % 2 ? buf[mid] : (buf[mid - 1] + buf[mid]) >> 1
    }
  }
  return { data: out, width: first.width, height: first.height }
}

/** One-click improvement: white balance, tone, color, light denoise and sharpening. */
export function autoEnhance(img, strength = 1) {
  autoWhiteBalance(img, 0.6 * strength)
  autoTone(img, strength)
  vibrance(img, 0.18 * strength)
  denoise(img, 0.25 * strength)
  sharpen(img, 0.45 * strength, 1.1, 2)
  return img
}

/** Cumulative distribution (0..1, 256 bins) of each RGB channel, ignoring transparent pixels. */
export function channelCdfs(img) {
  const h = [new Float64Array(256), new Float64Array(256), new Float64Array(256)]
  const d = img.data
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue
    h[0][d[i]]++
    h[1][d[i + 1]]++
    h[2][d[i + 2]]++
    n++
  }
  return h.map((hist) => {
    const cdf = new Float32Array(256)
    let acc = 0
    for (let k = 0; k < 256; k++) {
      acc += hist[k]
      cdf[k] = n ? acc / n : k / 255
    }
    return cdf
  })
}

/** Histogram matching: make each channel of `img` follow the distribution described by `refCdfs`. */
export function colorMatch(img, refCdfs, strength = 1) {
  const src = channelCdfs(img)
  // Compare mid-points of each histogram step. With flat-colour images (screenshots, test charts)
  // whole plateaus share one value, and using the step's edge would overshoot.
  const mid = (cdf) => Float32Array.from(cdf, (v, k) => ((k ? cdf[k - 1] : 0) + v) / 2)
  const luts = src.map((cdf, c) => {
    const lut = new Uint8ClampedArray(256)
    const sMid = mid(cdf)
    const rMid = mid(refCdfs[c])
    let j = 0
    for (let k = 0; k < 256; k++) {
      while (j < 255 && rMid[j] < sMid[k]) j++
      lut[k] = Math.round(k + (j - k) * strength)
    }
    return lut
  })
  const out = new Uint8ClampedArray(img.data)
  for (let i = 0; i < out.length; i += 4) {
    out[i] = luts[0][out[i]]
    out[i + 1] = luts[1][out[i + 1]]
    out[i + 2] = luts[2][out[i + 2]]
  }
  return { data: out, width: img.width, height: img.height }
}

export const ENHANCE_OPS = {
  colorMatch: (img, p) => colorMatch(img, p.refCdfs, p.strength ?? 1),
  autoEnhance: (img, p) => autoEnhance(img, p.strength ?? 1),
  autoTone: (img, p) => autoTone(img, p.strength ?? 1),
  autoWhiteBalance: (img, p) => autoWhiteBalance(img, p.strength ?? 1),
  vibrance: (img, p) => vibrance(img, (p.strength ?? 1) * 0.35),
  denoise: (img, p) => denoise(img, (p.strength ?? 1) * 0.6),
  sharpen: (img, p) => sharpen(img, (p.strength ?? 1) * 0.8, p.radius ?? 1.2, 2),
  clarity: (img, p) => clarity(img, (p.strength ?? 1) * 0.6),
  dehaze: (img, p) => dehaze(img, (p.strength ?? 1) * 0.7),
  lowLight: (img, p) => lowLight(img, (p.strength ?? 1) * 0.7),
  deinterlace: (img) => deinterlace(img),
  smartUpscale: (img, p) => smartUpscale(img, p.scale ?? 2, p.sharpness ?? 0.45),
  resize: (img, p) => resizeLanczos(img, p.width, p.height),
  cas: (img, p) => cas(img, p.sharpness ?? 0.5),
  hsl: (img, p) => hslAdjust(img, p.bands),
  devignette: (img, p) => devignette(img, p.amount ?? 0.5),
  colorGrade: (img, p) => colorGrade(img, p.grade),
  lensDistortion: (img, p) => lensDistortion(img, p.amount ?? 0.3),
  defringe: (img, p) => defringe(img, p.strength ?? 1),
}

/** Run a list of ops ({op, ...params}) in order. */
export function runOps(img, ops, onStep) {
  let cur = img
  ops.forEach((o, i) => {
    const fn = ENHANCE_OPS[o.op]
    if (!fn) throw new Error(`Unknown enhancement: ${o.op}`)
    cur = fn(cur, o) || cur
    onStep?.((i + 1) / ops.length)
  })
  return cur
}

export const ENHANCE_TOOLS = [
  ['autoEnhance', 'Auto enhance', 'White balance, tone, color, light denoise and sharpen in one click'],
  ['autoTone', 'Auto tone', 'Fix exposure and contrast'],
  ['autoWhiteBalance', 'Auto white balance', 'Remove color casts'],
  ['denoise', 'Denoise', 'Smooth grain and compression noise, keeping edges'],
  ['sharpen', 'Sharpen', 'Crisper detail without color fringes'],
  ['clarity', 'Clarity', 'Punchier local contrast'],
  ['dehaze', 'Dehaze', 'Cut through fog, haze and washed-out video'],
  ['lowLight', 'Low-light boost', 'Brighten dark footage and clean the noise'],
  ['vibrance', 'Vibrance', 'Richer colors without oversaturating'],
  ['deinterlace', 'Deinterlace', 'Remove comb lines from interlaced video'],
]

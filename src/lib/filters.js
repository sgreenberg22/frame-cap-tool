// Filter model shared by the WebGL preview, the capture pipeline, the JS fallback and the editor.

export const DEFAULT_FILTERS = Object.freeze({
  exposure: 0, // EV, -3..3
  brightness: 100, // %, 0..200
  contrast: 100, // %, 0..200
  saturate: 100, // %, 0..300
  vibrance: 0, // -100..100
  hue: 0, // deg, -180..180
  temperature: 0, // -100..100 (cool..warm)
  tint: 0, // -100..100 (green..magenta)
  gamma: 1, // 0.2..3
  highlights: 0, // -100..100
  shadows: 0, // -100..100
  grayscale: 0, // %, 0..100
  sepia: 0, // %, 0..100
  invert: 0, // %, 0..100
  blur: 0, // px, 0..20
  sharpen: 0, // 0..100
  vignette: 0, // 0..100
  grain: 0, // 0..100
  opacity: 100, // %, 0..100
  levelsBlack: 0, // 0..254
  levelsWhite: 255, // 1..255
  levelsMid: 1, // 0.1..3
  curve: null, // [[x,y],...] 0..255, null = identity
  lutName: null,
  lutStrength: 100,
  chromaEnabled: false,
  chromaColor: '#00ff00',
  chromaTolerance: 30, // 0..100
  chromaSoftness: 10, // 0..100
})

/** Slider definitions: [key, label, min, max, step, unit, group] */
export const FILTER_FIELDS = [
  ['exposure', 'Exposure', -3, 3, 0.05, 'EV', 'light'],
  ['brightness', 'Brightness', 0, 200, 1, '%', 'light'],
  ['contrast', 'Contrast', 0, 200, 1, '%', 'light'],
  ['highlights', 'Highlights', -100, 100, 1, '', 'light'],
  ['shadows', 'Shadows', -100, 100, 1, '', 'light'],
  ['gamma', 'Gamma', 0.2, 3, 0.01, '', 'light'],
  ['saturate', 'Saturation', 0, 300, 1, '%', 'color'],
  ['vibrance', 'Vibrance', -100, 100, 1, '', 'color'],
  ['hue', 'Hue', -180, 180, 1, '°', 'color'],
  ['temperature', 'Temperature', -100, 100, 1, '', 'color'],
  ['tint', 'Tint', -100, 100, 1, '', 'color'],
  ['grayscale', 'Grayscale', 0, 100, 1, '%', 'effects'],
  ['sepia', 'Sepia', 0, 100, 1, '%', 'effects'],
  ['invert', 'Invert', 0, 100, 1, '%', 'effects'],
  ['blur', 'Blur', 0, 20, 0.5, 'px', 'effects'],
  ['sharpen', 'Sharpen', 0, 100, 1, '', 'effects'],
  ['vignette', 'Vignette', 0, 100, 1, '', 'effects'],
  ['grain', 'Grain', 0, 100, 1, '', 'effects'],
  ['opacity', 'Opacity', 0, 100, 1, '%', 'effects'],
  ['levelsBlack', 'Levels black', 0, 254, 1, '', 'levels'],
  ['levelsWhite', 'Levels white', 1, 255, 1, '', 'levels'],
  ['levelsMid', 'Levels midtone', 0.1, 3, 0.01, '', 'levels'],
]

export const FILTER_PRESETS = {
  Vivid: { contrast: 115, saturate: 140, vibrance: 20 },
  'B&W': { grayscale: 100, contrast: 120 },
  Vintage: { sepia: 45, contrast: 90, saturate: 80, vignette: 45, grain: 25, temperature: 15 },
  Cool: { temperature: -35, tint: -5, saturate: 105 },
  Warm: { temperature: 35, tint: 5, saturate: 110 },
  Film: { contrast: 110, saturate: 85, grain: 35, highlights: -20, shadows: 15, vignette: 20 },
  'High contrast': { contrast: 160, saturate: 120, shadows: -15, highlights: 10 },
}

export const VIEW_MODES = [
  ['normal', 'Normal'],
  ['protanopia', 'Protanopia sim'],
  ['deuteranopia', 'Deuteranopia sim'],
  ['tritanopia', 'Tritanopia sim'],
  ['falsecolor', 'False color'],
  ['zebra', 'Zebra (clipping)'],
  ['edges', 'Edge detect'],
  ['threshold', 'Threshold'],
  ['motion', 'Motion (frame diff)'],
]

export function isDefaultFilters(f) {
  return Object.keys(DEFAULT_FILTERS).every((k) => {
    if (k === 'curve') return !f.curve || isIdentityCurve(f.curve)
    return f[k] === DEFAULT_FILTERS[k]
  })
}

export function isIdentityCurve(points) {
  return !points || points.every(([x, y]) => x === y)
}

/** CSS filter string for the subset CSS supports (used when WebGL2 is unavailable). */
export function toCssFilter(f) {
  const exp = Math.pow(2, f.exposure || 0)
  const parts = [
    `brightness(${((f.brightness ?? 100) * exp).toFixed(1)}%)`,
    `contrast(${f.contrast ?? 100}%)`,
    `saturate(${f.saturate ?? 100}%)`,
    `hue-rotate(${f.hue ?? 0}deg)`,
  ]
  if (f.grayscale) parts.push(`grayscale(${f.grayscale}%)`)
  if (f.sepia) parts.push(`sepia(${f.sepia}%)`)
  if (f.invert) parts.push(`invert(${f.invert}%)`)
  if (f.blur) parts.push(`blur(${f.blur}px)`)
  if (f.opacity != null && f.opacity !== 100) parts.push(`opacity(${f.opacity}%)`)
  return parts.join(' ')
}

let ctxFilterSupport
/** Safari/iOS canvas ignores ctx.filter. Detect it by drawing a filtered pixel. */
export function supportsCtxFilter() {
  if (ctxFilterSupport !== undefined) return ctxFilterSupport
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 1
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!('filter' in ctx)) return (ctxFilterSupport = false)
    ctx.fillStyle = '#ffffff'
    ctx.filter = 'invert(100%)'
    ctx.fillRect(0, 0, 1, 1)
    ctxFilterSupport = ctx.getImageData(0, 0, 1, 1).data[0] < 128
  } catch {
    ctxFilterSupport = false
  }
  return ctxFilterSupport
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return [0, 0, 0]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** Monotone cubic (Fritsch-Carlson) curve through points -> 256-entry LUT. */
export function curveToLut(points) {
  const lut = new Uint8Array(256)
  if (!points || points.length < 2) {
    for (let i = 0; i < 256; i++) lut[i] = i
    return lut
  }
  const pts = [...points].sort((a, b) => a[0] - b[0])
  const n = pts.length
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const d = []
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(1e-6, xs[i + 1] - xs[i]))
  const m = new Array(n)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]
      m[i + 1] = t * b * d[i]
    }
  }
  let seg = 0
  for (let x = 0; x < 256; x++) {
    if (x <= xs[0]) {
      lut[x] = clamp255(ys[0])
      continue
    }
    if (x >= xs[n - 1]) {
      lut[x] = clamp255(ys[n - 1])
      continue
    }
    while (seg < n - 2 && x > xs[seg + 1]) seg++
    const h = xs[seg + 1] - xs[seg]
    const t = (x - xs[seg]) / h
    const t2 = t * t
    const t3 = t2 * t
    const y = (2 * t3 - 3 * t2 + 1) * ys[seg] + (t3 - 2 * t2 + t) * h * m[seg] + (-2 * t3 + 3 * t2) * ys[seg + 1] + (t3 - t2) * h * m[seg + 1]
    lut[x] = clamp255(y)
  }
  return lut
}
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v))

/** Parse an Adobe/Resolve .cube 3D LUT. Returns { size, data: Float32Array(rgb...) , title }. */
export function parseCube(text) {
  let size = 0
  let title = ''
  const values = []
  let domainMin = [0, 0, 0]
  let domainMax = [1, 1, 1]
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('TITLE')) title = line.replace(/^TITLE\s+/, '').replace(/"/g, '')
    else if (line.startsWith('LUT_3D_SIZE')) size = parseInt(line.split(/\s+/)[1], 10)
    else if (line.startsWith('LUT_1D_SIZE')) throw new Error('1D LUTs are not supported, use a 3D .cube file')
    else if (line.startsWith('DOMAIN_MIN')) domainMin = line.split(/\s+/).slice(1).map(Number)
    else if (line.startsWith('DOMAIN_MAX')) domainMax = line.split(/\s+/).slice(1).map(Number)
    else if (/^[-\d.eE+]/.test(line)) {
      const parts = line.split(/\s+/).map(Number)
      if (parts.length >= 3) values.push(parts[0], parts[1], parts[2])
    }
  }
  if (!size || size < 2 || size > 128) throw new Error('Missing or invalid LUT_3D_SIZE')
  if (values.length !== size * size * size * 3) throw new Error(`Expected ${size ** 3} entries, found ${values.length / 3}`)
  const data = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) {
    const c = i % 3
    data[i] = (values[i] - domainMin[c]) / (domainMax[c] - domainMin[c] || 1)
  }
  return { size, data, title }
}

const LUMA = [0.2126, 0.7152, 0.0722]
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Build a per-pixel grading function that mirrors the WebGL shader.
 * Works on 0..1 floats. Returns fn(r,g,b,u,v,rand) -> [r,g,b,alphaMul]
 */
export function makeGrader(f, { curveLut, lut3d } = {}) {
  const exp = (Math.pow(2, f.exposure || 0) * (f.brightness ?? 100)) / 100
  const con = (f.contrast ?? 100) / 100
  const sat = (f.saturate ?? 100) / 100
  const vib = (f.vibrance || 0) / 100
  const temp = ((f.temperature || 0) / 100) * 0.15
  const tint = ((f.tint || 0) / 100) * 0.15
  const gam = 1 / Math.max(0.05, f.gamma || 1)
  const hi = ((f.highlights || 0) / 100) * 0.25
  const sh = ((f.shadows || 0) / 100) * 0.25
  const gray = (f.grayscale || 0) / 100
  const sep = (f.sepia || 0) / 100
  const inv = (f.invert || 0) / 100
  const vig = (f.vignette || 0) / 100
  const grain = ((f.grain || 0) / 100) * 0.2
  const lb = (f.levelsBlack ?? 0) / 255
  const lw = Math.max(lb + 1 / 255, (f.levelsWhite ?? 255) / 255)
  const lm = 1 / Math.max(0.05, f.levelsMid ?? 1)
  const a = Math.cos(((f.hue || 0) * Math.PI) / 180)
  const b = Math.sin(((f.hue || 0) * Math.PI) / 180)
  const H = [
    0.213 + a * 0.787 - b * 0.213,
    0.715 - a * 0.715 - b * 0.715,
    0.072 - a * 0.072 + b * 0.928,
    0.213 - a * 0.213 + b * 0.143,
    0.715 + a * 0.285 + b * 0.14,
    0.072 - a * 0.072 - b * 0.283,
    0.213 - a * 0.213 - b * 0.787,
    0.715 - a * 0.715 + b * 0.715,
    0.072 + a * 0.928 + b * 0.072,
  ]
  const useHue = (f.hue || 0) !== 0
  const lutStr = (f.lutStrength ?? 100) / 100
  const key = hexToRgb(f.chromaColor).map((v) => v / 255)
  const tol = ((f.chromaTolerance ?? 30) / 100) * 0.9
  const soft = Math.max(0.001, ((f.chromaSoftness ?? 10) / 100) * 0.5)
  const opacity = (f.opacity ?? 100) / 100
  const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)

  return function grade(r, g, bl, u, v, rnd) {
    r *= exp
    g *= exp
    bl *= exp
    r += temp
    bl -= temp
    g -= tint
    r = (r - 0.5) * con + 0.5
    g = (g - 0.5) * con + 0.5
    bl = (bl - 0.5) * con + 0.5
    let l = cl(r * LUMA[0] + g * LUMA[1] + bl * LUMA[2])
    if (hi || sh) {
      const add = sh * (1 - smoothstep(0, 0.5, l)) + hi * smoothstep(0.5, 1, l)
      r += add
      g += add
      bl += add
    }
    r = cl(r)
    g = cl(g)
    bl = cl(bl)
    if (lb !== 0 || lw !== 1 || lm !== 1) {
      r = Math.pow(cl((r - lb) / (lw - lb)), lm)
      g = Math.pow(cl((g - lb) / (lw - lb)), lm)
      bl = Math.pow(cl((bl - lb) / (lw - lb)), lm)
    }
    if (gam !== 1) {
      r = Math.pow(r, gam)
      g = Math.pow(g, gam)
      bl = Math.pow(bl, gam)
    }
    l = r * LUMA[0] + g * LUMA[1] + bl * LUMA[2]
    let s = sat
    if (vib) {
      const mx = Math.max(r, g, bl),
        mn = Math.min(r, g, bl)
      s *= 1 + vib * (1 - (mx - mn))
    }
    if (s !== 1) {
      r = l + (r - l) * s
      g = l + (g - l) * s
      bl = l + (bl - l) * s
    }
    if (useHue) {
      const nr = H[0] * r + H[1] * g + H[2] * bl
      const ng = H[3] * r + H[4] * g + H[5] * bl
      const nb = H[6] * r + H[7] * g + H[8] * bl
      r = nr
      g = ng
      bl = nb
    }
    if (gray) {
      const y = r * LUMA[0] + g * LUMA[1] + bl * LUMA[2]
      r += (y - r) * gray
      g += (y - g) * gray
      bl += (y - bl) * gray
    }
    if (sep) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * bl
      const sg = 0.349 * r + 0.686 * g + 0.168 * bl
      const sb = 0.272 * r + 0.534 * g + 0.131 * bl
      r += (sr - r) * sep
      g += (sg - g) * sep
      bl += (sb - bl) * sep
    }
    if (inv) {
      r += (1 - 2 * r) * inv
      g += (1 - 2 * g) * inv
      bl += (1 - 2 * bl) * inv
    }
    r = cl(r)
    g = cl(g)
    bl = cl(bl)
    if (curveLut) {
      r = curveLut[Math.round(r * 255)] / 255
      g = curveLut[Math.round(g * 255)] / 255
      bl = curveLut[Math.round(bl * 255)] / 255
    }
    if (lut3d) {
      const [lr, lg, lbb] = sampleLut3d(lut3d, r, g, bl)
      r += (lr - r) * lutStr
      g += (lg - g) * lutStr
      bl += (lbb - bl) * lutStr
    }
    if (vig) {
      const dx = u - 0.5,
        dy = v - 0.5
      const d = Math.sqrt(dx * dx + dy * dy) * 1.4142
      const k = 1 - vig * smoothstep(0.4, 1.0, d)
      r *= k
      g *= k
      bl *= k
    }
    if (grain) {
      const n = (rnd - 0.5) * grain
      r += n
      g += n
      bl += n
    }
    let alpha = opacity
    if (f.chromaEnabled) {
      const dr = r - key[0],
        dg = g - key[1],
        db = bl - key[2]
      const dist = Math.sqrt(dr * dr + dg * dg + db * db)
      alpha *= smoothstep(tol, tol + soft, dist)
    }
    return [cl(r), cl(g), cl(bl), alpha]
  }
}

function sampleLut3d({ size, data }, r, g, b) {
  const s = size - 1
  const x = r * s,
    y = g * s,
    z = b * s
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    z0 = Math.floor(z)
  const x1 = Math.min(s, x0 + 1),
    y1 = Math.min(s, y0 + 1),
    z1 = Math.min(s, z0 + 1)
  const fx = x - x0,
    fy = y - y0,
    fz = z - z0
  const idx = (xi, yi, zi) => ((zi * size + yi) * size + xi) * 3
  const out = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    const c000 = data[idx(x0, y0, z0) + c],
      c100 = data[idx(x1, y0, z0) + c]
    const c010 = data[idx(x0, y1, z0) + c],
      c110 = data[idx(x1, y1, z0) + c]
    const c001 = data[idx(x0, y0, z1) + c],
      c101 = data[idx(x1, y0, z1) + c]
    const c011 = data[idx(x0, y1, z1) + c],
      c111 = data[idx(x1, y1, z1) + c]
    const c00 = c000 + (c100 - c000) * fx,
      c10 = c010 + (c110 - c010) * fx
    const c01 = c001 + (c101 - c001) * fx,
      c11 = c011 + (c111 - c011) * fx
    const c0 = c00 + (c10 - c00) * fy,
      c1 = c01 + (c11 - c01) * fy
    out[c] = c0 + (c1 - c0) * fz
  }
  return out
}

/** Spatial pre-pass in JS: box blur (3 passes approx gaussian) and unsharp-mask sharpen. */
function spatial(img, f) {
  const { width: w, height: h, data } = img
  if (f.blur > 0) {
    const r = Math.max(1, Math.round(f.blur / 2))
    for (let pass = 0; pass < 3; pass++) boxBlur(data, w, h, r)
  }
  if (f.sharpen > 0) {
    const amt = (f.sharpen / 100) * 1.5
    const src = new Uint8ClampedArray(data)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = (y * w + x) * 4
        for (let c = 0; c < 3; c++) {
          const lap = 4 * src[i + c] - src[i - 4 + c] - src[i + 4 + c] - src[i - w * 4 + c] - src[i + w * 4 + c]
          data[i + c] = src[i + c] + lap * amt * 0.25
        }
      }
    }
  }
}

function boxBlur(data, w, h, r) {
  const tmp = new Float32Array(w * h * 4)
  const win = r * 2 + 1
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 4; c++) {
      let acc = 0
      for (let k = -r; k <= r; k++) acc += data[(y * w + Math.min(w - 1, Math.max(0, k))) * 4 + c]
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = acc / win
        const out = Math.max(0, x - r),
          inn = Math.min(w - 1, x + r + 1)
        acc += data[(y * w + inn) * 4 + c] - data[(y * w + out) * 4 + c]
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      let acc = 0
      for (let k = -r; k <= r; k++) acc += tmp[(Math.min(h - 1, Math.max(0, k)) * w + x) * 4 + c]
      for (let y = 0; y < h; y++) {
        data[(y * w + x) * 4 + c] = acc / win
        const out = Math.max(0, y - r),
          inn = Math.min(h - 1, y + r + 1)
        acc += tmp[(inn * w + x) * 4 + c] - tmp[(out * w + x) * 4 + c]
      }
    }
  }
}

/** Apply the full filter stack to ImageData in place (CPU path; mirrors the shader). */
export function applyFiltersToImageData(img, f, extras = {}) {
  if (!f || isDefaultFilters(f)) return img
  spatial(img, f)
  const curveLut = f.curve && !isIdentityCurve(f.curve) ? curveToLut(f.curve) : null
  const grade = makeGrader(f, { curveLut, lut3d: extras.lut3d })
  const { width: w, height: h, data } = img
  let seed = 1234567
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const [r, g, b, am] = grade(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, (x + 0.5) / w, v, f.grain ? rand() : 0.5)
      data[i] = r * 255
      data[i + 1] = g * 255
      data[i + 2] = b * 255
      data[i + 3] = data[i + 3] * am
    }
  }
  return img
}

/** White balance from a picked neutral color: returns {temperature, tint}. */
export function whiteBalanceFrom([r, g, b], current = {}) {
  const R = r / 255,
    G = g / 255,
    B = b / 255
  const k = (B - R) / 2
  const m = G - (R + B) / 2
  const clampN = (x) => Math.max(-100, Math.min(100, Math.round(x)))
  return {
    temperature: clampN((current.temperature || 0) + (k / 0.15) * 100),
    tint: clampN((current.tint || 0) + (m / 0.15) * 100),
  }
}

/** Auto levels from a luma histogram (256 bins): clip 0.5% at each end. */
export function autoLevelsFromHistogram(hist, clip = 0.005) {
  const total = hist.reduce((a, b) => a + b, 0) || 1
  let acc = 0,
    black = 0,
    white = 255
  for (let i = 0; i < 256; i++) {
    acc += hist[i]
    if (acc / total > clip) {
      black = i
      break
    }
  }
  acc = 0
  for (let i = 255; i >= 0; i--) {
    acc += hist[i]
    if (acc / total > clip) {
      white = i
      break
    }
  }
  if (white - black < 10) return { levelsBlack: 0, levelsWhite: 255 }
  return { levelsBlack: Math.min(black, 100), levelsWhite: Math.max(white, 155) }
}

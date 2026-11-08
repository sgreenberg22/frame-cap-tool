// Pure GIF helpers shared by the worker and tests.

/** Subsample pixels across frames for a shared palette. */
export function samplePixels(frames, maxPixels = 1_000_000) {
  const total = frames.reduce((a, f) => a + f.length / 4, 0)
  const step = Math.max(1, Math.ceil(total / maxPixels))
  const out = new Uint8ClampedArray(Math.ceil(total / step) * 4 + 4)
  let o = 0
  let k = 0
  for (const f of frames) {
    for (let p = 0; p < f.length; p += 4, k++) {
      if (k % step) continue
      out[o++] = f[p]
      out[o++] = f[p + 1]
      out[o++] = f[p + 2]
      out[o++] = 255
    }
  }
  return out.subarray(0, o)
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5) * 48)

/**
 * Map RGBA pixels to palette indices, with optional dithering and alpha -> transparent index.
 * paletteSize limits which palette entries are candidates (excludes reserved transparent slot).
 */
export function mapToPalette(rgba, w, h, palette, { dither = 'none', transparentIndex = -1, alphaThreshold = 128, paletteSize } = {}) {
  const n = paletteSize ?? palette.length
  const cache = new Int16Array(65536).fill(-1)
  const nearest = (r, g, b) => {
    r = r < 0 ? 0 : r > 255 ? 255 : r
    g = g < 0 ? 0 : g > 255 ? 255 : g
    b = b < 0 ? 0 : b > 255 ? 255 : b
    const key = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)
    const c = cache[key]
    if (c >= 0) return c
    let best = 0
    let bd = Infinity
    for (let i = 0; i < n; i++) {
      const p = palette[i]
      const dr = p[0] - r,
        dg = p[1] - g,
        db = p[2] - b
      const d = dr * dr * 2 + dg * dg * 4 + db * db * 3
      if (d < bd) {
        bd = d
        best = i
      }
    }
    cache[key] = best
    return best
  }
  const out = new Uint8Array(w * h)
  if (dither === 'floyd') {
    const err = new Float32Array(w * h * 3)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x
        const i = p * 4
        if (transparentIndex >= 0 && rgba[i + 3] < alphaThreshold) {
          out[p] = transparentIndex
          continue
        }
        const r = rgba[i] + err[p * 3],
          g = rgba[i + 1] + err[p * 3 + 1],
          b = rgba[i + 2] + err[p * 3 + 2]
        const idx = nearest(Math.round(r), Math.round(g), Math.round(b))
        out[p] = idx
        const pc = palette[idx]
        const er = r - pc[0],
          eg = g - pc[1],
          eb = b - pc[2]
        const spread = (dx, dy, k) => {
          const nx = x + dx,
            ny = y + dy
          if (nx < 0 || nx >= w || ny >= h) return
          const q = (ny * w + nx) * 3
          err[q] += er * k
          err[q + 1] += eg * k
          err[q + 2] += eb * k
        }
        spread(1, 0, 7 / 16)
        spread(-1, 1, 3 / 16)
        spread(0, 1, 5 / 16)
        spread(1, 1, 1 / 16)
      }
    }
    return out
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      const i = p * 4
      if (transparentIndex >= 0 && rgba[i + 3] < alphaThreshold) {
        out[p] = transparentIndex
        continue
      }
      const t = dither === 'ordered' ? BAYER4[(y & 3) * 4 + (x & 3)] : 0
      out[p] = nearest(Math.round(rgba[i] + t), Math.round(rgba[i + 1] + t), Math.round(rgba[i + 2] + t))
    }
  }
  return out
}

/** Replace pixels unchanged from the previous composite with the transparent index. */
export function diffOptimize(idx, prevComposite, transparentIndex) {
  const out = new Uint8Array(idx.length)
  for (let p = 0; p < idx.length; p++) out[p] = idx[p] === prevComposite[p] ? transparentIndex : idx[p]
  return out
}

/** Rough GIF size estimate in bytes (for UI only). */
export function estimateGifBytes({ width, height, frames, colors = 256, optimize = false, dither = 'none' }) {
  const bitsPerPixel = Math.max(1, Math.log2(colors)) * 0.55 * (dither === 'none' ? 1 : 1.35)
  const perFrame = (width * height * bitsPerPixel) / 8
  const factor = optimize ? 0.55 : 1
  return Math.round(800 + frames * (perFrame * factor + 20) + 768)
}

/** Expand a frame list with reverse/ping-pong/speed settings. */
export function arrangeFrames(frames, { order = 'forward', speed = 1 } = {}) {
  let list = frames.map((f) => ({ ...f, delay: Math.max(20, Math.round((f.delay || 100) / Math.max(0.05, speed))) }))
  if (order === 'reverse') list = list.reverse()
  if (order === 'pingpong' && list.length > 2) list = list.concat(list.slice(1, -1).reverse())
  return list
}

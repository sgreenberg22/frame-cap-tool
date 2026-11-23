import { describe, expect, it } from 'vitest'
import { findSource, heal, maskBounds } from './heal'

// A textured, tileable picture (period 16) with a gentle brightness ramp.
function textured(w, h) {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const t = 100 + 50 * Math.sin(((x % 16) / 16) * Math.PI * 2) * Math.cos(((y % 16) / 16) * Math.PI * 2) + x * 0.2
      data.set([t, t * 0.9, t * 0.8, 255], (y * w + x) * 4)
    }
  return { data, width: w, height: h }
}
const blob = (w, h, cx, cy, r) => {
  const m = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot(x - cx, y - cy) <= r) m[y * w + x] = 255
  return m
}
const applyPatch = (img, p) => {
  const out = { ...img, data: new Uint8ClampedArray(img.data) }
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const a = p.data[(y * p.w + x) * 4 + 3] / 255
      if (!a) continue
      const gi = ((p.y + y) * img.width + p.x + x) * 4
      for (let c = 0; c < 3; c++) out.data[gi + c] = img.data[gi + c] * (1 - a) + p.data[(y * p.w + x) * 4 + c] * a
    }
  return out
}
const err = (a, b, mask) => {
  let e = 0
  let n = 0
  for (let i = 0; i < mask.length; i++)
    if (mask[i]) {
      for (let c = 0; c < 3; c++) e += Math.abs(a.data[i * 4 + c] - b.data[i * 4 + c])
      n += 3
    }
  return e / n
}

describe('heal', () => {
  const w = 160
  const h = 120
  const clean = textured(w, h)
  const mask = blob(w, h, 80, 60, 7)
  const blemished = { ...clean, data: new Uint8ClampedArray(clean.data) }
  for (let i = 0; i < mask.length; i++) if (mask[i]) blemished.data.set([20, 10, 10, 255], i * 4) // dark spot

  it('finds the mask bounds', () => {
    expect(maskBounds(mask, w, h, 0)).toEqual({ x: 73, y: 53, w: 15, h: 15 })
    expect(maskBounds(new Uint8Array(w * h), w, h)).toBeNull()
  })
  it('restores a blemish almost exactly when given a matching source offset', () => {
    const fixed = applyPatch(blemished, heal(blemished, mask, { dx: 16, dy: 0 }))
    expect(err(fixed, clean, mask)).toBeLessThan(6)
    expect(err(blemished, clean, mask)).toBeGreaterThan(60)
  })
  it('picks a good source by itself', () => {
    const fixed = applyPatch(blemished, heal(blemished, mask))
    expect(err(fixed, clean, mask)).toBeLessThan(25)
  })
  it('never picks a source that overlaps the mask or leaves the picture', () => {
    const s = findSource(blemished, mask, maskBounds(mask, w, h, 0))
    expect(s).not.toBeNull()
    const b = maskBounds(mask, w, h, 0)
    expect(b.x + s.dx).toBeGreaterThanOrEqual(0)
    expect(b.x + b.w + s.dx).toBeLessThanOrEqual(w)
  })
  it('matches the surrounding tone even when the source is darker', () => {
    // Left half bright, right half dark: heal bright area from the dark side.
    const img = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.data.set(x < 80 ? [200, 200, 200, 255] : [60, 60, 60, 255], (y * w + x) * 4)
    const m = blob(w, h, 40, 60, 5)
    const fixed = applyPatch(img, heal(img, m, { dx: 70, dy: 0 }))
    expect(Math.abs(fixed.data[(60 * w + 40) * 4] - 200)).toBeLessThan(6)
  })
})

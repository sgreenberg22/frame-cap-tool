/**
 * Healing brush. Copies texture from a nearby source area and matches its colour and tone to
 * the surroundings by solving for a smooth correction (Laplace / "seamless clone"), so blemishes,
 * dust and wires disappear without a visible patch edge.
 *
 * img: { data: RGBA, width, height }; mask: Uint8Array (width*height), >0 where to heal.
 */

export function maskBounds(mask, w, h, pad = 0) {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > 0) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  return {
    x: Math.max(0, x0 - pad),
    y: Math.max(0, y0 - pad),
    w: Math.min(w, x1 + 1 + pad) - Math.max(0, x0 - pad),
    h: Math.min(h, y1 + 1 + pad) - Math.max(0, y0 - pad),
  }
}

/** Pick the source offset whose surroundings best match the ring around the masked area. */
export function findSource(img, mask, box) {
  const { width: w, height: h, data: d } = img
  const ring = []
  const R = 4
  for (let y = Math.max(0, box.y - R); y < Math.min(h, box.y + box.h + R); y++) {
    for (let x = Math.max(0, box.x - R); x < Math.min(w, box.x + box.w + R); x++) {
      if (mask[y * w + x] > 0) continue
      let near = false
      for (let dy = -R; dy <= R && !near; dy += 2)
        for (let dx = -R; dx <= R; dx += 2)
          if (mask[Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))] > 0) {
            near = true
            break
          }
      if (near) ring.push(y * w + x)
    }
  }
  if (!ring.length) return null
  const step = Math.max(1, Math.floor(ring.length / 400))
  const sample = ring.filter((_, i) => i % step === 0)
  const size = Math.max(box.w, box.h)
  let best = null
  for (const radius of [1.3, 2, 3, 4.5, 7]) {
    for (let a = 0; a < 28; a++) {
      const ang = (a / 28) * Math.PI * 2
      const dx = Math.round(Math.cos(ang) * (size * radius + R + 6))
      const dy = Math.round(Math.sin(ang) * (size * radius + R + 6))
      // The whole source footprint (including its ring) must stay inside the picture.
      if (box.x + dx - R < 0 || box.y + dy - R < 0 || box.x + dx + box.w + R > w || box.y + dy + box.h + R > h) continue
      let ok = true
      let mean = [0, 0, 0]
      for (const p of sample) {
        const x = p % w
        const y = (p / w) | 0
        const q = ((y + dy) * w + (x + dx)) * 4
        if (mask[(y + dy) * w + (x + dx)] > 0) {
          ok = false
          break
        }
        for (let c = 0; c < 3; c++) mean[c] += d[p * 4 + c] - d[q + c]
      }
      if (!ok) continue
      mean = mean.map((m) => m / sample.length)
      let err = 0
      for (const p of sample) {
        const x = p % w
        const y = (p / w) | 0
        const q = ((y + dy) * w + (x + dx)) * 4
        for (let c = 0; c < 3; c++) err += (d[p * 4 + c] - d[q + c] - mean[c]) ** 2
      }
      if (!best || err < best.err) best = { dx, dy, err }
    }
  }
  return best && { dx: best.dx, dy: best.dy }
}

/**
 * Returns { x, y, w, h, data } where data is RGBA for the patch over the masked bounding box;
 * alpha follows the mask (so soft brush edges blend), ready to be laid over the original.
 */
export function heal(img, mask, offset = null) {
  const { width: w, height: h, data: d } = img
  const box = maskBounds(mask, w, h, 1)
  if (!box) return null
  const off = offset || findSource(img, mask, maskBounds(mask, w, h, 0))
  if (!off) throw new Error('Could not find a good area to copy from. Try Alt-click to choose a source.')
  const { dx, dy } = off
  const clampX = (x) => (x < 0 ? 0 : x >= w ? w - 1 : x)
  const clampY = (y) => (y < 0 ? 0 : y >= h ? h - 1 : y)
  const bw = box.w + 2
  const bh = box.h + 2
  const ox = box.x - 1
  const oy = box.y - 1
  const diff = new Float32Array(bw * bh * 3)
  const inside = new Uint8Array(bw * bh)
  const srcAt = (x, y, c) => d[(clampY(y + dy) * w + clampX(x + dx)) * 4 + c]
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const gx = ox + x
      const gy = oy + y
      const i = y * bw + x
      if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue
      inside[i] = mask[gy * w + gx] >= 128 ? 1 : 0
      for (let c = 0; c < 3; c++) diff[i * 3 + c] = d[(gy * w + gx) * 4 + c] - srcAt(gx, gy, c)
    }
  }
  // Fill the unknown (masked) correction by relaxing towards the average of its neighbours (SOR).
  const iters = Math.min(600, 3 * Math.max(bw, bh) + 40)
  const omega = 1.85
  for (let it = 0; it < iters; it++) {
    for (let y = 1; y < bh - 1; y++) {
      for (let x = 1; x < bw - 1; x++) {
        const i = y * bw + x
        if (!inside[i]) continue
        for (let c = 0; c < 3; c++) {
          const avg = (diff[(i - 1) * 3 + c] + diff[(i + 1) * 3 + c] + diff[(i - bw) * 3 + c] + diff[(i + bw) * 3 + c]) / 4
          diff[i * 3 + c] += omega * (avg - diff[i * 3 + c])
        }
      }
    }
  }
  const out = new Uint8ClampedArray(bw * bh * 4)
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const gx = ox + x
      const gy = oy + y
      if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue
      const m = mask[gy * w + gx]
      if (!m) continue
      const i = y * bw + x
      const o = i * 4
      // Outside the hard core (soft edge) the correction is the nearest known value, which is the real difference.
      for (let c = 0; c < 3; c++) out[o + c] = srcAt(gx, gy, c) + diff[i * 3 + c]
      out[o + 3] = m
    }
  }
  return { x: ox, y: oy, w: bw, h: bh, data: out }
}

import { describe, expect, it } from 'vitest'
import { estimateTilt } from './autoStraighten'

// Smooth (anti-aliased) lines like a real photo; hard 1px staircases would bias edges towards 0°.
function lines(w, h, deg, vertical = false) {
  const g = new Float32Array(w * h).fill(40)
  const t = Math.tan((deg * Math.PI) / 180)
  for (const base of [40, 100, 160]) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = vertical ? x - (base + y * t) : y - (base + x * t)
        g[y * w + x] = Math.max(g[y * w + x], 40 + 190 * Math.exp(-(d * d) / 4))
      }
    }
  }
  return g
}

describe('estimateTilt', () => {
  it('finds a clockwise-tilted horizon and returns the counter-rotation', () => {
    const { angle, confidence } = estimateTilt(lines(300, 200, 5), 300, 200)
    expect(angle).toBeCloseTo(-5, 0)
    expect(confidence).toBeGreaterThan(0.3)
  })
  it('handles a tilt the other way', () => {
    expect(estimateTilt(lines(300, 200, -3), 300, 200).angle).toBeCloseTo(3, 0)
  })
  it('works on near-vertical lines', () => {
    // A vertical line whose top leans left (counter-clockwise) needs a clockwise correction.
    expect(Math.abs(estimateTilt(lines(300, 300, 4, true), 300, 300).angle - 4)).toBeLessThan(1)
  })
  it('reports no confidence on a flat image', () => {
    const r = estimateTilt(new Float32Array(100 * 100).fill(90), 100, 100)
    expect(r.angle).toBe(0)
    expect(r.confidence).toBe(0)
  })
})

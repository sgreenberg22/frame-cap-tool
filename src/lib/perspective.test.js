import { describe, expect, it } from 'vitest'
import { isValidQuad, project, quadSize, solveHomography, warpPerspective } from './perspective'

describe('perspective', () => {
  it('homography maps the source points onto the destination points', () => {
    const src = [
      [10, 5],
      [90, 15],
      [100, 80],
      [0, 70],
    ]
    const dst = [
      [0, 0],
      [100, 0],
      [100, 60],
      [0, 60],
    ]
    const H = solveHomography(src, dst)
    src.forEach((p, i) => {
      const [x, y] = project(H, ...p)
      expect(x).toBeCloseTo(dst[i][0], 5)
      expect(y).toBeCloseTo(dst[i][1], 5)
    })
  })
  it('identity quad returns the same pixels', () => {
    const w = 8
    const h = 6
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) data.set([i * 4, 255 - i * 4, 7, 255], i * 4)
    const out = warpPerspective(
      { data, width: w, height: h },
      [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
      ],
      w,
      h,
    )
    expect([...out.data]).toEqual([...data])
  })
  it('flattens a trapezoid: a bright band stays one straight row', () => {
    const w = 100
    const h = 100
    const data = new Uint8ClampedArray(w * h * 4).fill(255)
    // Draw in the source along the slanted line from (10,30) to (90,40)
    for (let x = 10; x <= 90; x++) {
      const y = Math.round(30 + ((x - 10) / 80) * 10)
      for (let dy = -1; dy <= 1; dy++) data.set([0, 0, 0, 255], ((y + dy) * w + x) * 4)
    }
    const quad = [
      [10, 30],
      [90, 40],
      [90, 80],
      [10, 80],
    ]
    const out = warpPerspective({ data, width: w, height: h }, quad, 80, 50)
    const darkRows = new Set()
    for (let y = 0; y < 50; y++) for (let x = 5; x < 75; x++) if (out.data[(y * 80 + x) * 4] < 100) darkRows.add(y)
    expect(Math.max(...darkRows) - Math.min(...darkRows)).toBeLessThanOrEqual(3)
  })
  it('validates quads and measures output size', () => {
    expect(
      isValidQuad([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
    ).toBe(true)
    expect(
      isValidQuad([
        [0, 0],
        [10, 10],
        [10, 0],
        [0, 10],
      ]),
    ).toBe(false) // bow-tie
    expect(
      quadSize([
        [0, 0],
        [100, 0],
        [100, 50],
        [0, 50],
      ]),
    ).toEqual([100, 50])
  })
})

import { autoTone, autoWhiteBalance, cas, deinterlace, denoise, resizeLanczos, runOps, sharpen, smartUpscale, stackFrames } from './enhance'

const make = (w, h, fn) => {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(fn(x, y), (y * w + x) * 4)
  return { data, width: w, height: h }
}
const px = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)]

describe('enhance', () => {
  it('auto tone stretches a flat, dim image to use the full range', () => {
    const img = make(64, 64, (x) => {
      const v = 60 + x
      return [v, v, v, 255]
    })
    autoTone(img)
    expect(px(img, 0, 0)[0]).toBeLessThan(12)
    expect(px(img, 63, 0)[0]).toBeGreaterThan(243)
  })
  it('auto white balance removes a color cast', () => {
    const img = make(32, 32, () => [160, 120, 90, 255])
    autoWhiteBalance(img)
    const [r, g, b] = px(img, 5, 5)
    expect(Math.abs(r - g)).toBeLessThan(4)
    expect(Math.abs(g - b)).toBeLessThan(4)
  })
  it('denoise reduces noise but keeps a hard edge', () => {
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 24
    const img = make(40, 20, (x) => {
      const v = (x < 20 ? 60 : 190) + rnd()
      return [v, v, v, 255]
    })
    const varOf = (im) => {
      let s = 0,
        s2 = 0,
        n = 0
      for (let y = 2; y < 18; y++)
        for (let x = 2; x < 16; x++) {
          const v = px(im, x, y)[0]
          s += v
          s2 += v * v
          n++
        }
      return s2 / n - (s / n) ** 2
    }
    const before = varOf(img)
    denoise(img, 0.6)
    expect(varOf(img)).toBeLessThan(before * 0.5)
    expect(px(img, 25, 10)[0] - px(img, 14, 10)[0]).toBeGreaterThan(100)
  })
  it('sharpen and CAS increase edge contrast', () => {
    const edge = () =>
      make(20, 8, (x) => {
        const v = x < 9 ? 90 : x === 9 ? 110 : x === 10 ? 140 : 160
        return [v, v, v, 255]
      })
    const a = sharpen(edge(), 1, 1, 0)
    expect(px(a, 11, 4)[0]).toBeGreaterThan(160)
    const b = cas(edge(), 1)
    expect(px(b, 10, 4)[0] - px(b, 9, 4)[0]).toBeGreaterThan(30)
  })
  it('Lanczos resize hits exact dimensions and preserves flat color', () => {
    const img = make(10, 6, () => [200, 100, 50, 255])
    const out = resizeLanczos(img, 25, 15)
    expect([out.width, out.height]).toEqual([25, 15])
    expect(px(out, 12, 7)).toEqual([200, 100, 50])
    expect(out.data[3]).toBe(255)
    expect(smartUpscale(img, 2).width).toBe(20)
  })
  it('median stack removes a one-frame speck', () => {
    const clean = () => make(4, 4, () => [100, 100, 100, 255])
    const speck = clean()
    speck.data.set([255, 0, 0, 255], 0)
    expect(px(stackFrames([clean(), speck, clean()]), 0, 0)).toEqual([100, 100, 100])
  })
  it('deinterlace rebuilds odd lines', () => {
    const img = make(4, 5, (x, y) => (y % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
    deinterlace(img)
    expect(px(img, 1, 1)).toEqual([0, 0, 0])
  })
  it('runs op lists and rejects unknown ops', () => {
    const img = make(8, 8, () => [10, 20, 30, 255])
    expect(runOps(img, [{ op: 'smartUpscale', scale: 2 }, { op: 'sharpen' }]).width).toBe(16)
    expect(() => runOps(img, [{ op: 'nope' }])).toThrow()
  })
})

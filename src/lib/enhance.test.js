import {
  autoTone,
  autoWhiteBalance,
  colorGrade,
  cas,
  channelCdfs,
  colorMatch,
  deinterlace,
  defringe,
  devignette,
  hslAdjust,
  lensDistortion,
  denoise,
  resizeLanczos,
  runOps,
  sharpen,
  smartUpscale,
  stackFrames,
} from './enhance'

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

describe('colorMatch', () => {
  it('moves a dark, warm image toward the look of a bright, cool reference', () => {
    const ref = make(32, 32, (x) => [100 + x * 4, 150 + x * 3, 200 + x, 255]) // bright, blue-ish ramp
    const dark = make(32, 32, (x) => [10 + x * 3, 5 + x * 2, 3 + x, 255]) // dark ramp
    const out = colorMatch(dark, channelCdfs(ref))
    const mean = (img, c) => {
      let t = 0
      for (let i = c; i < img.data.length; i += 4) t += img.data[i]
      return t / (img.data.length / 4)
    }
    for (const c of [0, 1, 2]) expect(Math.abs(mean(out, c) - mean(ref, c))).toBeLessThan(Math.abs(mean(dark, c) - mean(ref, c)) * 0.2)
  })
  it('is a no-op against itself and respects strength 0', () => {
    const img = make(16, 16, (x, y) => [x * 15, y * 15, (x + y) * 7, 255])
    const same = colorMatch(img, channelCdfs(img))
    const diff = same.data.reduce((a, v, i) => a + Math.abs(v - img.data[i]), 0) / img.data.length
    expect(diff).toBeLessThan(6)
    expect([...colorMatch(img, channelCdfs(make(16, 16, () => [200, 10, 10, 255])), 0).data]).toEqual([...img.data])
  })
})

describe('colour bands and lens fixes', () => {
  it('HSL: desaturating only blues leaves reds alone', () => {
    const img = make(2, 1, (x) => (x ? [200, 40, 40, 255] : [40, 40, 200, 255]))
    hslAdjust(img, { blue: { s: -100 } })
    const [r, g, b] = px(img, 0, 0)
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(25)
    expect(px(img, 1, 0)).toEqual([200, 40, 40])
  })
  it('HSL: hue shift moves green toward yellow', () => {
    const img = make(1, 1, () => [40, 200, 40, 255])
    hslAdjust(img, { green: { h: -100 } })
    const [r, g] = px(img, 0, 0)
    expect(r).toBeGreaterThan(40)
    expect(g).toBeGreaterThan(150)
  })
  it('devignette brightens corners but not the centre', () => {
    const img = make(41, 41, () => [100, 100, 100, 255])
    devignette(img, 0.6)
    expect(px(img, 0, 0)[0]).toBeGreaterThan(130)
    expect(px(img, 20, 20)[0]).toBe(100)
  })
  it('defringe realigns a red channel that was scaled outwards', () => {
    const w = 120
    const h = 80
    const base = (x, y) => (Math.abs(x - 60) % 20 < 4 || Math.abs(y - 40) % 20 < 4 ? 230 : 30)
    const sc = 1.004
    const img = make(w, h, (x, y) => [base(60 + (x - 60) / sc, 40 + (y - 40) / sc), base(x, y), base(x, y), 255])
    const err = (im) => {
      let e = 0
      for (let i = 0; i < w * h; i++) e += Math.abs(im.data[i * 4] - im.data[i * 4 + 1])
      return e
    }
    const before = err(img)
    defringe(img, 1)
    expect(err(img)).toBeLessThan(before)
  })
})

describe('lens distortion', () => {
  const grid = () => make(101, 101, (x, y) => (x % 10 === 0 || y % 10 === 0 ? [255, 255, 255, 255] : [0, 0, 0, 255]))
  it('keeps the centre in place and keeps the size', () => {
    const img = grid()
    lensDistortion(img, 0.6)
    expect(img.width).toBe(101)
    expect(px(img, 50, 50)).toEqual([255, 255, 255])
  })
  it('changes the edges but not when amount is 0', () => {
    const a = grid()
    const b = grid()
    lensDistortion(a, 0)
    lensDistortion(b, 0.6)
    expect([...a.data]).toEqual([...grid().data])
    expect([...b.data]).not.toEqual([...grid().data])
  })
  it('never samples outside the image (no transparent or black fill added)', () => {
    const img = make(60, 40, () => [200, 100, 50, 255])
    lensDistortion(img, -1)
    lensDistortion(img, 1)
    for (let i = 0; i < img.data.length; i += 4) expect([...img.data.slice(i, i + 4)]).toEqual([200, 100, 50, 255])
  })
})

describe('colour grading', () => {
  it('tints shadows blue without touching highlights', () => {
    const img = make(2, 1, (x) => (x ? [240, 240, 240, 255] : [20, 20, 20, 255]))
    colorGrade(img, { shadows: { hue: 240, amount: 100, lum: 0 } })
    const [r, , b] = px(img, 0, 0)
    expect(b).toBeGreaterThan(r + 15)
    expect(px(img, 1, 0)).toEqual([240, 240, 240])
  })
  it('warms highlights only', () => {
    const img = make(2, 1, (x) => (x ? [220, 220, 220, 255] : [25, 25, 25, 255]))
    colorGrade(img, { highlights: { hue: 30, amount: 100, lum: 0 } })
    const [r, , b] = px(img, 1, 0)
    expect(r).toBeGreaterThan(b + 10)
    expect(px(img, 0, 0)).toEqual([25, 25, 25])
  })
  it('lum lifts midtones and does nothing when neutral', () => {
    const a = make(1, 1, () => [128, 128, 128, 255])
    colorGrade(a, { mids: { hue: 0, amount: 0, lum: 60 } })
    expect(px(a, 0, 0)[0]).toBeGreaterThan(160)
    const b = make(1, 1, () => [90, 100, 110, 255])
    colorGrade(b, {})
    expect(px(b, 0, 0)).toEqual([90, 100, 110])
  })
})

import { arrangeFrames, diffOptimize, estimateGifBytes, mapToPalette, samplePixels } from './gifcore'
import { GIFEncoder } from 'gifenc'

describe('gif core', () => {
  const palette = [
    [0, 0, 0],
    [255, 255, 255],
    [255, 0, 0],
  ]
  const rgba = new Uint8ClampedArray([0, 0, 0, 255, 250, 250, 250, 255, 240, 10, 10, 255, 0, 0, 0, 0])
  it('maps to nearest palette colors', () => {
    expect([...mapToPalette(rgba, 4, 1, palette)]).toEqual([0, 1, 2, 0])
  })
  it('maps transparent pixels to the reserved index', () => {
    expect(mapToPalette(rgba, 4, 1, [...palette, [0, 0, 0]], { transparentIndex: 3, paletteSize: 3 })[3]).toBe(3)
  })
  it('dithers without going out of palette', () => {
    for (const dither of ['floyd', 'ordered']) {
      const out = mapToPalette(rgba, 2, 2, palette, { dither })
      expect([...out].every((i) => i < 3)).toBe(true)
    }
  })
  it('marks unchanged pixels transparent', () => {
    expect([...diffOptimize(new Uint8Array([1, 2, 3]), new Uint8Array([1, 0, 3]), 9)]).toEqual([9, 2, 9])
  })
  it('samples pixels with opaque alpha', () => {
    const s = samplePixels([rgba], 2)
    expect(s.length).toBe(8)
    expect(s[3]).toBe(255)
  })
  it('arranges reverse, ping-pong and speed', () => {
    const f = [
      { delay: 100, n: 1 },
      { delay: 100, n: 2 },
      { delay: 100, n: 3 },
    ]
    expect(arrangeFrames(f, { order: 'reverse' }).map((x) => x.n)).toEqual([3, 2, 1])
    expect(arrangeFrames(f, { order: 'pingpong' }).map((x) => x.n)).toEqual([1, 2, 3, 2])
    expect(arrangeFrames(f, { speed: 2 })[0].delay).toBe(50)
    expect(arrangeFrames(f, { speed: 100 })[0].delay).toBe(20)
  })
  it('estimates size monotonically', () => {
    expect(estimateGifBytes({ width: 100, height: 100, frames: 20 })).toBeGreaterThan(estimateGifBytes({ width: 100, height: 100, frames: 10 }))
  })
  it('gifenc writes the dispose option we rely on', () => {
    const enc = GIFEncoder()
    enc.writeFrame(new Uint8Array(4), 2, 2, { palette, delay: 100, dispose: 2, repeat: 0 })
    enc.finish()
    const bytes = enc.bytes()
    const gce = bytes.findIndex((b, i) => b === 0x21 && bytes[i + 1] === 0xf9)
    expect((bytes[gce + 3] >> 2) & 7).toBe(2)
  })
})

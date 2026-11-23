import { describe, expect, it } from 'vitest'
import { clampDelay, floodFillData, hexToRgba, fitRect, fpsToDelay, frameAtTime, moveItem, pingPong, totalDuration, videoSampleTimes } from './anim'

describe('anim helpers', () => {
  it('moves items within bounds', () => {
    expect(moveItem([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
    expect(moveItem([1, 2, 3], 2, 99)).toEqual([1, 2, 3])
    expect(moveItem([1, 2, 3], 1, -5)).toEqual([2, 1, 3])
  })
  it('ping-pong does not repeat the end frames', () => {
    expect(pingPong(['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd', 'c', 'b'])
    expect(pingPong(['a', 'b'])).toEqual(['a', 'b'])
  })
  it('fits a source into a canvas', () => {
    expect(fitRect(200, 100, 100, 100, 'contain')).toEqual({ x: 0, y: 25, w: 100, h: 50 })
    expect(fitRect(200, 100, 100, 100, 'cover')).toEqual({ x: -50, y: 0, w: 200, h: 100 })
    expect(fitRect(200, 100, 100, 100, 'stretch')).toEqual({ x: 0, y: 0, w: 100, h: 100 })
  })
  it('samples a clip at the requested rate and respects the frame cap', () => {
    const t = videoSampleTimes({ start: 1, end: 3, duration: 10, fps: 5 })
    expect(t).toHaveLength(10)
    expect(t[0]).toBe(1)
    expect(t[9]).toBeCloseTo(2.8)
    expect(videoSampleTimes({ duration: 100, fps: 30, maxFrames: 50 })).toHaveLength(50)
    expect(videoSampleTimes({ start: 4, end: 4, duration: 10 })).toEqual([4])
  })
  it('finds the frame at a playback time and loops', () => {
    const f = [{ delay: 100 }, { delay: 300 }, { delay: 100 }]
    expect(totalDuration(f)).toBe(500)
    expect(frameAtTime(f, 0)).toBe(0)
    expect(frameAtTime(f, 99)).toBe(0)
    expect(frameAtTime(f, 100)).toBe(1)
    expect(frameAtTime(f, 399)).toBe(1)
    expect(frameAtTime(f, 450)).toBe(2)
    expect(frameAtTime(f, 520)).toBe(0)
    expect(frameAtTime([], 5)).toBe(0)
  })
  it('keeps delays in GIF-friendly limits', () => {
    expect(clampDelay(3)).toBe(20)
    expect(clampDelay('abc')).toBe(100)
    expect(fpsToDelay(10)).toBe(100)
    expect(fpsToDelay(1000)).toBe(20)
  })
})

describe('flood fill', () => {
  const grid = (w, h, fn) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(fn(x, y), (y * w + x) * 4)
    return d
  }
  it('fills only the connected region, stopping at a line', () => {
    const d = grid(10, 6, (x) => (x === 5 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
    expect(floodFillData(d, 10, 6, 1, 1, [255, 0, 0, 255])).toBe(true)
    expect([...d.slice((2 * 10 + 2) * 4, (2 * 10 + 2) * 4 + 3)]).toEqual([255, 0, 0])
    expect([...d.slice((2 * 10 + 7) * 4, (2 * 10 + 7) * 4 + 3)]).toEqual([255, 255, 255])
    expect([...d.slice((2 * 10 + 5) * 4, (2 * 10 + 5) * 4 + 3)]).toEqual([0, 0, 0])
  })
  it('is a no-op for the same colour or outside the canvas', () => {
    const d = grid(4, 4, () => [10, 20, 30, 255])
    expect(floodFillData(d, 4, 4, 1, 1, [10, 20, 30, 255])).toBe(false)
    expect(floodFillData(d, 4, 4, -1, 9, [1, 1, 1, 255])).toBe(false)
  })
  it('parses hex colours', () => {
    expect(hexToRgba('#ff8000')).toEqual([255, 128, 0, 255])
    expect(hexToRgba('#fff')).toEqual([255, 255, 255, 255])
  })
})

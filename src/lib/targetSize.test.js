import { describe, expect, it } from 'vitest'
import { bitrateForTarget, estimateBytes } from './targetSize'

describe('target file size', () => {
  it('computes a bitrate that round-trips close to the target', () => {
    const bps = bitrateForTarget(8 * 1024 * 1024, 60)
    expect(estimateBytes(bps, 60)).toBeGreaterThan(8 * 1024 * 1024 * 0.97)
    expect(estimateBytes(bps, 60)).toBeLessThanOrEqual(8 * 1024 * 1024 * 1.01)
  })
  it('gives audio-free videos more video bitrate', () => {
    expect(bitrateForTarget(1e7, 30, { hasAudio: false })).toBeGreaterThan(bitrateForTarget(1e7, 30))
  })
  it('clamps to a minimum and rejects bad input', () => {
    expect(bitrateForTarget(1000, 600)).toBe(150000)
    expect(bitrateForTarget(0, 10)).toBeNull()
    expect(bitrateForTarget(1e6, 0)).toBeNull()
  })
})

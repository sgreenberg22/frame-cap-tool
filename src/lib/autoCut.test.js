import { describe, expect, it } from 'vitest'
import { applyCuts, cutsFromSignatures, detectSilences, splitAtTimes } from './autoCut'
import { totalDuration } from './clips'

const clips10 = () => [{ id: 'a', in: 0, out: 10, speed: 1, volume: 1 }]

describe('detectSilences', () => {
  it('finds long quiet runs and keeps padding around speech', () => {
    // 100 buckets over 10 s => 0.1 s each. Quiet from 2.0 s to 5.0 s.
    const peaks = new Float32Array(100).fill(0.5)
    for (let i = 20; i < 50; i++) peaks[i] = 0.01
    const r = detectSilences(peaks, 10, { threshold: 0.05, minSilence: 0.6, pad: 0.1 })
    expect(r).toEqual([{ a: 2.1, b: 4.9 }])
  })
  it('ignores short pauses and handles trailing silence', () => {
    const peaks = new Float32Array(100).fill(0.5)
    for (let i = 10; i < 14; i++) peaks[i] = 0 // 0.4 s: too short
    for (let i = 90; i < 100; i++) peaks[i] = 0 // trailing 1 s
    const r = detectSilences(peaks, 10, { minSilence: 0.6, pad: 0.1 })
    expect(r).toHaveLength(1)
    expect(r[0].b).toBeCloseTo(9.9, 5)
  })
  it('returns nothing for empty input', () => {
    expect(detectSilences(null, 10)).toEqual([])
    expect(detectSilences(new Float32Array(10), 0)).toEqual([])
  })
})

describe('applying cuts', () => {
  it('removes multiple ranges and shortens the total', () => {
    const out = applyCuts(clips10(), [
      { a: 1, b: 2 },
      { a: 5, b: 7 },
    ])
    expect(out.map((c) => [c.in, c.out])).toEqual([
      [0, 1],
      [2, 5],
      [7, 10],
    ])
    expect(totalDuration(out)).toBeCloseTo(7)
  })
  it('splits at several times, ignoring ones too close to an edge', () => {
    const out = splitAtTimes(clips10(), [5, 2, 9.99, 0.01])
    expect(out.map((c) => [c.in, c.out])).toEqual([
      [0, 2],
      [2, 5],
      [5, 10],
    ])
  })
})

describe('cutsFromSignatures', () => {
  const sig = (v) => new Float32Array(16).fill(v)
  it('reports big jumps and enforces a minimum gap', () => {
    const samples = [
      { t: 0, sig: sig(10) },
      { t: 1, sig: sig(10) },
      { t: 2, sig: sig(200) }, // cut
      { t: 2.5, sig: sig(20) }, // jump but within minGap
      { t: 4, sig: sig(20) },
      { t: 5, sig: sig(220) }, // cut
    ]
    expect(cutsFromSignatures(samples, 14, 1)).toEqual([2, 5])
  })
})
